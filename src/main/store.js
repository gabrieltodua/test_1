const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const stateFile = () => path.join(app.getPath('userData'), 'state.json')
const backgroundsDir = () => path.join(app.getPath('userData'), 'backgrounds')

const DEFAULT_SHORTCUTS = [
  { id: 'figma', name: 'Figma', url: 'https://www.figma.com' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com' },
  { id: 'gai-console', name: 'GAI Console', url: 'gai://console' },
  { id: 'github', name: 'GitHub', url: 'https://github.com' },
  { id: 'messenger', name: 'Messenger', url: 'https://www.messenger.com' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com' },
  { id: 'fonts', name: 'Google Fonts', url: 'https://fonts.google.com' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com' },
  { id: 'maps', name: 'Maps', url: 'https://maps.google.com' }
]

function defaults() {
  return {
    theme: {
      mode: 'dark',
      accent: '#5b8cff',
      background: { type: 'default' }
    },
    shortcuts: DEFAULT_SHORTCUTS.map((s) => ({ ...s })),
    tabs: [{ url: null }],
    activeIndex: 0
  }
}

function load() {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf-8')
    const parsed = JSON.parse(raw)
    const base = defaults()
    return {
      ...base,
      ...parsed,
      theme: { ...base.theme, ...(parsed.theme || {}) },
      shortcuts: Array.isArray(parsed.shortcuts) && parsed.shortcuts.length ? parsed.shortcuts : base.shortcuts,
      tabs: Array.isArray(parsed.tabs) && parsed.tabs.length ? parsed.tabs : base.tabs
    }
  } catch {
    return defaults()
  }
}

let saveTimer = null

function writeToDisk(state) {
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
  fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2))
}

function save(state) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      writeToDisk(state)
    } catch (err) {
      console.error('[gai] failed to persist state', err)
    }
  }, 300)
}

function saveNow(state) {
  clearTimeout(saveTimer)
  try {
    writeToDisk(state)
  } catch (err) {
    console.error('[gai] failed to persist state', err)
  }
}

module.exports = { load, save, saveNow, backgroundsDir, DEFAULT_SHORTCUTS }
