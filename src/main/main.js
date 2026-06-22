const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { app, BaseWindow, WebContentsView, protocol, net, ipcMain, dialog, session, nativeTheme } = require('electron')

const store = require('./store')
const { TabManager, resolveOmniboxInput } = require('./tabs')
const { setupDownloads } = require('./downloads')
const { buildMenu } = require('./menu')

protocol.registerSchemesAsPrivileged([
  { scheme: 'gai', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

const STATIC_ROOTS = {
  chrome: path.join(__dirname, '..', 'renderer', 'chrome'),
  console: path.join(__dirname, '..', '..', 'resources', 'gai-console')
}

let mainWindow = null
let tabManager = null
let state = null

function registerProtocol() {
  protocol.handle('gai', async (request) => {
    try {
      const url = new URL(request.url)
      const root = url.hostname === 'bg' ? store.backgroundsDir() : STATIC_ROOTS[url.hostname]
      if (!root) return new Response('Not found', { status: 404 })

      let rel = decodeURIComponent(url.pathname)
      if (rel === '' || rel === '/') {
        rel = url.hostname === 'console' ? '/index.html' : '/chrome.html'
      }
      const fullPath = path.normalize(path.join(root, rel))
      if (!fullPath.startsWith(path.normalize(root))) return new Response('Forbidden', { status: 403 })

      return await net.fetch(pathToFileURL(fullPath).toString())
    } catch (err) {
      return new Response('Not found', { status: 404 })
    }
  })
}

function setAppIcon() {
  const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.png')
  if (process.platform === 'darwin' && fs.existsSync(iconPath) && app.dock) {
    try {
      app.dock.setIcon(iconPath)
    } catch {}
  }
}

function persistState(tabsPart) {
  state.tabs = tabsPart.tabs
  state.activeIndex = tabsPart.activeIndex
  store.save(state)
}

function createWindow() {
  const isMac = process.platform === 'darwin'

  mainWindow = new BaseWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 480,
    show: false,
    backgroundColor: state.theme.mode === 'light' ? '#f3f3f6' : '#15161b',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
    titleBarOverlay: !isMac
      ? { color: state.theme.mode === 'light' ? '#f3f3f6' : '#15161b', symbolColor: state.theme.mode === 'light' ? '#1b1c20' : '#e7e8ee', height: 40 }
      : undefined
  })

  const chromeView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'chrome-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  mainWindow.contentView.addChildView(chromeView)
  chromeView.webContents.loadURL('gai://chrome/')
  chromeView.webContents.once('did-finish-load', () => mainWindow.show())

  tabManager = new TabManager(mainWindow, chromeView)
  tabManager.onPersist = persistState

  setupDownloads(session.fromPartition(TabManager.partition), chromeView)

  const initialTabs = state.tabs.length ? state.tabs : [{ url: null }]
  initialTabs.forEach((t, i) => {
    tabManager.createTab(t.url, { activate: i === (state.activeIndex || 0) })
  })
  tabManager.layout()

  mainWindow.on('resize', () => tabManager.layout())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  buildMenu(() => tabManager)
}

function registerIpc() {
  ipcMain.handle('tabs:create', (_e, url) => tabManager.createTab(url || null))
  ipcMain.handle('tabs:close', (_e, id) => tabManager.closeTab(id))
  ipcMain.handle('tabs:activate', (_e, id) => tabManager.activateTab(id))
  ipcMain.handle('tabs:navigate', (_e, id, input) => tabManager.navigate(id, input))
  ipcMain.handle('tabs:back', (_e, id) => tabManager.goBack(id))
  ipcMain.handle('tabs:forward', (_e, id) => tabManager.goForward(id))
  ipcMain.handle('tabs:reload', (_e, id) => tabManager.reload(id))
  ipcMain.handle('tabs:stop', (_e, id) => tabManager.stop(id))

  ipcMain.handle('theme:get', () => state.theme)
  ipcMain.handle('theme:set', (_e, partial) => {
    state.theme = { ...state.theme, ...partial }
    store.save(state)
    return state.theme
  })
  ipcMain.handle('theme:pick-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a background image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const src = result.filePaths[0]
    const ext = path.extname(src) || '.png'
    const destName = `bg-${Date.now()}${ext}`
    const dir = store.backgroundsDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.copyFileSync(src, path.join(dir, destName))
    return `gai://bg/${destName}`
  })

  ipcMain.handle('shortcuts:list', () => state.shortcuts)
  ipcMain.handle('shortcuts:add', (_e, shortcut) => {
    const id = 'custom-' + Date.now()
    const url = resolveOmniboxInput(shortcut.url) || shortcut.url
    state.shortcuts.push({ id, name: shortcut.name || url, url })
    store.save(state)
    return state.shortcuts
  })
  ipcMain.handle('shortcuts:remove', (_e, id) => {
    state.shortcuts = state.shortcuts.filter((s) => s.id !== id)
    store.save(state)
    return state.shortcuts
  })
}

app.whenReady().then(() => {
  const hadExistingState = fs.existsSync(path.join(app.getPath('userData'), 'state.json'))
  state = store.load()
  if (!hadExistingState) {
    state.theme.mode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }

  fs.mkdirSync(store.backgroundsDir(), { recursive: true })
  setAppIcon()
  registerProtocol()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (mainWindow === null) createWindow()
  })
})

app.on('before-quit', () => {
  if (tabManager) store.saveNow({ ...state, ...tabManager.serializeForStore() })
})

app.on('window-all-closed', () => {
  app.quit()
})
