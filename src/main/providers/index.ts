import type { ProviderId, RunRequest, RunResult, Settings } from '../../shared/types'
import { buildPrompt } from '../prompt'
import { runAnthropic } from './anthropic'
import { runClaudeCode } from './claudeCode'
import { runOpenAI } from './openai'
import { ProviderError, type ProviderCall } from './types'

export interface ProviderDeps {
  getKey: (p: 'anthropic' | 'openai') => string | undefined
}

// Only panel runs are tracked; a Settings "Test" must not cancel them.
let activeRun: AbortController | null = null

export function cancelRun(): void {
  activeRun?.abort()
}

function callProvider(id: ProviderId, call: ProviderCall, settings: Settings, deps: ProviderDeps): Promise<string> {
  if (id === 'claudeCode') return runClaudeCode(call, settings.claudeCodePath)
  const key = deps.getKey(id)
  if (!key) throw new ProviderError(`No ${id === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key yet. Add one in Settings.`)
  return id === 'anthropic' ? runAnthropic(call, key) : runOpenAI(call, key)
}

async function execute(
  id: ProviderId,
  prompt: { system: string; user: string },
  settings: Settings,
  deps: ProviderDeps,
  signal: AbortSignal,
  onText: (d: string) => void
): Promise<RunResult> {
  try {
    const call = { ...prompt, model: settings.providers[id].model, signal, onText }
    return { ok: true, text: await callProvider(id, call, settings, deps) }
  } catch (e) {
    return { ok: false, error: e instanceof ProviderError ? e.message : `Unexpected error: ${(e as Error).message}` }
  }
}

export async function run(req: RunRequest, settings: Settings, deps: ProviderDeps, onText: (d: string) => void): Promise<RunResult> {
  if (!req.text.trim()) return { ok: false, error: 'Write something first.' }
  activeRun?.abort()
  const controller = new AbortController()
  activeRun = controller
  try {
    const prompt = buildPrompt(req, settings.presets.find((p) => p.id === req.presetId))
    return await execute(settings.provider, prompt, settings, deps, controller.signal, onText)
  } finally {
    if (activeRun === controller) activeRun = null
  }
}

export function testProvider(id: ProviderId, settings: Settings, deps: ProviderDeps): Promise<RunResult> {
  const prompt = { system: 'Translate the user text into French. Output only the translation.', user: 'Good morning!' }
  return execute(id, prompt, settings, deps, new AbortController().signal, () => {})
}
