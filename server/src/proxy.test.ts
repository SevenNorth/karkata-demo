import { describe, expect, it, vi } from 'vitest'
import { prepareProxyRequest, requestProvider, ProxyRequestError } from './proxy.js'

const config = {
  baseURL: 'https://provider.test/v1', apiKey: 'provider-secret', model: 'server-model',
  maxOutputTokens: 1500, timeoutMs: 45_000,
}

describe('prepareProxyRequest', () => {
  it('rebuilds the provider body with server-owned model and limits', () => {
    const body = prepareProxyRequest({
      model: 'client-model', stream: true,
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    }, config)

    expect(body).toEqual({ model: 'server-model', stream: true, stream_options: { include_usage: true }, max_tokens: 1500, messages: [{ role: 'user', content: 'hello' }], tools: [] })
  })

  it('rejects unknown fields and non-streaming requests', () => {
    expect(() => prepareProxyRequest({ messages: [], stream: true, baseURL: 'https://attacker.test' }, config)).toThrow(ProxyRequestError)
    expect(() => prepareProxyRequest({ messages: [], stream: false }, config)).toThrow('stream must be true')
  })

  it('enforces message and tool limits', () => {
    expect(() => prepareProxyRequest({ stream: true, messages: [{ role: 'user', content: 'x'.repeat(4001) }] }, config)).toThrow('message content is too large')
    expect(() => prepareProxyRequest({ stream: true, messages: [], tools: Array.from({ length: 17 }, (_, index) => ({ type: 'function', function: { name: `tool_${index}`, parameters: {} } })) }, config)).toThrow('too many tools')
  })
})

describe('requestProvider', () => {
  it('uses only the configured URL and credential and returns an SSE response', async () => {
    const fetch = vi.fn(async () => new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    const response = await requestProvider({ stream: true, messages: [] }, config, new AbortController().signal, fetch)

    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledWith('https://provider.test/v1/chat/completions', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer provider-secret' }),
    }))
  })

  it('rejects invalid upstream content types without exposing the response body', async () => {
    const fetch = vi.fn(async () => new Response('provider-secret internal detail', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await expect(requestProvider({ stream: true, messages: [] }, config, new AbortController().signal, fetch)).rejects.toMatchObject({ code: 'PROXY_INVALID_RESPONSE' })
  })
})
