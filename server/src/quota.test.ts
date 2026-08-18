import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { describe, expect, it } from 'vitest'
import { MemoryQuotaStore, UsageTrackingTransform } from './quota.js'

describe('MemoryQuotaStore', () => {
  it('atomically reserves and settles actual token usage', () => {
    const store = new MemoryQuotaStore(10_000, () => Date.UTC(2026, 7, 18))
    const reservation = store.reserve('user-1', 2_000)
    expect(store.snapshot('user-1')).toMatchObject({ usedTokens: 0, reservedTokens: 2_000, remainingTokens: 8_000 })

    store.settle(reservation, 750)
    expect(store.snapshot('user-1')).toMatchObject({ usedTokens: 750, reservedTokens: 0, remainingTokens: 9_250 })
  })

  it('charges the full reservation when usage is unavailable and rejects over-budget requests', () => {
    const store = new MemoryQuotaStore(2_000, () => Date.UTC(2026, 7, 18))
    const reservation = store.reserve('user-1', 1_500)
    store.settle(reservation)
    expect(store.snapshot('user-1').usedTokens).toBe(1_500)
    expect(() => store.reserve('user-1', 501)).toThrow('Daily token quota exceeded')
  })
})

describe('UsageTrackingTransform', () => {
  it('passes SSE through unchanged and captures final token usage', async () => {
    const source = [
      'data: {"choices":[{"delta":{"content":"ok"}}],"usage":null}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const tracker = new UsageTrackingTransform()
    const chunks: Buffer[] = []
    tracker.on('data', (chunk: Buffer) => chunks.push(chunk))

    await pipeline(Readable.from([source.slice(0, 41), source.slice(41)]), tracker)

    expect(Buffer.concat(chunks).toString()).toBe(source)
    expect(tracker.totalTokens).toBe(14)
  })
})
