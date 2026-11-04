export interface ProviderCall {
  system: string
  user: string
  model: string
  signal: AbortSignal
  onText: (delta: string) => void
}

/** An error whose message is fit to show in the panel as is. */
export class ProviderError extends Error {}

export const CANCELLED = 'Cancelled.'
