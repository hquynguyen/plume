import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { autostartEnabled, setAutostart } from './autostart'
import { registerIpc } from './ipc'
import { createPanel, openSettings, showPanel, togglePanel } from './window'

let tray: Tray | null = null

function handleArgs(argv: string[], firstLaunch: boolean): void {
  if (argv.includes('--settings')) openSettings()
  else if (argv.includes('--toggle')) togglePanel()
  else if (!firstLaunch || !argv.includes('--hidden')) showPanel()
}

function resource(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name)
}

function buildTray(): void {
  tray = new Tray(nativeImage.createFromPath(resource('tray.png')))
  tray.setToolTip('Plume')
  const menu = (): Menu =>
    Menu.buildFromTemplate([
      { label: 'Open Plume', click: () => showPanel() },
      { label: 'Settings', click: () => openSettings() },
      { type: 'separator' },
      {
        label: 'Start at login',
        type: 'checkbox',
        enabled: app.isPackaged,
        checked: autostartEnabled(),
        click: (item) => {
          setAutostart(item.checked)
          tray?.setContextMenu(menu())
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  tray.setContextMenu(menu())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => handleArgs(argv, false))
  app.on('window-all-closed', () => {
    // Stay resident; the tray and hotkey bring the panel back.
  })
  void app.whenReady().then(() => {
    registerIpc()
    buildTray()
    const panel = createPanel()
    panel.webContents.once('did-finish-load', () => handleArgs(process.argv, true))
  })
}
