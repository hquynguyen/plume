import { app, BrowserWindow, nativeTheme, screen } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

let panel: BrowserWindow | null = null
let settings: BrowserWindow | null = null
let quitting = false

app.on('before-quit', () => {
  quitting = true
})

const rendererDir = (): string => pathToFileURL(join(__dirname, '../renderer/')).href

export function isAppUrl(url: string): boolean {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return (!!devUrl && url.startsWith(`${devUrl}/`)) || url.startsWith(rendererDir())
}

// Plume's pages never navigate or open windows; block both in case untrusted content ever gets rendered.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault()
  })
})

function load(win: BrowserWindow, page: 'panel' | 'settings'): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html`)
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

const background = (): string => (nativeTheme.shouldUseDarkColors ? '#1e1f24' : '#f6f5f2')

function webPreferences(): Electron.WebPreferences {
  return { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true }
}

function keepOnClose(win: BrowserWindow): void {
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
  })
}

export function createPanel(): BrowserWindow {
  panel = new BrowserWindow({
    width: 680,
    height: 600,
    minWidth: 420,
    minHeight: 380,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Plume',
    backgroundColor: background(),
    webPreferences: webPreferences()
  })
  keepOnClose(panel)
  load(panel, 'panel')
  return panel
}

export function showPanel(): void {
  if (!panel) return
  // Cursor position is unreliable on Wayland; fall back to the primary display.
  const point = screen.getCursorScreenPoint()
  const display = point.x || point.y ? screen.getDisplayNearestPoint(point) : screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  const [w, h] = panel.getSize()
  panel.setPosition(Math.round(x + (width - w) / 2), Math.round(y + (height - h) / 3))
  panel.show()
  panel.focus()
  panel.webContents.focus()
  panel.webContents.send('panel:shown')
}

export function hidePanel(): void {
  panel?.hide()
}

export function togglePanel(): void {
  if (panel?.isVisible() && panel.isFocused()) hidePanel()
  else showPanel()
}

export function openSettings(): void {
  if (!settings) {
    settings = new BrowserWindow({
      width: 760,
      height: 720,
      show: false,
      title: 'Plume settings',
      backgroundColor: background(),
      autoHideMenuBar: true,
      webPreferences: webPreferences()
    })
    keepOnClose(settings)
    load(settings, 'settings')
    settings.once('ready-to-show', () => settings?.show())
    return
  }
  settings.webContents.reload()
  settings.show()
  settings.focus()
}
