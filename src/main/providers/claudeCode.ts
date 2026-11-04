import { query } from '@anthropic-ai/claude-agent-sdk'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { version } from '../../../package.json'
import { CANCELLED, ProviderError, type ProviderCall } from './types'

/** The user's installed Claude Code; apps started from GNOME often lack ~/.local/bin in PATH. */
export function findClaude(home = homedir(), pathEnv = process.env.PATH ?? '', exists: (p: string) => boolean = existsSync): string {
  const candidates = [join(home, '.local', 'bin', 'claude'), ...pathEnv.split(delimiter).filter(Boolean).map((d) => join(d, 'claude'))]
  return candidates.find((c) => exists(c)) ?? ''
}

export async function runClaudeCode(call: ProviderCall, executablePath: string, find = findClaude): Promise<string> {
  const executable = executablePath || find()
  if (!executable) {
    throw new ProviderError(
      'Claude Code was not found. Install it and log in (run `claude` once), set its path in Settings, or switch to an API key provider.'
    )
  }

  // Without an API key in the env, Claude Code falls back to its own login (the subscription).
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: `plume/${version}` }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN

  const abortController = new AbortController()
  const onAbort = (): void => abortController.abort()
  call.signal.addEventListener('abort', onAbort, { once: true })

  let streamed = ''
  try {
    for await (const m of query({
      prompt: call.user,
      options: {
        systemPrompt: call.system,
        model: call.model,
        // The input may be untrusted text (a pasted email), so no tool of any kind may run.
        tools: [],
        mcpServers: {},
        strictMcpConfig: true,
        permissionMode: 'default',
        canUseTool: async () => ({ behavior: 'deny', message: 'Plume does not allow tools.' }),
        maxTurns: 1,
        effort: 'low',
        persistSession: false,
        settingSources: [],
        includePartialMessages: true,
        cwd: tmpdir(),
        env,
        abortController,
        pathToClaudeCodeExecutable: executable
      }
    })) {
      if (m.type === 'stream_event' && m.event.type === 'content_block_delta' && m.event.delta.type === 'text_delta') {
        streamed += m.event.delta.text
        call.onText(m.event.delta.text)
      }
      if (m.type === 'result') {
        if (m.subtype === 'success' && !m.is_error) return m.result.trim()
        const detail = m.subtype === 'success' ? m.result : m.subtype
        throw new ProviderError(`Claude Code: ${detail}`)
      }
    }
  } catch (e) {
    if (call.signal.aborted) throw new ProviderError(CANCELLED)
    if (e instanceof ProviderError) throw e
    throw new ProviderError(`Claude Code failed: ${(e as Error).message}`)
  } finally {
    call.signal.removeEventListener('abort', onAbort)
  }
  if (streamed.trim()) return streamed.trim()
  throw new ProviderError('Claude Code returned no answer.')
}
