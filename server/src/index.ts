import Fastify, { type FastifyReply } from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { prepareProxyRequest, ProxyRequestError, requestProvider, type ProxyConfig } from './proxy.js'

loadDevelopmentEnv()

const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] } })
await app.register(cookie)
await app.register(helmet, { contentSecurityPolicy: false })

type DemoUser = { id: string; login: string; avatarUrl: string | null }
type Session = { user: DemoUser; expiresAt: number }
const oauthStates = new Map<string, { expiresAt: number }>()
const sessions = new Map<string, Session>()
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const isProduction = process.env.NODE_ENV === 'production'
const activeUsers = new Set<string>()
let activeRequests = 0
const userWindows = new Map<string, number[]>()
const ipWindows = new Map<string, number[]>()

app.get('/health', async () => ({ status: 'ok', service: 'karkata-demo-gateway' }))
app.get('/', async (_request, reply) => reply.type('text/plain; charset=utf-8').send('Karkata demo gateway is running. Open http://127.0.0.1:5173/ for the web app.'))
app.get('/api/me', async (request, reply) => {
  const session = getSession(request.cookies.session)
  if (!session) return { authenticated: false, user: null }
  reply.setCookie('session', request.cookies.session!, sessionCookieOptions(session.expiresAt))
  return { authenticated: true, user: session.user }
})
app.get('/auth/github', async (_request, reply) => {
  const config = githubConfig()
  if (!config) return reply.code(503).send({ code: 'OAUTH_NOT_CONFIGURED', message: 'GitHub OAuth is not configured.' })
  const state = randomUUID()
  oauthStates.set(state, { expiresAt: Date.now() + OAUTH_STATE_TTL_MS })
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.callbackUrl)
  url.searchParams.set('scope', 'read:user')
  url.searchParams.set('state', state)
  return reply.redirect(url.toString())
})
app.get('/auth/github/callback', async (request, reply) => {
  const query = request.query as { code?: string; state?: string; error?: string }
  const config = githubConfig()
  if (!config) return reply.code(503).send({ code: 'OAUTH_NOT_CONFIGURED', message: 'GitHub OAuth is not configured.' })
  if (query.error) return reply.code(400).send({ code: 'OAUTH_DENIED', message: 'GitHub authorization was denied.' })
  if (!query.code || !query.state || !consumeState(query.state)) return reply.code(400).send({ code: 'OAUTH_INVALID_STATE', message: 'The GitHub authorization request is invalid or expired.' })
  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code: query.code, redirect_uri: config.callbackUrl }),
    })
    if (!tokenResponse.ok) throw new Error(`GitHub token exchange failed with HTTP ${tokenResponse.status}`)
    const token = await tokenResponse.json() as { access_token?: string }
    if (!token.access_token) throw new Error('GitHub token exchange returned no access token')
    const userResponse = await fetch('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'karkata-demo' } })
    if (!userResponse.ok) throw new Error(`GitHub user lookup failed with HTTP ${userResponse.status}`)
    const profile = await userResponse.json() as { id?: number; login?: string; avatar_url?: string }
    if (!profile.id || !profile.login) throw new Error('GitHub user profile is incomplete')
    const user: DemoUser = { id: String(profile.id), login: profile.login, avatarUrl: profile.avatar_url ?? null }
    const sessionId = randomUUID()
    const expiresAt = Date.now() + SESSION_TTL_MS
    sessions.set(sessionId, { user, expiresAt })
    reply.setCookie('session', sessionId, sessionCookieOptions(expiresAt))
    return reply.redirect(frontendUrl())
  } catch (error) {
    request.log.error({ err: error }, 'GitHub OAuth callback failed')
    return reply.code(502).send({ code: 'OAUTH_PROVIDER_ERROR', message: 'GitHub login could not be completed.' })
  }
})
app.post('/auth/logout', async (request, reply) => {
  const sessionId = request.cookies.session
  if (sessionId) sessions.delete(sessionId)
  reply.clearCookie('session', { path: '/' })
  return { authenticated: false }
})
app.post('/api/llm/chat/completions', { bodyLimit: 128 * 1024 }, async (request, reply) => {
  const session = getSession(request.cookies.session)
  const requestId = randomUUID()
  reply.header('X-Request-Id', requestId)
  if (!session) return reply.code(401).send({ code: 'AUTH_REQUIRED', message: 'Sign in before using the model proxy.', requestId })
  const config = proxyConfig()
  if (!config) return reply.code(503).send({ code: 'PROXY_NOT_CONFIGURED', message: 'The model proxy is not configured.', requestId })
  if (!takeRateSlot(userWindows, session.user.id, 3) || !takeRateSlot(ipWindows, request.ip, 10)) return reply.code(429).send({ code: 'PROXY_RATE_LIMIT', message: 'Too many model requests.', requestId })
  if (activeUsers.has(session.user.id) || activeRequests >= 10) return reply.code(429).send({ code: 'PROXY_CONCURRENCY_LIMIT', message: 'Another model request is already running.', requestId })
  let body: Record<string, unknown>
  try { body = prepareProxyRequest(request.body, config) } catch (error) { return sendProxyError(reply, error, requestId) }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Proxy timeout')), config.timeoutMs)
  const onDisconnect = () => { if (!reply.raw.writableEnded) controller.abort(new Error('Client disconnected')) }
  request.raw.once('aborted', onDisconnect)
  reply.raw.once('close', onDisconnect)
  activeUsers.add(session.user.id); activeRequests++
  try {
    const upstream = await requestProvider(body, config, controller.signal)
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Request-Id': requestId,
    })
    await pipeline(Readable.fromWeb(upstream.body! as never), reply.raw)
    return reply
  } catch (error) {
    if (reply.raw.headersSent) { reply.raw.destroy(); return reply }
    return sendProxyError(reply, error, requestId)
  } finally {
    clearTimeout(timeout); request.raw.off('aborted', onDisconnect); reply.raw.off('close', onDisconnect)
    activeUsers.delete(session.user.id); activeRequests--
  }
})

