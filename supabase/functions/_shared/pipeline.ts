import { serviceClient } from './client.ts'

export const TERMINAL_JOB_STATUSES = ['COMPLETED', 'PARTIALLY_COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED'] as const

export function requireServiceAuthorization(request: Request): void {
  const secret = Deno.env.get('PIPELINE_INTERNAL_SECRET') ?? ''
  if (!secret || request.headers.get('x-pipeline-secret') !== secret) throw new Error('UNAUTHORIZED')
}

export function waitUntil(promise: Promise<unknown>): void {
  const runtime = globalThis as unknown as { EdgeRuntime?: { waitUntil: (work: Promise<unknown>) => void } }
  if (runtime.EdgeRuntime) runtime.EdgeRuntime.waitUntil(promise)
  else void promise
}

export async function invokeFunction(name: string, body: unknown): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const pipelineSecret = Deno.env.get('PIPELINE_INTERNAL_SECRET') ?? ''
  if (!pipelineSecret) throw new Error('PIPELINE_INTERNAL_SECRET_MISSING')
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json', 'x-pipeline-secret': pipelineSecret },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`FUNCTION_${name.toUpperCase().replaceAll('-', '_')}_${response.status}`)
}

export async function heartbeat(jobId: string, values: Record<string, unknown> = {}): Promise<void> {
  const { error } = await serviceClient().from('analysis_jobs').update({ ...values, last_heartbeat_at: new Date().toISOString() }).eq('id', jobId)
  if (error) throw error
}

export async function failJob(jobId: string, code: string, message: string): Promise<void> {
  await serviceClient().from('analysis_jobs').update({
    status: 'FAILED', current_stage: 'Analysis failed', masked_error_code: code,
    masked_error_message: message.slice(0, 500), completed_at: new Date().toISOString(),
    lease_token: null, lease_expires_at: null, last_heartbeat_at: new Date().toISOString(),
  }).eq('id', jobId)
}

export async function recordProcessingError(input: {
  jobId: string
  reviewUnitId?: string
  functionName: string
  stage: string
  errorCode: string
  error: unknown
}): Promise<void> {
  const rawDetail = input.error instanceof Error ? input.error.message : 'Unknown error'
  const technicalDetail = rawDetail
    .replace(/(?:sk-ant-|Bearer\s+)[A-Za-z0-9._-]+/gi, '[REDACTED]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 1000)
  const requestId = technicalDetail.match(/req_[A-Za-z0-9]+/)?.[0] ?? null
  const { error } = await serviceClient().from('processing_error_logs').insert({
    analysis_job_id: input.jobId,
    review_unit_id: input.reviewUnitId ?? null,
    function_name: input.functionName,
    stage: input.stage,
    error_code: input.errorCode,
    error_name: input.error instanceof Error ? input.error.name : 'UnknownError',
    technical_detail: technicalDetail,
    provider_request_id: requestId,
  })
  if (error) console.error('processing error log insert failed', error.code ?? 'UNKNOWN')
}

export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function positiveIntegerEnv(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(Deno.env.get(name) ?? fallback)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), maximum) : fallback
}
