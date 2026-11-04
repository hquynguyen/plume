import { CANCELLED, ProviderError, type ProviderCall } from './types'

interface ChatResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[]
  error?: { message?: string }
}

export async function runOpenAI(call: ProviderCall, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body: Record<string, unknown> = {
    model: call.model,
    messages: [
      { role: 'system', content: call.system },
      { role: 'user', content: call.user }
    ],
    max_completion_tokens: 8000
  }
  // Reasoning models think by default; low effort keeps short rewrites fast.
  if (/^(gpt-5|o\d)/.test(call.model)) body.reasoning_effort = 'low'

  let res: Response
  try {
    res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: call.signal
    })
  } catch (e) {
    if (call.signal.aborted) throw new ProviderError(CANCELLED)
    throw new ProviderError(`Could not reach api.openai.com: ${(e as Error).message}`)
  }

  const data = (await res.json().catch(() => ({}))) as ChatResponse
  if (!res.ok) {
    const detail = data.error?.message ?? res.statusText
    if (res.status === 401) throw new ProviderError('OpenAI rejected the API key. Check it in Settings.')
    if (res.status === 404) throw new ProviderError(`OpenAI: ${detail}`)
    if (res.status === 429) throw new ProviderError(`OpenAI rate limit or quota: ${detail}`)
    throw new ProviderError(`OpenAI error ${res.status}: ${detail}`)
  }

  const message = data.choices?.[0]?.message
  if (message?.refusal) throw new ProviderError(`The model declined: ${message.refusal}`)
  const text = message?.content?.trim() ?? ''
  if (!text) throw new ProviderError('OpenAI returned an empty response.')
  call.onText(text)
  return text
}
