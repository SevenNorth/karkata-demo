import { createAgent } from '@karkata-ai/openai-compatible'
import type { Tool } from '@karkata-ai/core'

export function createBrowserAgent(fetchImpl: typeof fetch = fetch, tools: readonly Tool[] = []) {
  const authenticatedFetch: typeof fetch = (input, init) => fetchImpl(input, { ...init, credentials: 'same-origin' })
  const agent = createAgent({
    baseURL: '/api/llm',
    fetch: authenticatedFetch,
    maxRetries: 0,
    agent: {
      systemPrompt: 'You are the Karkata demo assistant. Reply in the language used by the user. Be concise and do not claim tools or capabilities that are not available.',
      streaming: { stateUpdateIntervalMs: 32, maxOutputLength: 200_000 },
      maxSteps: 20,
      timeoutMs: 600_000,
    },
  })
  for (const tool of tools) agent.registerTool(tool)
  return agent
}
