import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database.js'
import { SqliteQuotaStore, QuotaExceededError } from './quota.js'
import { SqliteSessionStore } from './session.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'karkata-demo-'))
  directories.push(directory)
  return join(directory, 'demo.sqlite')
}

describe('SQLite Sessions', () => {
  it('survives reopening the database and removes expired Sessions', () => {
    const path = databasePath()
    let database = openDatabase(path)
    new SqliteSessionStore(database, () => 1_000).create('session-1', { id: '42', login: 'octo', avatarUrl: null }, 2_000)
    database.close()

    database = openDatabase(path)
    const sessions = new SqliteSessionStore(database, () => 1_500)
    expect(sessions.get('session-1')?.user.login).toBe('octo')
    expect(new SqliteSessionStore(database, () => 2_001).get('session-1')).toBeNull()
    expect(sessions.get('session-1')).toBeNull()
    database.close()
  })
})

describe('SQLite quota', () => {
  it('persists reservations and settles actual usage exactly once', () => {
    const path = databasePath()
    let database = openDatabase(path)
    let quota = new SqliteQuotaStore(database, { userDailyLimitTokens: 1_000, globalDailyLimitTokens: 2_000, now: () => Date.UTC(2026, 7, 18) })
    const reservation = quota.reserve('user-1', 600, { requestId: 'request-1', model: 'demo-model' })
    database.close()

    database = openDatabase(path)
    quota = new SqliteQuotaStore(database, { userDailyLimitTokens: 1_000, globalDailyLimitTokens: 2_000, now: () => Date.UTC(2026, 7, 18) })
    expect(quota.snapshot('user-1')).toMatchObject({ usedTokens: 0, reservedTokens: 600, remainingTokens: 400 })
    quota.settle(reservation, 125, { outcome: 'completed', durationMs: 30 })
    quota.settle(reservation, 900, { outcome: 'completed', durationMs: 40 })
    expect(quota.snapshot('user-1')).toMatchObject({ usedTokens: 125, reservedTokens: 0, remainingTokens: 875 })

    const ledger = database.prepare('SELECT request_id, model, status, charged_tokens, outcome FROM quota_reservations').get() as Record<string, unknown>
    expect(ledger).toEqual(expect.objectContaining({ request_id: 'request-1', model: 'demo-model', status: 'settled', charged_tokens: 125, outcome: 'completed' }))
    database.close()
  })

  it('atomically enforces the global ceiling across users', () => {
    const path = databasePath()
    const firstDatabase = openDatabase(path)
    const secondDatabase = openDatabase(path)
    const options = { userDailyLimitTokens: 1_000, globalDailyLimitTokens: 1_000, now: () => Date.UTC(2026, 7, 18) }
    const firstQuota = new SqliteQuotaStore(firstDatabase, options)
    const secondQuota = new SqliteQuotaStore(secondDatabase, options)
    firstQuota.reserve('user-1', 700, { requestId: 'request-1', model: 'demo-model' })
    expect(() => secondQuota.reserve('user-2', 301, { requestId: 'request-2', model: 'demo-model' })).toThrow(QuotaExceededError)
    expect(secondQuota.snapshot('user-2')).toMatchObject({ usedTokens: 0, reservedTokens: 0, remainingTokens: 1_000 })
    firstDatabase.close()
    secondDatabase.close()
  })

  it('charges stale reservations conservatively after a crash', () => {
    const database = openDatabase(databasePath())
    const quota = new SqliteQuotaStore(database, { userDailyLimitTokens: 1_000, globalDailyLimitTokens: 2_000, now: () => Date.UTC(2026, 7, 18) })
    quota.reserve('user-1', 400, { requestId: 'request-1', model: 'demo-model' })

    expect(quota.recoverStaleReservations(Date.UTC(2026, 7, 18) + 1)).toBe(1)
    expect(quota.snapshot('user-1')).toMatchObject({ usedTokens: 400, reservedTokens: 0, remainingTokens: 600 })
    expect(quota.recoverStaleReservations(Date.UTC(2026, 7, 18) + 1)).toBe(0)
    database.close()
  })
})
