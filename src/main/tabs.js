const { WebContentsView, session } = require('electron')

const CHROME_HEIGHT = 84
const CONTENT_PARTITION = 'persist:gai-content'
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

let nextId = 1

function resolveOmniboxInput(raw) {
  const input = String(raw || '').trim()
  if (!input) return null
  if (input.startsWith('gai://')) return input
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) return input
  if (/^localhost(:\d+)?(\/.*)?$/i.test(input)) return 'http://' + input
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(input)) return 'http://' + input
  if (!input.includes(' ') && /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(input)) return 'https://' + input
  return 'https://www.google.com/search?q=' + encodeURIComponent(input)
}

class TabManager {
  constructor(window, chromeView) {
    this.window = window
    this.chromeView = chromeView
    this.tabs = []
    this.activeId = null
    this.onPersist = null
  }

  static get partition() {
    return CONTENT_PARTITION
  }

  list() {
    return this.tabs
  }

  serializeForStore() {
    return {
      tabs: this.tabs.map((t) => ({ url: t.url })),
      activeIndex: Math.max(0, this.tabs.findIndex((t) => t.id === this.activeId))
    }
  }

  createTab(url, { activate = true } = {}) {
    const id = nextId++
    const tab = {
      id,
      view: null,
      url: null,
      title: 'New Tab',
      favicon: null,
      isLoading: false
    }
    this.tabs.push(tab)
    if (url) this.navigate(id, url)
    if (activate || this.activeId == null) this.activateTab(id)
    this.broadcastTabs()
    this.requestPersist()
    return id
  }

  closeTab(id) {
    const idx = this.tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const [tab] = this.tabs.splice(idx, 1)
    if (tab.view) {
      this.window.contentView.removeChildView(tab.view)
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
    }
    if (this.tabs.length === 0) {
      this.createTab(null)
      return
    }
    if (this.activeId === id) {
      const next = this.tabs[idx] || this.tabs[idx - 1] || this.tabs[0]
      this.activateTab(next.id)
    }
    this.broadcastTabs()
    this.requestPersist()
  }

  activateTab(id) {
    if (!this.tabs.some((t) => t.id === id)) return
    this.activeId = id
    this.applyVisibility()
    this.broadcastTabs()
    this.requestPersist()
  }

  navigate(id, rawInput) {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    const target = resolveOmniboxInput(rawInput)
    if (!target) return

    if (!tab.view) {
      tab.view = this.makeContentView()
      this.window.contentView.addChildView(tab.view)
      this.wireViewEvents(tab)
      this.layout()
    }
    tab.url = target
    tab.view.webContents.loadURL(target).catch(() => {})
    this.applyVisibility()
    this.broadcastTabs()
    this.requestPersist()
  }

  goBack(id) {
    const tab = this.tabs.find((t) => t.id === id)
    tab?.view?.webContents.navigationHistory.goBack()
  }

  goForward(id) {
    const tab = this.tabs.find((t) => t.id === id)
    tab?.view?.webContents.navigationHistory.goForward()
  }

  reload(id) {
    const tab = this.tabs.find((t) => t.id === id)
    tab?.view?.webContents.reload()
  }

  stop(id) {
    const tab = this.tabs.find((t) => t.id === id)
    tab?.view?.webContents.stop()
  }

  makeContentView() {
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: CONTENT_PARTITION
      }
    })
    view.webContents.setUserAgent(CHROME_UA)
    view.webContents.setWindowOpenHandler(({ url }) => {
      this.createTab(url)
      return { action: 'deny' }
    })
    return view
  }

  wireViewEvents(tab) {
    const wc = tab.view.webContents
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title
      this.broadcastTabs()
    })
    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons && favicons[0] ? favicons[0] : null
      this.broadcastTabs()
    })
    wc.on('did-start-loading', () => {
      tab.isLoading = true
      this.broadcastTabs()
    })
    wc.on('did-stop-loading', () => {
      tab.isLoading = false
      this.broadcastTabs()
    })
    wc.on('did-navigate', (_e, url) => {
      tab.url = url
      this.broadcastTabs()
      this.requestPersist()
    })
    wc.on('did-navigate-in-page', (_e, url) => {
      tab.url = url
      this.broadcastTabs()
    })
    wc.on('page-title-updated', () => this.requestPersist())
  }

  applyVisibility() {
    for (const t of this.tabs) {
      if (t.view) t.view.setVisible(t.id === this.activeId)
    }
    const active = this.tabs.find((t) => t.id === this.activeId)
    if (!this.chromeView.webContents.isDestroyed()) {
      this.chromeView.webContents.send('chrome:active-tab', active ? active.id : null, !active || !active.view)
    }
  }

  layout() {
    if (this.window.isDestroyed()) return
    const [w, h] = this.window.getContentSize()
    // Chrome view spans the full window: its own CSS reserves the top CHROME_HEIGHT px for the
    // tab strip + toolbar and renders the new-tab-page in the rest. Per-tab content views (added
    // later, so they stack above the chrome view) cover only the area below the toolbar, and are
    // only visible for the active tab — when an active tab has no content view yet, the chrome
    // view's own new-tab-page shows through underneath.
    this.chromeView.setBounds({ x: 0, y: 0, width: w, height: h })
    for (const t of this.tabs) {
      if (t.view) t.view.setBounds({ x: 0, y: CHROME_HEIGHT, width: w, height: Math.max(0, h - CHROME_HEIGHT) })
    }
  }

  broadcastTabs() {
    if (this.chromeView.webContents.isDestroyed()) return
    const payload = this.tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      isLoading: t.isLoading,
      isNewTab: !t.view,
      canGoBack: t.view ? t.view.webContents.navigationHistory.canGoBack() : false,
      canGoForward: t.view ? t.view.webContents.navigationHistory.canGoForward() : false
    }))
    this.chromeView.webContents.send('tabs:update', { tabs: payload, activeId: this.activeId })
  }

  requestPersist() {
    if (this.onPersist) this.onPersist(this.serializeForStore())
  }
}

module.exports = { TabManager, resolveOmniboxInput, CHROME_HEIGHT, CONTENT_PARTITION }
