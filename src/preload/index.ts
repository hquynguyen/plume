import { contextBridge, ipcRenderer } from 'electron'
import type { PlumeApi } from '../shared/types'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PlumeApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  setKey: (provider, key) => ipcRenderer.invoke('settings:setKey', provider, key),
  run: (req) => ipcRenderer.invoke('run', req),
  cancel: () => ipcRenderer.send('run:cancel'),
  onChunk: (cb) => subscribe<[string]>('run:chunk', cb),
  onShown: (cb) => subscribe('panel:shown', cb),
  onSettingsChanged: (cb) => subscribe('settings:changed', cb),
  testProvider: (id) => ipcRenderer.invoke('provider:test', id),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  copy: (text, hide) => ipcRenderer.invoke('clipboard:write', text, hide),
  hide: () => ipcRenderer.send('panel:hide'),
  openSettings: () => ipcRenderer.send('settings:open')
}

contextBridge.exposeInMainWorld('plume', api)
