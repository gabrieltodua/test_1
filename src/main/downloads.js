const fs = require('fs')
const path = require('path')
const { app, ipcMain, shell } = require('electron')

let nextId = 1
const downloadsById = new Map()

function uniqueFilename(dir, filename) {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  let candidate = filename
  let i = 1
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base} (${i})${ext}`
    i += 1
  }
  return candidate
}

function setupDownloads(ses, chromeView) {
  const send = (payload) => {
    if (!chromeView.webContents.isDestroyed()) chromeView.webContents.send('downloads:update', payload)
  }

  ses.on('will-download', (_event, item) => {
    const id = nextId++
    const dir = app.getPath('downloads')
    fs.mkdirSync(dir, { recursive: true })
    const savePath = path.join(dir, uniqueFilename(dir, item.getFilename()))
    item.setSavePath(savePath)
    downloadsById.set(id, item)

    const snapshot = (state) => ({
      id,
      filename: path.basename(savePath),
      state,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      path: savePath
    })

    send(snapshot('progressing'))

    item.on('updated', (_e, state) => send(snapshot(state)))
    item.once('done', (_e, state) => {
      send(snapshot(state === 'completed' ? 'completed' : state))
    })
  })

  ipcMain.handle('downloads:open', (_e, id) => {
    const item = downloadsById.get(id)
    return shell.openPath(item ? item.getSavePath() : '')
  })

  ipcMain.handle('downloads:show', (_e, filePath) => {
    shell.showItemInFolder(filePath)
  })
}

module.exports = { setupDownloads }
