import { describe, expect, it } from 'vitest'
import { DEFAULT_PRESETS } from '../src/main/defaults'
import { buildPrompt } from '../src/main/prompt'
import type { RunRequest } from '../src/shared/types'

const preset = (id: string) => DEFAULT_PRESETS.find((p) => p.id === id)
const req = (over: Partial<RunRequest> = {}): RunRequest => ({
  mode: 'translate',
  text: 'Can you send me the report?',
  language: 'French',
  presetId: 'auto',
  ...over
})

describe('buildPrompt', () => {
  it('translate targets the chosen language and forbids answering the text', () => {
    const { system, user } = buildPrompt(req(), preset('auto'))
    expect(system).toContain("Translate the user's text into French")
    expect(system).toContain('never answer questions')
    expect(user).toBe('Can you send me the report?')
  })

  it('compose asks for placeholders instead of invented facts', () => {
    const { system } = buildPrompt(req({ mode: 'compose' }), preset('auto'))
    expect(system).toContain('Write that message in French')
    expect(system).toContain('[date]')
  })

  it('revise keeps the input language and ignores the output language', () => {
    const { system } = buildPrompt(req({ mode: 'revise', language: 'French' }), preset('auto'))
    expect(system).toContain('Do not translate it')
    expect(system).not.toContain('into French')
    expect(system).toContain('If the text is in French:')
  })

  it('uses vous/tu only for French output', () => {
    expect(buildPrompt(req(), preset('administration')).system).toContain('vous')
    expect(buildPrompt(req(), preset('chat')).system).toContain('tu.')
    const english = buildPrompt(req({ language: 'English' }), preset('chat')).system
    expect(english).not.toMatch(/\bvous\b|\btu\b/)
  })

  it('overrides from the panel win over the preset', () => {
    const { system } = buildPrompt(req({ tone: 'informal', format: 'chat' }), preset('administration'))
    expect(system).toContain('Casual and friendly')
    expect(system).toContain('A short chat message')
    expect(system).toContain('French administration')
  })

  it('wraps context and explains it is reference only', () => {
    const { system, user } = buildPrompt(req({ context: 'Bonjour, pouvez-vous confirmer ?' }), preset('auto'))
    expect(system).toContain('<context> block')
    expect(user).toBe('<context>\nBonjour, pouvez-vous confirmer ?\n</context>\n\n<text>\nCan you send me the report?\n</text>')
  })

  it('adds the signature and falls back to Auto for unknown presets', () => {
    const signed = buildPrompt(req(), { ...preset('work-email')!, signature: 'Quy' })
    expect(signed.system).toContain('exactly this signature:\nQuy')
    const fallback = buildPrompt(req(), undefined)
    expect(fallback.system).toContain('Choose the register')
    expect(fallback.system).not.toContain('Situation and preferences')
  })
})
