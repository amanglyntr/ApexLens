import { z } from 'npm:zod@3.24.1'
import { serviceClient } from '../_shared/client.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { requireApprovedUser } from '../_shared/access.ts'

const inputSchema = z.object({ jobId: z.string().uuid() })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const { user } = await requireApprovedUser(request)
    const { jobId } = inputSchema.parse(await request.json())
    const admin = serviceClient()
    const { data: job, error } = await admin.from('analysis_jobs').select('id,status').eq('id', jobId).eq('owner_id', user.id).maybeSingle()
    if (error) throw error
    if (!job) return json({ error: 'ANALYSIS_NOT_FOUND' }, 404)
    if (['COMPLETED', 'PARTIALLY_COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED'].includes(job.status)) return json({ jobId, status: job.status })
    const now = new Date().toISOString()
    await admin.from('analysis_jobs').update({ status: 'CANCEL_REQUESTED', current_stage: 'Cancellation requested', cancel_requested_at: now, lease_expires_at: now, last_heartbeat_at: now }).eq('id', jobId)
    await admin.from('review_units').update({ status: 'CANCELLED', lease_token: null, lease_expires_at: null, completed_at: now }).eq('analysis_job_id', jobId).in('status', ['PENDING', 'PROCESSING'])
    await admin.from('analysis_jobs').update({ status: 'CANCELLED', current_stage: 'Cancelled', completed_at: now }).eq('id', jobId)
    return json({ jobId, status: 'CANCELLED' })
  } catch (error) {
    console.error('cancel-analysis failed', error instanceof Error ? error.name : 'UnknownError')
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return json({ error: 'UNAUTHENTICATED' }, 401)
    if (error instanceof Error && error.message === 'ACCESS_DENIED') return json({ error: 'ACCESS_DENIED' }, 403)
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'INVALID_REQUEST' }, 400)
    return json({ error: 'CANCEL_ANALYSIS_FAILED' }, 500)
  }
})
