import type { Preset, Settings } from '../shared/types'

export const AUTO_PRESET: Preset = { id: 'auto', name: 'Auto', tone: 'auto', format: 'auto', instructions: '' }

export const DEFAULT_PRESETS: Preset[] = [
  AUTO_PRESET,
  {
    id: 'administration',
    name: 'Administration',
    tone: 'formal',
    format: 'letter',
    instructions: 'Writing to a French administration or official body (CAF, impôts, préfecture, mairie, bank, landlord).'
  },
  {
    id: 'work-email',
    name: 'Work email',
    tone: 'neutral',
    format: 'email',
    instructions: 'Professional email to a colleague, client or partner.'
  },
  {
    id: 'chat',
    name: 'Chat with colleagues',
    tone: 'informal',
    format: 'chat',
    instructions: 'Quick message on Slack/Teams/WhatsApp to a colleague I know well.'
  }
]

export function defaultSettings(): Settings {
  return {
    provider: 'claudeCode',
    providers: {
      anthropic: { model: 'claude-opus-5-5' },
      openai: { model: 'gpt-5-mini' },
      claudeCode: { model: 'claude-opus-5-5' }
    },
    languages: ['French', 'English'],
    presets: DEFAULT_PRESETS.map((p) => ({ ...p })),
    claudeCodePath: '',
    last: { mode: 'translate', presetId: 'auto', language: 'French' }
  }
}

/** Fills fields missing from an older or hand-edited settings file. */
export function withDefaults(stored: Partial<Settings> | undefined): Settings {
  const d = defaultSettings()
  if (!stored) return d
  return {
    ...d,
    ...stored,
    provider: stored.provider && stored.provider in d.providers ? stored.provider : d.provider,
    providers: { ...d.providers, ...stored.providers },
    languages: stored.languages?.length ? stored.languages : d.languages,
    presets: stored.presets?.length ? stored.presets : d.presets,
    last: { ...d.last, ...stored.last }
  }
}
