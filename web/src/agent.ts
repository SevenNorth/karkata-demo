import { createAgent } from '@karkata-ai/openai-compatible'

export function createBrowserAgent(fetchImpl: typeof fetch = fetch) {
  const authenticatedFetch: typeof fetch = (input, init) => fetchImpl(input, { ...init, credentials: 'same-origin' })
  return createAgent({
    baseURL: '/api/llm',
    fetch: authenticatedFetch,
    maxRetries: 0,
    agent: {
      systemPrompt: 'You are the Karkata demo assistant. Reply in the language used by the user. Be concise and do not claim tools or capabilities that are not available.',
      streaming: { stateUpdateIntervalMs: 32, maxOutputLength: 100_000 },
      maxSteps: 4,
      timeoutMs: 45_000,
    },
  })
}