const port = Number(process.env.PORT ?? 8787)
await app.listen({ port, host: '127.0.0.1' })

function githubConfig(): { clientId: string; clientSecret: string; callbackUrl: string } | null {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  const callbackUrl = process.env.GITHUB_CALLBACK_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8787}/auth/github/callback`
  return clientId && clientSecret ? { clientId, clientSecret, callbackUrl } : null
}

function frontendUrl(): string {
  return process.env.DEMO_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
}

function consumeState(state: string): boolean {
  const record = oauthStates.get(state)
  oauthStates.delete(state)
  return Boolean(record && record.expiresAt > Date.now())
}

function getSession(sessionId: string | undefined): Session | null {
  if (!sessionId) return null
  const session = sessions.get(sessionId)
  if (!session) return null
  if (session.expiresAt <= Date.now()) { sessions.delete(sessionId); return null }
  return session
}

function sessionCookieOptions(expiresAt: number) {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax' as const, path: '/', expires: new Date(expiresAt) }
}

function proxyConfig(): ProxyConfig | null {
  const baseURL = process.env.LLM_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL
  if (!baseURL || !apiKey || !model) return null
  return { baseURL, apiKey, model, maxOutputTokens: numberEnv('LLM_MAX_OUTPUT_TOKENS', 1500), timeoutMs: numberEnv('LLM_TIMEOUT_MS', 45_000) }
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function takeRateSlot(store: Map<string, number[]>, key: string, limit: number): boolean {
  const cutoff = Date.now() - 60_000
  const recent = (store.get(key) ?? []).filter((time) => time > cutoff)
  if (recent.length >= limit) { store.set(key, recent); return false }
  recent.push(Date.now()); store.set(key, recent); return true
}

function sendProxyError(reply: FastifyReply, error: unknown, requestId: string) {
  const classified = error instanceof ProxyRequestError ? error : new ProxyRequestError('PROXY_INTERNAL_ERROR', 'The model proxy failed.', 500)
  return reply.code(classified.statusCode).send({ code: classified.code, message: classified.message, requestId })
}

function loadDevelopmentEnv() {
  if (process.env.NODE_ENV === 'production') return
  try {
    const source = readFileSync(resolve(process.cwd(), '.env.dev'), 'utf8')
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!match || match[1] in process.env) continue
      process.env[match[1]] = stripOptionalQuotes(match[2] ?? '')
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function stripOptionalQuotes(value: string): string {
  return value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ? value.slice(1, -1)
    : value
}
