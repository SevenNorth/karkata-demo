export interface ProxyConfig {
  baseURL: string
  apiKey: string
  model: string
  maxOutputTokens: number
  timeoutMs: number
}

export class ProxyRequestError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) { super(message) }
}

const ALLOWED_FIELDS = new Set(['model', 'messages', 'tools', 'tool_choice', 'parallel_tool_calls', 'stream'])
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant', 'tool'])

export function prepareProxyRequest(input: unknown, config: ProxyConfig): Record<string, unknown> {
  if (!isRecord(input)) throw new ProxyRequestError('PROXY_INVALID_REQUEST', 'request body must be an object')
  for (const key of Object.keys(input)) if (!ALLOWED_FIELDS.has(key)) throw new ProxyRequestError('PROXY_INVALID_REQUEST', `unknown field: ${key}`)
  if (input.stream !== true) throw new ProxyRequestError('PROXY_INVALID_REQUEST', 'stream must be true')
  if (!Array.isArray(input.messages) || input.messages.length > 64) throw new ProxyRequestError('PROXY_INVALID_REQUEST', 'messages must contain at most 64 items')
  const messages = input.messages.map(validateMessage)
  const tools = input.tools === undefined ? undefined : validateTools(input.tools)
  return {
    model: config.model, stream: true, max_tokens: config.maxOutputTokens, messages,
    ...(tools ? { tools } : {}),
    ...(tools?.length ? { tool_choice: 'auto', parallel_tool_calls: false } : {}),
  }
}

export async function requestProvider(
  body: Record<string, unknown>, config: ProxyConfig, signal: AbortSignal, fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  let response: Response
  try {
    response = await fetchImpl(`${config.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new ProxyRequestError('PROXY_NETWORK_ERROR', 'Model provider request failed', 502)
  }
  if (!response.ok) {
    const status = response.status === 429 ? 429 : 502
    throw new ProxyRequestError(response.status === 429 ? 'PROXY_RATE_LIMIT' : 'PROXY_PROVIDER_ERROR', 'Model provider rejected the request', status)
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') || !response.body) {
    throw new ProxyRequestError('PROXY_INVALID_RESPONSE', 'Model provider returned an invalid streaming response', 502)
  }
  return response
}

function validateMessage(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || typeof value.role !== 'string' || !ALLOWED_ROLES.has(value.role)) throw new ProxyRequestError('PROXY_INVALID_REQUEST', 'message role is invalid')
  const serialized = JSON.stringify(value)
  if (serialized.length > 4_000) throw new ProxyRequestError('PROXY_INVALID_REQUEST', 'message content is too large')
  const allowed = new Set(['role', 'content', 'tool_calls', 'tool_call_id', 'name'])
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ProxyRequestError('PROXY_INVALID_REQUEST', `unknown message field: ${key}`)
  return structuredClone(value)
}

function validateTools(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 16) throw new ProxyRequestError('PROXY_INVALID_REQUEST', 'too many tools')
  return value.map((tool) => {
    if (!isRecord(tool) || tool.type !== 'function' || !isRecord(tool.function) || typeof tool.function.name !== 'string') throw new ProxyRequestError('PROXY_INVALID_REQUEST', 'tool definition is invalid')
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(tool.function.name)) throw new ProxyRequestError('PROXY_INVALID_REQUEST', 'tool name is invalid')
    if (JSON.stringify(tool).length > 12_000) throw new ProxyRequestError('PROXY_INVALID_REQUEST', 'tool definition is too large')
    return structuredClone(tool)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
