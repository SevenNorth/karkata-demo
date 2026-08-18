import { Transform, type TransformCallback } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { randomUUID } from 'node:crypto'

export interface QuotaSnapshot {
  dailyLimitTokens: number
  usedTokens: number
  reservedTokens: number
  remainingTokens: number
  resetsAt: string
}

export interface QuotaReservation {
  readonly id: string
  readonly userId: string
  readonly bucket: string
  readonly tokens: number
}

interface QuotaRecord { bucket: string; usedTokens: number; reservedTokens: number }

export class QuotaExceededError extends Error {}

export class MemoryQuotaStore {
  readonly #records = new Map<string, QuotaRecord>()
  constructor(readonly dailyLimitTokens: number, readonly now: () => number = Date.now) {}

  reserve(userId: string, tokens: number): QuotaReservation {
    const record = this.#record(userId)
    const normalized = Math.max(1, Math.ceil(tokens))
    if (record.usedTokens + record.reservedTokens + normalized > this.dailyLimitTokens) throw new QuotaExceededError('Daily token quota exceeded')
    record.reservedTokens += normalized
    return { id: randomUUID(), userId, bucket: record.bucket, tokens: normalized }
  }

  settle(reservation: QuotaReservation, actualTokens?: number): void {
    const record = this.#record(reservation.userId)
    if (record.bucket !== reservation.bucket) return
    record.reservedTokens = Math.max(0, record.reservedTokens - reservation.tokens)
    const charged = actualTokens !== undefined && Number.isFinite(actualTokens) && actualTokens >= 0 ? Math.ceil(actualTokens) : reservation.tokens
    record.usedTokens += charged
  }

  snapshot(userId: string): QuotaSnapshot {
    const record = this.#record(userId)
    return {
      dailyLimitTokens: this.dailyLimitTokens,
      usedTokens: record.usedTokens,
      reservedTokens: record.reservedTokens,
      remainingTokens: Math.max(0, this.dailyLimitTokens - record.usedTokens - record.reservedTokens),
      resetsAt: nextUtcDay(this.now()).toISOString(),
    }
  }

  #record(userId: string): QuotaRecord {
    const bucket = utcBucket(this.now())
    const current = this.#records.get(userId)
    if (current?.bucket === bucket) return current
    const record = { bucket, usedTokens: 0, reservedTokens: 0 }
    this.#records.set(userId, record)
    return record
  }
}

export class UsageTrackingTransform extends Transform {
  totalTokens: number | undefined
  readonly #decoder = new StringDecoder('utf8')
  #pending = ''

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
    this.push(chunk)
    this.#consume(this.#decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)))
    callback()
  }

  _flush(callback: TransformCallback): void {
    this.#consume(this.#decoder.end(), true)
    callback()
  }

  #consume(text: string, flush = false): void {
    this.#pending += text
    const events = this.#pending.split(/\r?\n\r?\n/)
    this.#pending = flush ? '' : events.pop() ?? ''
    for (const event of events) this.#inspectEvent(event)
    if (flush && this.#pending) this.#inspectEvent(this.#pending)
  }

  #inspectEvent(event: string): void {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data) as { usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null }
        const usage = parsed.usage
        if (!usage) continue
        const total = usage.total_tokens ?? ((usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0))
        if (Number.isFinite(total) && total >= 0) this.totalTokens = total
      } catch { /* Provider parsing remains the Adapter's responsibility. */ }
    }
  }
}

export function estimateReservationTokens(body: Record<string, unknown>, maxOutputTokens: number): number {
  const inputChars = JSON.stringify(body.messages ?? []).length + JSON.stringify(body.tools ?? []).length
  return Math.ceil(inputChars / 4) + maxOutputTokens
}

function utcBucket(timestamp: number): string { return new Date(timestamp).toISOString().slice(0, 10) }
function nextUtcDay(timestamp: number): Date {
  const now = new Date(timestamp)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}
