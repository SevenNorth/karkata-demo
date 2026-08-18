import { Transform, type TransformCallback } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { randomUUID } from 'node:crypto'
import type { DemoDatabase } from './database.js'

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

export interface SqliteQuotaOptions {
  userDailyLimitTokens: number
  globalDailyLimitTokens: number
  now?: () => number
}

export interface ReservationMetadata { requestId: string; model: string }
export interface SettlementMetadata { outcome: string; durationMs: number }

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

interface BucketRow { used_tokens: number; reserved_tokens: number }
interface ReservationRow { id: string; user_id: string; bucket: string; reserved_tokens: number; status: string; created_at: number }

export class SqliteQuotaStore {
  readonly now: () => number

  constructor(readonly database: DemoDatabase, readonly options: SqliteQuotaOptions) {
    this.now = options.now ?? Date.now
  }

  reserve(userId: string, tokens: number, metadata: ReservationMetadata): QuotaReservation {
    const normalized = Math.max(1, Math.ceil(tokens))
    const bucket = utcBucket(this.now())
    const reservation: QuotaReservation = { id: randomUUID(), userId, bucket, tokens: normalized }
    const reserve = this.database.transaction(() => {
      this.ensureBucket(bucket, 'user', userId)
      this.ensureBucket(bucket, 'global', '*')
      const user = this.bucket(bucket, 'user', userId)
      const global = this.bucket(bucket, 'global', '*')
      if (user.used_tokens + user.reserved_tokens + normalized > this.options.userDailyLimitTokens) throw new QuotaExceededError('Daily user token quota exceeded')
      if (global.used_tokens + global.reserved_tokens + normalized > this.options.globalDailyLimitTokens) throw new QuotaExceededError('Daily global token quota exceeded')
      this.incrementReserved(bucket, 'user', userId, normalized)
      this.incrementReserved(bucket, 'global', '*', normalized)
      this.database.prepare(`
        INSERT INTO quota_reservations (id, request_id, user_id, bucket, model, reserved_tokens, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?)
      `).run(reservation.id, metadata.requestId, userId, bucket, metadata.model, normalized, this.now())
    })
    reserve.immediate()
    return reservation
  }

  settle(reservation: QuotaReservation, actualTokens?: number, metadata: SettlementMetadata = { outcome: 'unknown', durationMs: 0 }): void {
    const settle = this.database.transaction(() => {
      const row = this.reservation(reservation.id)
      if (!row || row.status !== 'reserved') return
      const charged = validActualTokens(actualTokens) ? Math.ceil(actualTokens) : row.reserved_tokens
      this.applySettlement(row, charged, metadata, this.now())
    })
    settle.immediate()
  }

  recoverStaleReservations(cutoff: number): number {
    const recover = this.database.transaction(() => {
      const rows = this.database.prepare(`
        SELECT id, user_id, bucket, reserved_tokens, status, created_at
        FROM quota_reservations WHERE status = 'reserved' AND created_at < ?
      `).all(cutoff) as ReservationRow[]
      for (const row of rows) this.applySettlement(row, row.reserved_tokens, { outcome: 'abandoned', durationMs: Math.max(0, this.now() - row.created_at) }, this.now())
      return rows.length
    })
    return recover.immediate()
  }

  snapshot(userId: string): QuotaSnapshot {
    const bucket = utcBucket(this.now())
    const row = this.database.prepare(`
      SELECT used_tokens, reserved_tokens FROM quota_buckets
      WHERE bucket = ? AND scope = 'user' AND subject_id = ?
    `).get(bucket, userId) as BucketRow | undefined
    const usedTokens = row?.used_tokens ?? 0
    const reservedTokens = row?.reserved_tokens ?? 0
    return {
      dailyLimitTokens: this.options.userDailyLimitTokens,
      usedTokens,
      reservedTokens,
      remainingTokens: Math.max(0, this.options.userDailyLimitTokens - usedTokens - reservedTokens),
      resetsAt: nextUtcDay(this.now()).toISOString(),
    }
  }

  private ensureBucket(bucket: string, scope: 'user' | 'global', subjectId: string): void {
    this.database.prepare(`
      INSERT OR IGNORE INTO quota_buckets (bucket, scope, subject_id, used_tokens, reserved_tokens)
      VALUES (?, ?, ?, 0, 0)
    `).run(bucket, scope, subjectId)
  }

  private bucket(bucket: string, scope: 'user' | 'global', subjectId: string): BucketRow {
    return this.database.prepare(`
      SELECT used_tokens, reserved_tokens FROM quota_buckets
      WHERE bucket = ? AND scope = ? AND subject_id = ?
    `).get(bucket, scope, subjectId) as BucketRow
  }

  private incrementReserved(bucket: string, scope: 'user' | 'global', subjectId: string, tokens: number): void {
    this.database.prepare(`
      UPDATE quota_buckets SET reserved_tokens = reserved_tokens + ?
      WHERE bucket = ? AND scope = ? AND subject_id = ?
    `).run(tokens, bucket, scope, subjectId)
  }

  private reservation(id: string): ReservationRow | undefined {
    return this.database.prepare(`
      SELECT id, user_id, bucket, reserved_tokens, status, created_at FROM quota_reservations WHERE id = ?
    `).get(id) as ReservationRow | undefined
  }

  private applySettlement(row: ReservationRow, charged: number, metadata: SettlementMetadata, settledAt: number): void {
    for (const [scope, subjectId] of [['user', row.user_id], ['global', '*']] as const) {
      this.database.prepare(`
        UPDATE quota_buckets SET
          reserved_tokens = MAX(0, reserved_tokens - ?),
          used_tokens = used_tokens + ?
        WHERE bucket = ? AND scope = ? AND subject_id = ?
      `).run(row.reserved_tokens, charged, row.bucket, scope, subjectId)
    }
    this.database.prepare(`
      UPDATE quota_reservations SET status = 'settled', settled_at = ?, charged_tokens = ?, duration_ms = ?, outcome = ?
      WHERE id = ? AND status = 'reserved'
    `).run(settledAt, charged, Math.max(0, Math.ceil(metadata.durationMs)), metadata.outcome, row.id)
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

function validActualTokens(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0
}
