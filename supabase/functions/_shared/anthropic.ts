import { z } from 'npm:zod@3.24.1'
import { serviceClient } from './client.ts'

interface ClaudeTextBlock { type: string; text?: string }
interface ClaudeUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}
interface ClaudeResponse { content?: ClaudeTextBlock[]; stop_reason?: string; usage?: ClaudeUsage }
interface ClaudeErrorResponse { error?: { type?: string; message?: string } }
interface ClaudeTracking { analysisJobId: string; reviewUnitId?: string; stage: 'REVIEW' | 'VALIDATION' | 'REPORT' }

function safeProviderError(value: string): string {
  return value.replace(/(?:sk-ant-|Bearer\s+)[A-Za-z0-9._-]+/gi, '[REDACTED]').replace(/[\r\n]+/g, ' ').slice(0, 300)
}

function tokenCount(value: number | undefined): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

async function recordAnthropicUsage(options: {
  tracking?: ClaudeTracking
  model: string
  requestId: string
  responseStatus: 'API_SUCCEEDED' | 'API_REJECTED'
  httpStatus: number
  usage?: ClaudeUsage
  providerErrorType?: string
}): Promise<void> {
  if (!options.tracking) return
  const usage = options.usage
  const { error } = await serviceClient().from('anthropic_api_usage').upsert({
    analysis_job_id: options.tracking.analysisJobId,
    review_unit_id: options.tracking.reviewUnitId ?? null,
    stage: options.tracking.stage,
    model: options.model,
    provider_request_id: options.requestId === 'unknown' ? null : options.requestId,
    response_status: options.responseStatus,
    http_status: options.httpStatus,
    input_tokens: usage ? tokenCount(usage.input_tokens) : null,
    output_tokens: usage ? tokenCount(usage.output_tokens) : null,
    cache_creation_input_tokens: usage ? tokenCount(usage.cache_creation_input_tokens) : null,
    cache_read_input_tokens: usage ? tokenCount(usage.cache_read_input_tokens) : null,
    provider_error_type: options.providerErrorType ?? null,
  }, { onConflict: 'provider_request_id', ignoreDuplicates: true })
  if (error) console.error(JSON.stringify({ event: 'anthropic_usage_record_failed', errorCode: error.code ?? 'UNKNOWN' }))
}

export async function callClaudeJson<T>(options: {
  model: string
  system: string
  prompt: string
  schema: Record<string, unknown>
  validator: z.ZodType<T>
  maxTokens?: number
  tracking?: ClaudeTracking
}): Promise<T> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY_MISSING')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens ?? 8192,
      system: options.system,
      messages: [{ role: 'user', content: options.prompt }],
      output_config: { format: { type: 'json_schema', schema: options.schema } },
    }),
  })
  if (!response.ok) {
    const requestId = response.headers.get('request-id') ?? 'unknown'
    const payload = await response.json().catch(() => ({})) as ClaudeErrorResponse
    const type = safeProviderError(payload.error?.type ?? 'api_error')
    const detail = safeProviderError(payload.error?.message ?? 'Request rejected')
    await recordAnthropicUsage({ tracking: options.tracking, model: options.model, requestId, responseStatus: 'API_REJECTED', httpStatus: response.status, providerErrorType: type })
    throw new Error(`ANTHROPIC_${response.status}_${type}_${requestId}: ${detail}`)
  }
  const payload = await response.json() as ClaudeResponse
  await recordAnthropicUsage({
    tracking: options.tracking, model: options.model, requestId: response.headers.get('request-id') ?? 'unknown',
    responseStatus: 'API_SUCCEEDED', httpStatus: response.status, usage: payload.usage,
  })
  if (payload.stop_reason === 'refusal') throw new Error('ANTHROPIC_REFUSAL')
  const text = payload.content?.find((block) => block.type === 'text')?.text
  if (!text) throw new Error('ANTHROPIC_EMPTY_RESPONSE')
  return options.validator.parse(JSON.parse(text))
}
