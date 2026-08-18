import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type DemoDatabase = Database.Database

export function openDatabase(path: string): DemoDatabase {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const database = new Database(path)
  database.pragma('busy_timeout = 5000')
  database.pragma('foreign_keys = ON')
  if (path !== ':memory:') database.pragma('journal_mode = WAL')
  migrate(database)
  return database
}

function migrate(database: DemoDatabase): void {
  const version = database.pragma('user_version', { simple: true }) as number
  if (version >= 1) return

  database.transaction(() => {
    database.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        login TEXT NOT NULL,
        avatar_url TEXT,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

      CREATE TABLE quota_buckets (
        bucket TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('user', 'global')),
        subject_id TEXT NOT NULL,
        used_tokens INTEGER NOT NULL DEFAULT 0 CHECK (used_tokens >= 0),
        reserved_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
        PRIMARY KEY (bucket, scope, subject_id)
      );

      CREATE TABLE quota_reservations (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        bucket TEXT NOT NULL,
        model TEXT NOT NULL,
        reserved_tokens INTEGER NOT NULL CHECK (reserved_tokens > 0),
        status TEXT NOT NULL CHECK (status IN ('reserved', 'settled')),
        created_at INTEGER NOT NULL,
        settled_at INTEGER,
        charged_tokens INTEGER,
        duration_ms INTEGER,
        outcome TEXT
      );
      CREATE INDEX quota_reservations_status_created_idx ON quota_reservations (status, created_at);
      PRAGMA user_version = 1;
    `)
  })()
}
