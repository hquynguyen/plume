import Anthropic from '@anthropic-ai/sdk'
import { CANCELLED, ProviderError, type ProviderCall } from './types'

function friendly(e: unknown): Error {
  if (e instanceof ProviderError) return e
  if (e instanceof Anthropic.APIUserAbortError) return new ProviderError(CANCELLED)
  if (e instanceof Anthropic.AuthenticationError) return new ProviderError('Anthropic rejected the API key. Check it in Settings.')
  if (e instanceof Anthropic.PermissionDeniedError) return new ProviderError('This API key is not allowed to use that model.')
  if (e instanceof Anthropic.NotFoundError) return new ProviderError('Model not found. Check the model name in Settings.')
  if (e instanceof Anthropic.RateLimitError) return new ProviderError('Rate limited by Anthropic. Try again in a moment.')
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError('Could not reach api.anthropic.com. Check your connection.')
  if (e instanceof Anthropic.APIError && e.status === 529) return new ProviderError('Anthropic is overloaded right now. Try again shortly.')
  if (e instanceof Anthropic.APIError) return new ProviderError(`Anthropic error ${e.status ?? ''}: ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

export async function runAnthropic(call: ProviderCall, apiKey: string): Promise<string> {
  // Pinned so ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN in the environment can't redirect the key.
  const client = new Anthropic({ apiKey, authToken: null, baseURL: 'https://api.anthropic.com' })
  // Haiku has no server-side refusal fallback.
  const fallback = !call.model.startsWith('claude-haiku')
  try {
    const stream = client.beta.messages.stream(
      {
        model: call.model,
        max_tokens: 8000,
        system: call.system,
        messages: [{ role: 'user', content: call.user }],
        output_config: { effort: 'low' },
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
      },
      { signal: call.signal }
    )
    stream.on('text', (delta) => call.onText(delta))
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') throw new ProviderError('The model declined this request.')
    // After a fallback, only the text after the last switch point belongs to the answer.
    const lastSwitch = msg.content.findLastIndex((b) => b.type === 'fallback')
    return msg.content
      .slice(lastSwitch + 1)
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim()
  } catch (e) {
    throw friendly(e)
  }
}
