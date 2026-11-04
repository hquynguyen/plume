import './style.css'
import './panel.css'
import { PROVIDER_IDS, type Format, type Mode, type PlumeApi, type ProviderId, type PublicSettings, type RunRequest, type Tone } from '../shared/types'

declare global {
  interface Window {
    plume: PlumeApi
  }
}

const api = window.plume
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const el = {
  provider: $<HTMLSelectElement>('provider'),
  modeButtons: [...document.querySelectorAll<HTMLButtonElement>('#mode button')],
  language: $<HTMLSelectElement>('language'),
  preset: $<HTMLSelectElement>('preset'),
  tone: $<HTMLSelectElement>('tone'),
  format: $<HTMLSelectElement>('format'),
  input: $<HTMLTextAreaElement>('input'),
  contextBox: $<HTMLDetailsElement>('context-box'),
  context: $<HTMLTextAreaElement>('context'),
  run: $<HTMLButtonElement>('run'),
  cancel: $<HTMLButtonElement>('cancel'),
  status: $<HTMLSpanElement>('status'),
  result: $<HTMLTextAreaElement>('result'),
  copyClose: $<HTMLButtonElement>('copy-close'),
  copy: $<HTMLButtonElement>('copy'),
  retry: $<HTMLButtonElement>('retry')
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  claudeCode: 'Claude Code (subscription)',
  anthropic: 'Anthropic API',
  openai: 'OpenAI API'
}

const PLACEHOLDERS: Record<Mode, string> = {
  translate: 'Write in English (or any language). It will be translated.',
  compose: 'Describe the message you want, e.g. "ask my landlord to fix the heating, politely, available next week".',
  revise: 'Paste text to correct and polish. It stays in its own language.'
}

const RUN_LABELS: Record<Mode, string> = { translate: 'Translate', compose: 'Write it', revise: 'Revise' }

let settings: PublicSettings
let mode: Mode = 'translate'
let running = false

function fillSelect(select: HTMLSelectElement, options: [value: string, label: string][], selected: string): void {
  select.replaceChildren(...options.map(([value, label]) => new Option(label, value, false, value === selected)))
}

async function loadSettings(): Promise<void> {
  settings = await api.getSettings()
  const keep = (s: HTMLSelectElement, fallback: string): string => s.value || fallback
  fillSelect(
    el.provider,
    PROVIDER_IDS.map((id) => [id, PROVIDER_LABELS[id]]),
    settings.provider
  )
  fillSelect(el.language, settings.languages.map((l) => [l, l]), keep(el.language, settings.last.language))
  fillSelect(el.preset, settings.presets.map((p) => [p.id, p.name]), keep(el.preset, settings.last.presetId))
  if (!el.language.value) el.language.selectedIndex = 0
  if (!el.preset.value) el.preset.selectedIndex = 0
}

function setMode(next: Mode): void {
  mode = next
  for (const b of el.modeButtons) b.setAttribute('aria-checked', String(b.dataset.mode === mode))
  el.language.disabled = mode === 'revise'
  el.input.placeholder = PLACEHOLDERS[mode]
  el.run.textContent = RUN_LABELS[mode]
}

function setStatus(text: string, kind: '' | 'error' | 'ok' = ''): void {
  el.status.className = kind || 'muted'
  el.status.textContent = text
}

function setRunning(on: boolean): void {
  running = on
  el.run.disabled = on
  el.cancel.hidden = !on
  el.result.readOnly = on
  const hasResult = !on && el.result.value.trim() !== ''
  el.copyClose.disabled = el.copy.disabled = !hasResult
  el.retry.disabled = on || !el.input.value.trim()
}

async function run(): Promise<void> {
  if (running) return
  if (!el.input.value.trim()) {
    setStatus('Write something first.', 'error')
    el.input.focus()
    return
  }
  const req: RunRequest = {
    mode,
    text: el.input.value,
    language: el.language.value,
    presetId: el.preset.value,
    tone: (el.tone.value || undefined) as Tone | undefined,
    format: (el.format.value || undefined) as Format | undefined,
    // A collapsed context box is not sent, so leftover context can't leak into an unrelated message.
    context: el.contextBox.open ? el.context.value : ''
  }
  el.result.value = ''
  setRunning(true)
  setStatus(`Working… (${PROVIDER_LABELS[settings.provider]})`)
  const started = performance.now()
  const res = await api.run(req)
  if (res.ok) {
    el.result.value = res.text
    setStatus(`Done in ${((performance.now() - started) / 1000).toFixed(1)}s`, 'ok')
  } else {
    // Drop partial streamed text so a truncated answer can't be copied.
    el.result.value = ''
    setStatus(res.error, 'error')
  }
  setRunning(false)
  if (res.ok) el.copyClose.focus()
}

async function copy(hide: boolean): Promise<void> {
  const text = el.result.value.trim()
  if (!text || running) return
  await api.copy(text, hide)
  if (hide) {
    el.input.value = el.context.value = el.result.value = ''
    el.contextBox.open = false
    setStatus('')
    setRunning(false)
  } else {
    setStatus('Copied to clipboard.', 'ok')
  }
}

el.modeButtons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as Mode)))
el.run.addEventListener('click', () => void run())
el.retry.addEventListener('click', () => void run())
el.cancel.addEventListener('click', () => api.cancel())
el.copyClose.addEventListener('click', () => void copy(true))
el.copy.addEventListener('click', () => void copy(false))
el.input.addEventListener('input', () => setRunning(running))
$('settings').addEventListener('click', () => api.openSettings())
$('close').addEventListener('click', () => api.hide())
$('paste-context').addEventListener('click', async () => {
  el.context.value = await api.readClipboard()
})
el.provider.addEventListener('change', async () => {
  settings = await api.saveSettings({ ...settings, provider: el.provider.value as ProviderId })
})

api.onChunk((delta) => {
  el.result.value += delta
  el.result.scrollTop = el.result.scrollHeight
})
api.onShown(() => {
  void loadSettings()
  el.input.focus()
})
api.onSettingsChanged(() => void loadSettings())

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    api.hide()
  } else if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()
    void run()
  } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
    e.preventDefault()
    void copy(true)
  }
})

void loadSettings().then(() => {
  setMode(settings.last.mode)
  setRunning(false)
  el.input.focus()
})
