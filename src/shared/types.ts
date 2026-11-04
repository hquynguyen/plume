export type Mode = 'translate' | 'compose' | 'revise'
export type Tone = 'auto' | 'formal' | 'neutral' | 'informal'
export type Format = 'auto' | 'email' | 'chat' | 'letter'
export const PROVIDER_IDS = ['claudeCode', 'anthropic', 'openai'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export interface Preset {
  id: string
  name: string
  tone: Tone
  format: Format
  instructions: string
  signature?: string
}

export interface ProviderConfig {
  model: string
}

export interface Settings {
  provider: ProviderId
  providers: Record<ProviderId, ProviderConfig>
  languages: string[]
  presets: Preset[]
  claudeCodePath: string
  last: {
    mode: Mode
    presetId: string
    language: string
  }
}

/** What the renderer sees: keys are never sent, only whether one is stored. */
export interface PublicSettings extends Settings {
  hasKey: Record<'anthropic' | 'openai', boolean>
  keyBackend: string
}

export interface RunRequest {
  mode: Mode
  text: string
  language: string
  presetId: string
  tone?: Tone
  format?: Format
  context?: string
}

export type RunResult = { ok: true; text: string } | { ok: false; error: string }

export interface PlumeApi {
  getSettings(): Promise<PublicSettings>
  saveSettings(s: Settings): Promise<PublicSettings>
  setKey(provider: 'anthropic' | 'openai', key: string): Promise<PublicSettings>
  run(req: RunRequest): Promise<RunResult>
  cancel(): void
  onChunk(cb: (text: string) => void): () => void
  onShown(cb: () => void): () => void
  onSettingsChanged(cb: () => void): () => void
  testProvider(id: ProviderId): Promise<RunResult>
  readClipboard(): Promise<string>
  copy(text: string, hide: boolean): Promise<void>
  hide(): void
  openSettings(): void
}
