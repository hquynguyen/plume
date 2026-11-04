import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PublicSettings, Settings } from '../shared/types'
import { withDefaults } from './defaults'

type KeyProvider = 'anthropic' | 'openai'

const dir = (): string => app.getPath('userData')
const settingsFile = (): string => join(dir(), 'settings.json')
const keysFile = (): string => join(dir(), 'keys.json')

let cache: Settings | null = null

function readJson<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(dir(), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 })
}

export function loadSettings(): Settings {
  cache ??= withDefaults(readJson<Partial<Settings>>(settingsFile()))
  return cache
}

export function saveSettings(s: Settings | PublicSettings): Settings {
  // The renderer sends PublicSettings back; key status is derived, never stored.
  const { hasKey: _h, keyBackend: _k, ...rest } = s as PublicSettings
  cache = withDefaults(rest)
  writeJson(settingsFile(), cache)
  return cache
}

export function getKey(provider: KeyProvider): string | undefined {
  const stored = readJson<Partial<Record<KeyProvider, string>>>(keysFile())?.[provider]
  if (!stored) return undefined
  return safeStorage.decryptString(Buffer.from(stored, 'base64'))
}

export function setKey(provider: KeyProvider, key: string): void {
  const keys = readJson<Partial<Record<KeyProvider, string>>>(keysFile()) ?? {}
  const trimmed = key.trim()
  if (trimmed) keys[provider] = safeStorage.encryptString(trimmed).toString('base64')
  else delete keys[provider]
  writeJson(keysFile(), keys)
}

export function publicSettings(): PublicSettings {
  const keys = readJson<Partial<Record<KeyProvider, string>>>(keysFile()) ?? {}
  return { ...loadSettings(), hasKey: { anthropic: !!keys.anthropic, openai: !!keys.openai }, keyBackend: keyStorageBackend() }
}

/** "basic_text" means no keyring was found and keys are only obfuscated. */
export function keyStorageBackend(): string {
  return process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'os'
}
