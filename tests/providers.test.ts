import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../src/main/defaults'
import type { ProviderCall } from '../src/main/providers/types'

const sdk = vi.hoisted(() => ({ calls: [] as any[], messages: [] as any[], error: null as unknown }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (params: any) => {
    sdk.calls.push(params)
    return (async function* () {
      if (sdk.error) throw sdk.error
      yield* sdk.messages
    })()
  }
}))

const anth = vi.hoisted(() => ({ params: null as any, message: null as any, error: null as unknown }))
vi.mock('@anthropic-ai/sdk', async (importActual) => {
  const actual = (await importActual()) as any
  class Fake {
    beta = {
      messages: {
        stream: (params: any) => {
          anth.params = params
          const handlers: ((d: string) => void)[] = []
          return {
            on: (_: string, h: (d: string) => void) => handlers.push(h),
            finalMessage: async () => {
              if (anth.error) throw anth.error
              handlers.forEach((h) => h('chunk'))
              return anth.message
            }
          }
        }
      }
    }
  }
  for (const name of ['APIError', 'APIUserAbortError', 'APIConnectionError', 'AuthenticationError', 'PermissionDeniedError', 'NotFoundError', 'RateLimitError']) {
    ;(Fake as any)[name] = actual.default[name]
  }
  return { default: Fake }
})

const { runOpenAI } = await import('../src/main/providers/openai')
const { runClaudeCode, findClaude } = await import('../src/main/providers/claudeCode')
const { runAnthropic } = await import('../src/main/providers/anthropic')
const { run } = await import('../src/main/providers')
const Anthropic = (await vi.importActual('@anthropic-ai/sdk') as any).default

const call = (over: Partial<ProviderCall> = {}): ProviderCall => ({
  system: 'SYS',
  user: 'hello',
  model: 'm',
  signal: new AbortController().signal,
  onText: () => {},
  ...over
})

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('openai', () => {
  it('sends system + user and reasoning effort for gpt-5 models', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { choices: [{ message: { content: ' Bonjour ' } }] }))
    const text = await runOpenAI(call({ model: 'gpt-5-mini' }), 'sk-test', fetchMock as any)
    expect(text).toBe('Bonjour')
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.headers.authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'hello' }
    ])
    expect(body.reasoning_effort).toBe('low')
    expect(body.temperature).toBeUndefined()
  })

  it('maps 401 and refusals to readable errors', async () => {
    await expect(runOpenAI(call(), 'bad', (async () => jsonResponse(401, {})) as any)).rejects.toThrow('rejected the API key')
    const refusal = async () => jsonResponse(200, { choices: [{ message: { content: null, refusal: 'no' } }] })
    await expect(runOpenAI(call(), 'k', refusal as any)).rejects.toThrow('declined')
  })
})

describe('anthropic', () => {
  beforeEach(() => {
    anth.error = null
    anth.message = { stop_reason: 'end_turn', content: [{ type: 'text', text: ' Salut ' }] }
  })

  it('streams with low effort, no temperature, and fallbacks except on Haiku', async () => {
    const chunks: string[] = []
    expect(await runAnthropic(call({ model: 'claude-opus-5-5', onText: (d) => chunks.push(d) }), 'k')).toBe('Salut')
    expect(chunks).toEqual(['chunk'])
    expect(anth.params.output_config).toEqual({ effort: 'low' })
    expect(anth.params.fallbacks).toBe('default')
    expect(anth.params).not.toHaveProperty('temperature')
    await runAnthropic(call({ model: 'claude-haiku-5-5' }), 'k')
    expect(anth.params).not.toHaveProperty('fallbacks')
  })

  it('keeps only the text after a fallback switch and reports refusals', async () => {
    anth.message = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'partial' }, { type: 'fallback' }, { type: 'text', text: 'final' }]
    }
    expect(await runAnthropic(call({ model: 'claude-opus-5-5' }), 'k')).toBe('final')
    anth.message = { stop_reason: 'refusal', content: [] }
    await expect(runAnthropic(call(), 'k')).rejects.toThrow('declined')
  })

  it('maps auth errors', async () => {
    anth.error = new Anthropic.AuthenticationError(401, {}, 'bad key', new Headers())
    await expect(runAnthropic(call(), 'k')).rejects.toThrow('rejected the API key')
  })
})

describe('claudeCode', () => {
  beforeEach(() => {
    sdk.calls.length = 0
    sdk.messages = []
    sdk.error = null
  })

  it('runs without API key env and without tools, streaming deltas', async () => {
    process.env.ANTHROPIC_API_KEY = 'should-not-leak'
    sdk.messages = [
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'À ' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'demain' } } },
      { type: 'result', subtype: 'success', is_error: false, result: 'À demain' }
    ]
    const chunks: string[] = []
    const text = await runClaudeCode(call({ onText: (d) => chunks.push(d) }), '', () => '/found/claude')
    delete process.env.ANTHROPIC_API_KEY
    expect(text).toBe('À demain')
    expect(chunks.join('')).toBe('À demain')
    const opts = sdk.calls[0].options
    expect(opts.env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(opts.tools).toEqual([])
    expect(opts.strictMcpConfig).toBe(true)
    expect(opts.mcpServers).toEqual({})
    expect(await opts.canUseTool('Bash', {}, {})).toMatchObject({ behavior: 'deny' })
    expect(opts.settingSources).toEqual([])
    expect(opts.systemPrompt).toBe('SYS')
    expect(opts.pathToClaudeCodeExecutable).toBe('/found/claude')
  })

  it('explains how to fix a missing Claude Code install', async () => {
    await expect(runClaudeCode(call(), '', () => '')).rejects.toThrow('Claude Code was not found')
    expect(sdk.calls).toHaveLength(0)
  })

  it('finds Claude Code in ~/.local/bin before PATH', () => {
    const exists = (p: string) => p === '/h/.local/bin/claude' || p === '/usr/bin/claude'
    expect(findClaude('/h', '/usr/bin', exists)).toBe('/h/.local/bin/claude')
    expect(findClaude('/x', '/opt:/usr/bin', exists)).toBe('/usr/bin/claude')
    expect(findClaude('/x', '/opt', exists)).toBe('')
  })

  it('surfaces error results such as a missing login', async () => {
    sdk.messages = [{ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in' }]
    await expect(runClaudeCode(call(), '/x/claude')).rejects.toThrow('Claude Code: Not logged in')
    expect(sdk.calls[0].options.pathToClaudeCodeExecutable).toBe('/x/claude')
  })
})

describe('run', () => {
  it('asks for a key when the API provider has none', async () => {
    const s = { ...defaultSettings(), provider: 'openai' as const }
    const res = await run({ mode: 'translate', text: 'hi', language: 'French', presetId: 'auto' }, s, { getKey: () => undefined }, () => {})
    expect(res).toEqual({ ok: false, error: 'No OpenAI API key yet. Add one in Settings.' })
  })

  it('rejects empty input without calling a provider', async () => {
    const res = await run({ mode: 'translate', text: '  ', language: 'French', presetId: 'auto' }, defaultSettings(), { getKey: () => 'k' }, () => {})
    expect(res.ok).toBe(false)
  })
})
