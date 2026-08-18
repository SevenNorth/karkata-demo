import type { DemoDatabase } from './database.js'

export interface DemoUser {
  id: string
  login: string
  avatarUrl: string | null
}

export interface Session {
  user: DemoUser
  expiresAt: number
}

interface SessionRow {
  user_id: string
  login: string
  avatar_url: string | null
  expires_at: number
}

export class SqliteSessionStore {
  constructor(readonly database: DemoDatabase, readonly now: () => number = Date.now) {}

  create(id: string, user: DemoUser, expiresAt: number): void {
    this.database.prepare(`
      INSERT INTO sessions (id, user_id, login, avatar_url, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        login = excluded.login,
        avatar_url = excluded.avatar_url,
        expires_at = excluded.expires_at
    `).run(id, user.id, user.login, user.avatarUrl, expiresAt)
  }

  get(id: string | undefined): Session | null {
    if (!id) return null
    const row = this.database.prepare('SELECT user_id, login, avatar_url, expires_at FROM sessions WHERE id = ?').get(id) as SessionRow | undefined
    if (!row) return null
    if (row.expires_at <= this.now()) {
      this.delete(id)
      return null
    }
    return { user: { id: row.user_id, login: row.login, avatarUrl: row.avatar_url }, expiresAt: row.expires_at }
  }

  delete(id: string): void {
    this.database.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  purgeExpired(): number {
    return this.database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(this.now()).changes
  }
}
