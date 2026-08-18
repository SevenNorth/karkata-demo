# Karkata Demo: SQLite persistence

## Status

Implemented. This stage replaces process-local Sessions and quota records without changing the browser-facing HTTP contract.

## Goals

- Keep authenticated Sessions valid across a normal server restart.
- Persist per-user daily token usage, reservations, and settlements.
- Enforce a configurable global daily token ceiling in the same transaction as the user ceiling.
- Preserve a minimal, redacted usage ledger for operational diagnosis.
- Conservatively charge abandoned reservations so a crash cannot restore spendable quota.

OAuth `state`, minute rate-limit windows, and active-request concurrency remain process-local. They are short-lived coordination state rather than durable account state.

## Storage

The server uses one SQLite database. `SQLITE_PATH` defaults to `data/karkata-demo.sqlite`. Startup creates the parent directory and applies versioned schema migrations before accepting traffic.

Tables:

- `sessions`: opaque Session id, GitHub user id/login/avatar URL, and absolute expiry time.
- `quota_buckets`: UTC day, scope (`user` or `global`), subject id, used tokens, and reserved tokens.
- `quota_reservations`: request id, model, user/day, reserved amount, lifecycle status, charged amount, timestamps, duration, and outcome.

The database must not contain Provider keys, GitHub access tokens, cookies, prompts, model responses, or tool payloads.

## Transaction boundaries

Reservation is one immediate SQLite transaction:

1. Read or create the current user and global UTC-day buckets.
2. Reject when either `used + reserved + requested` exceeds its configured ceiling.
3. Increment both reserved counters.
4. Insert one reservation ledger row.

Settlement is idempotent and runs in one transaction. It only changes a `reserved` row, decrements both original bucket reservations, increments both used counters, and records the final charge. Actual Provider usage is charged when available; otherwise the full reservation is charged.

On startup, every reservation older than `QUOTA_RESERVATION_TTL_MS` is settled at its full reserved amount with outcome `abandoned`. This deliberately prefers bounded abuse risk over optimistic accounting after a crash.

## Configuration

```text
SQLITE_PATH=data/karkata-demo.sqlite
LLM_DAILY_TOKEN_LIMIT=30000
LLM_GLOBAL_DAILY_TOKEN_LIMIT=300000
QUOTA_RESERVATION_TTL_MS=120000
```

## HTTP compatibility

- `GET /api/me`, `POST /auth/logout`, and the Session cookie retain their existing behavior.
- `GET /api/usage` retains its existing response shape.
- User and global quota exhaustion both return `429 PROXY_QUOTA_EXCEEDED`; the global ceiling is not disclosed to clients.
- `POST /api/llm/chat/completions` continues returning `X-Quota-Remaining` after a successful reservation.

## Acceptance

- Reopening the same database preserves a valid Session and its remaining quota.
- Expired Sessions cannot authenticate and are deleted when read or purged.
- Concurrent/process-separated reservations cannot exceed either configured ceiling.
- Settling a reservation twice never charges twice.
- A missing usage event, interruption, timeout, or recovered abandoned reservation charges the full reservation.
- Ledger rows contain request metadata and token counts but no request or response content.
- The database file and SQLite sidecar files are ignored by Git.
