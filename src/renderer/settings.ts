import './style.css'
import './settings.css'
import { PROVIDER_IDS, type Format, type PlumeApi, type Preset, type ProviderId, type PublicSettings, type Tone } from '../shared/types'

declare global {
  interface Window {
    plume: PlumeApi
  }
}

const api = window.plume
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

interface ProviderInfo {
  label: string
  models: string[]
  note: string
}

const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  claudeCode: {
    label: 'Claude Code (your subscription)',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    note:
      'Runs your installed Claude Code with its own login, so usage counts against your Claude plan limits. ' +
      'Run `claude` once in a terminal and log in first. Check that this use fits your plan\'s terms.'
  },
  anthropic: {
    label: 'Anthropic API key',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    note: 'Pay-per-use key from console.anthropic.com (separate from a Claude Pro subscription).'
  },
  openai: {
    label: 'OpenAI API key',
    models: ['gpt-5-mini', 'gpt-5'],
    note: 'Pay-per-use key from platform.openai.com (separate from ChatGPT Plus). Any chat model name works.'
  }
}

const TONES: [Tone, string][] = [
  ['auto', 'Auto'],
  ['formal', 'Formal (vous)'],
  ['neutral', 'Neutral'],
  ['informal', 'Informal (tu)']
]
const FORMATS: [Format, string][] = [
  ['auto', 'Auto'],
  ['email', 'Email'],
  ['chat', 'Chat'],
  ['letter', 'Letter']
]

let settings: PublicSettings

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  return h('label', { className: 'field' }, h('span', {}, label), control)
}

function select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const s = h('select')
  s.append(...options.map(([v, l]) => new Option(l, v, false, v === value)))
  s.addEventListener('change', () => onChange(s.value as T))
  return s
}

function providerCard(id: ProviderId): HTMLElement {
  const info = PROVIDERS[id]
  const radio = h('input', { type: 'radio', name: 'provider', checked: settings.provider === id })
  radio.addEventListener('change', () => {
    settings.provider = id
    render()
  })

  const model = h('input', { type: 'text', value: settings.providers[id].model })
  model.setAttribute('list', `models-${id}`)
  model.addEventListener('input', () => (settings.providers[id].model = model.value.trim()))
  const datalist = h('datalist', { id: `models-${id}` }, ...info.models.map((m) => new Option(m, m)))

  const testResult = h('span', { className: 'muted' })
  const test = h('button', { textContent: 'Test' })
  test.addEventListener('click', async () => {
    await save(false)
    test.disabled = true
    testResult.className = 'muted'
    testResult.textContent = 'Testing…'
    const res = await api.testProvider(id)
    testResult.className = res.ok ? 'ok' : 'error'
    testResult.textContent = res.ok ? `OK: "${res.text}"` : res.error
    test.disabled = false
  })

  const rows: HTMLElement[] = [field('Model', model), datalist]

  if (id === 'claudeCode') {
    const path = h('input', { type: 'text', value: settings.claudeCodePath, placeholder: 'Auto: ~/.local/bin/claude or PATH' })
    path.addEventListener('input', () => (settings.claudeCodePath = path.value.trim()))
    rows.push(field('Claude Code executable (optional)', path))
  } else {
    const keyState = h('span', {
      className: settings.hasKey[id] ? 'ok' : 'muted',
      textContent: settings.hasKey[id] ? 'Key stored' : 'No key'
    })
    const key = h('input', { type: 'password', placeholder: settings.hasKey[id] ? '•••••••• (stored)' : 'Paste API key' })
    const saveKey = h('button', { textContent: 'Save key' })
    const removeKey = h('button', { textContent: 'Remove', disabled: !settings.hasKey[id] })
    saveKey.addEventListener('click', async () => {
      if (!key.value.trim()) return
      settings = { ...settings, hasKey: (await api.setKey(id, key.value)).hasKey }
      render()
    })
    removeKey.addEventListener('click', async () => {
      settings = { ...settings, hasKey: (await api.setKey(id, '')).hasKey }
      render()
    })
    rows.push(field('API key', h('div', { className: 'row' }, key, saveKey, removeKey, keyState)))
  }

  return h(
    'div',
    { className: `card${settings.provider === id ? ' selected' : ''}` },
    h('label', { className: 'card-title' }, radio, info.label),
    h('p', { className: 'muted', textContent: info.note }),
    ...rows,
    h('div', { className: 'row' }, test, testResult)
  )
}

function presetCard(p: Preset): HTMLElement {
  const name = h('input', { type: 'text', value: p.name })
  name.addEventListener('input', () => (p.name = name.value))
  const instructions = h('textarea', {
    value: p.instructions,
    rows: 2,
    placeholder: 'Situation, audience, preferences, e.g. "Emails to my manager. Keep it short."'
  })
  instructions.addEventListener('input', () => (p.instructions = instructions.value))
  const signature = h('textarea', { value: p.signature ?? '', rows: 2, placeholder: 'Optional signature added at the end' })
  signature.addEventListener('input', () => (p.signature = signature.value))
  const remove = h('button', { textContent: 'Delete', disabled: settings.presets.length <= 1 })
  remove.addEventListener('click', () => {
    settings.presets = settings.presets.filter((x) => x !== p)
    render()
  })
  return h(
    'div',
    { className: 'card' },
    h(
      'div',
      { className: 'row' },
      field('Name', name),
      field('Tone', select(TONES, p.tone, (v) => (p.tone = v))),
      field('Format', select(FORMATS, p.format, (v) => (p.format = v))),
      remove
    ),
    field('Instructions', instructions),
    field('Signature', signature)
  )
}

function render(): void {
  $('providers').replaceChildren(...PROVIDER_IDS.map(providerCard))
  $('presets').replaceChildren(...settings.presets.map(presetCard))
  $<HTMLInputElement>('languages').value = settings.languages.join(', ')
  $('key-backend').hidden = settings.keyBackend !== 'basic_text'
}

async function save(announce = true): Promise<void> {
  const languages = $<HTMLInputElement>('languages')
    .value.split(',')
    .map((l) => l.trim())
    .filter(Boolean)
  settings.languages = languages.length ? languages : ['French']
  settings.presets = settings.presets.map((p) => ({ ...p, name: p.name.trim() || 'Untitled' }))
  settings = await api.saveSettings(settings)
  if (announce) {
    $('save-status').textContent = 'Saved.'
    setTimeout(() => ($('save-status').textContent = ''), 2000)
  }
}

$('add-preset').addEventListener('click', () => {
  settings.presets.push({ id: crypto.randomUUID(), name: 'New preset', tone: 'auto', format: 'auto', instructions: '' })
  render()
})
$('save').addEventListener('click', async () => {
  await save()
  render()
})

// The panel can switch provider while this window is open; keep that choice instead of overwriting it on Save.
api.onSettingsChanged(async () => {
  settings.provider = (await api.getSettings()).provider
  render()
})

void api.getSettings().then((s) => {
  settings = s
  render()
})
