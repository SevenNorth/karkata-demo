import { describe, expect, it, vi } from 'vitest'
import { createAgentUIStore } from '@karkata-ai/ui'
import { createBrowserAgent } from './agent'

describe('createBrowserAgent', () => {
  it('runs Karkata in the browser through the authenticated streaming proxy', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).not.toHaveProperty('model')
      expect(body).toMatchObject({ stream: true })
      expect(init?.credentials).toBe('same-origin')
      return new Response([
        'data: {"choices":[{"index":0,"delta":{"content":"你"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"content":"好"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    })
    const agent = createBrowserAgent(fetch)
    const store = createAgentUIStore(agent)

    await store.submit('测试消息')

    expect(fetch).toHaveBeenCalledWith('/api/llm/chat/completions', expect.any(Object))
    expect(store.getSnapshot()).toMatchObject({ status: 'completed' })
    expect(store.getSnapshot().items.filter((item) => item.type === 'message').map((item) => item.content)).toEqual(['测试消息', '你好'])
    store.dispose()
    await agent.dispose()
  })
})
