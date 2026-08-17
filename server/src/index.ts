import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'

const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] } })
await app.register(cookie)
await app.register(helmet, { contentSecurityPolicy: false })

app.get('/health', async () => ({ status: 'ok', service: 'karkata-demo-gateway' }))
app.get('/api/me', async (request) => ({ authenticated: Boolean(request.cookies.session) }))
app.get('/auth/github', async (_request, reply) => reply.code(501).send({ code: 'OAUTH_NOT_IMPLEMENTED', message: 'GitHub OAuth is planned for the next phase.' }))
app.post('/api/llm/chat/completions', async (_request, reply) => reply.code(501).send({ code: 'PROXY_NOT_IMPLEMENTED', message: 'The constrained LLM proxy is planned for the next phase.' }))

const port = Number(process.env.PORT ?? 8787)
await app.listen({ port, host: '127.0.0.1' })
