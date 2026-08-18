# Karkata Demo

Karkata 的真实浏览器运行示例。Karkata Agent 和工具循环运行在浏览器中，后端只负责 GitHub 登录、受限 LLM 代理、额度控制和持久化。

## Architecture

```text
React UI + Karkata Agent (browser)
               |
               | same-origin OpenAI-compatible SSE
               v
Fastify gateway (GitHub OAuth, validation, limits, quota)
               |
               v
Fixed server-side LLM Provider
```

Provider API Key、GitHub access token、额度策略和上游地址不会发送到浏览器。浏览器不能通过请求覆盖 Provider URL、API Key、服务端模型或最大输出限制。

## Requirements

- Node.js 22 or later
- npm
- A GitHub OAuth App
- An OpenAI-compatible streaming Provider

## Local setup

Install dependencies:

```bash
npm install
```

Create `.env.dev` from `.env.example` and fill in local credentials. `.env.dev` is ignored by Git.

```env
PORT=8787
NODE_ENV=development

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://127.0.0.1:8787/auth/github/callback
DEMO_FRONTEND_URL=http://127.0.0.1:5173/
SQLITE_PATH=data/karkata-demo.sqlite

LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
LLM_MAX_OUTPUT_TOKENS=3000
LLM_TIMEOUT_MS=600000
LLM_DAILY_TOKEN_LIMIT=30000
LLM_GLOBAL_DAILY_TOKEN_LIMIT=300000
QUOTA_RESERVATION_TTL_MS=120000
```

`.env.dev` is loaded only outside production. Production deployments must inject these values through the hosting platform's environment or secret manager.

The GitHub OAuth App callback URL must exactly match `GITHUB_CALLBACK_URL`. Local development consistently uses `127.0.0.1`; do not mix it with `localhost` because cookies and OAuth redirects are origin-sensitive.

Start both services:

```bash
npm run dev
```

Or start them separately:

```bash
npm run dev:web
npm run dev:server
```

- Web: <http://127.0.0.1:5173/>
- Gateway: <http://127.0.0.1:8787/>
- Health check: <http://127.0.0.1:8787/health>

## Authentication and persistence

GitHub login creates an opaque application Session. The GitHub access token is only used during the OAuth callback to read the user profile and is not persisted.

Sessions have a fixed seven-day lifetime. Accessing the application does not extend that lifetime. Logout deletes the server-side Session immediately.

Sessions, quota buckets, reservations, and redacted usage records are stored in SQLite. The default database is `data/karkata-demo.sqlite`; the database and its sidecar files are ignored by Git.

## LLM proxy and quota

The browser calls `POST /api/llm/chat/completions`. The gateway validates and rebuilds the request, forces the configured model and output limit, and streams the Provider response back as SSE.

Before an upstream request, the gateway reserves:

```text
estimated input tokens + LLM_MAX_OUTPUT_TOKENS
```

The reservation is checked against both the user's daily ceiling and the global daily ceiling in one SQLite transaction. When the Provider returns final usage, the actual token count is charged and the unused reservation is released. Missing usage, cancellation, timeout, upstream failure, or an abandoned reservation is charged conservatively at the full reserved amount.

Daily quota buckets reset at 00:00 UTC. `GET /api/usage` returns the authenticated user's current usage and reset time.

## API surface

```text
GET  /health
GET  /api/me
GET  /api/usage
GET  /auth/github
GET  /auth/github/callback
POST /auth/logout
POST /api/llm/chat/completions
```

The model endpoint requires login, allows one active request per user, applies user/IP request-rate limits, and enforces a global concurrency limit. Errors expose stable application codes and an opaque request id, not Provider response bodies or credentials.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

To verify persistence manually:

1. Sign in and send one model request.
2. Record the remaining quota shown in the header.
3. Restart the backend.
4. Refresh the browser and confirm the login and remaining quota are unchanged.
5. Log out and confirm the Session no longer authenticates.

## Design documents

- [Browser Agent and constrained LLM proxy](spec/llm-proxy.md)
- [SQLite persistence](spec/sqlite-persistence.md)
