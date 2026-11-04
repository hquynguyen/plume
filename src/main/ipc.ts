import { BrowserWindow, clipboard, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { PROVIDER_IDS, type ProviderId, type RunRequest, type Settings } from '../shared/types'
import { cancelRun, run, testProvider } from './providers'
import { getKey, loadSettings, publicSettings, saveSettings, setKey } from './settings'
import { hidePanel, isAppUrl, openSettings } from './window'

const deps = { getKey }
const KEY_PROVIDERS = ['anthropic', 'openai'] as const

function assertTrusted(e: IpcMainEvent | IpcMainInvokeEvent): void {
  if (!isAppUrl(e.senderFrame?.url ?? '')) throw new Error('IPC from untrusted frame')
}

function handle<A extends unknown[], R>(channel: string, fn: (e: IpcMainInvokeEvent, ...args: A) => R): void {
  ipcMain.handle(channel, (e, ...args) => {
    assertTrusted(e)
    return fn(e, ...(args as A))
  })
}

function on(channel: string, fn: () => void): void {
  ipcMain.on(channel, (e) => {
    assertTrusted(e)
    fn()
  })
}

export function registerIpc(): void {
  handle('settings:get', () => publicSettings())
  handle('settings:save', (e, s: Settings) => {
    saveSettings(s)
    for (const w of BrowserWindow.getAllWindows()) if (w.webContents !== e.sender) w.webContents.send('settings:changed')
    return publicSettings()
  })
  handle('settings:setKey', (_e, provider: string, key: unknown) => {
    if (!KEY_PROVIDERS.includes(provider as never) || typeof key !== 'string') throw new Error('Invalid key request')
    setKey(provider as (typeof KEY_PROVIDERS)[number], key)
    return publicSettings()
  })
  handle('run', (e, req: RunRequest) => {
    const s = loadSettings()
    saveSettings({ ...s, last: { mode: req.mode, presetId: req.presetId, language: req.language } })
    return run(req, s, deps, (delta) => e.sender.send('run:chunk', delta))
  })
  on('run:cancel', () => cancelRun())
  handle('provider:test', (_e, id: string) => {
    if (!PROVIDER_IDS.includes(id as ProviderId)) throw new Error('Unknown provider')
    return testProvider(id as ProviderId, loadSettings(), deps)
  })
  handle('clipboard:read', () => clipboard.readText())
  handle('clipboard:write', (_e, text: unknown, hide: boolean) => {
    if (typeof text !== 'string') return
    clipboard.writeText(text)
    if (hide) hidePanel()
  })
  on('panel:hide', () => hidePanel())
  on('settings:open', () => openSettings())
}
