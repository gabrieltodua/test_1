const { Menu, app, shell } = require('electron')

function buildMenu(getTabManager) {
  const isMac = process.platform === 'darwin'

  const send = (channel) => {
    const tm = getTabManager()
    if (tm && !tm.chromeView.webContents.isDestroyed()) tm.chromeView.webContents.send(channel)
  }

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => getTabManager()?.createTab(null) },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const tm = getTabManager()
            if (tm && tm.activeId != null) tm.closeTab(tm.activeId)
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Focus Address Bar', accelerator: 'CmdOrCtrl+L', click: () => send('chrome:focus-address') },
        {
          label: 'Reload Tab',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const tm = getTabManager()
            if (tm && tm.activeId != null) tm.reload(tm.activeId)
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'GAI on GitHub',
          click: async () => {
            const tm = getTabManager()
            if (tm) tm.createTab('https://github.com')
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

module.exports = { buildMenu }
