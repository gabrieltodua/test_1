const { contextBridge, ipcRenderer } = require('electron')

const on = (channel, callback) => {
  const listener = (_event, ...args) => callback(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('gai', {
  platform: process.platform,

  tabs: {
    create: (url) => ipcRenderer.invoke('tabs:create', url),
    close: (id) => ipcRenderer.invoke('tabs:close', id),
    activate: (id) => ipcRenderer.invoke('tabs:activate', id),
    navigate: (id, input) => ipcRenderer.invoke('tabs:navigate', id, input),
    goBack: (id) => ipcRenderer.invoke('tabs:back', id),
    goForward: (id) => ipcRenderer.invoke('tabs:forward', id),
    reload: (id) => ipcRenderer.invoke('tabs:reload', id),
    stop: (id) => ipcRenderer.invoke('tabs:stop', id),
    onUpdate: (cb) => on('tabs:update', cb),
    onActiveChange: (cb) => on('chrome:active-tab', cb)
  },

  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    set: (theme) => ipcRenderer.invoke('theme:set', theme),
    pickImage: () => ipcRenderer.invoke('theme:pick-image')
  },

  shortcuts: {
    list: () => ipcRenderer.invoke('shortcuts:list'),
    add: (shortcut) => ipcRenderer.invoke('shortcuts:add', shortcut),
    remove: (id) => ipcRenderer.invoke('shortcuts:remove', id)
  },

  downloads: {
    open: (id) => ipcRenderer.invoke('downloads:open', id),
    showInFolder: (path) => ipcRenderer.invoke('downloads:show', path),
    onUpdate: (cb) => on('downloads:update', cb)
  },

  onFocusAddress: (cb) => on('chrome:focus-address', cb)
})
