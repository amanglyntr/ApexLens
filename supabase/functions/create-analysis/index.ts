import { corsHeaders, json } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/client.ts'
import { createAnalysisRequestSchema } from '../_shared/schemas.ts'
import { invokeFunction, waitUntil } from '../_shared/pipeline.ts'
import { requireApprovedUser } from '../_shared/access.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const { user } = await requireApprovedUser(request)
    const input = createAnalysisRequestSchema.parse(await request.json())
    if (!input.storagePath.startsWith(`${user.id}/${input.projectId}/`)) return json({ error: 'INVALID_STORAGE_PATH' }, 400)
    if (!input.storagePath.toLowerCase().endsWith('.zip')) return json({ error: 'ZIP_REQUIRED' }, 400)

    const admin = serviceClient()
    const { data: project } = await admin.from('projects').select('id').eq('id', input.projectId).eq('owner_id', user.id).maybeSingle()
    if (!project) return json({ error: 'PROJECT_NOT_FOUND' }, 404)
    const segments = input.storagePath.split('/')
    const filename = segments.pop() ?? ''
    const folder = segments.join('/')
    const { data: objects, error: storageError } = await admin.storage.from('project-uploads').list(folder, { search: filename, limit: 2 })
    const object = objects?.find((item) => item.name === filename)
    if (storageError || !object) return json({ error: 'UPLOAD_NOT_FOUND' }, 404)
    const compressedSize = Number(object.metadata?.size ?? 0)
    if (!Number.isFinite(compressedSize) || compressedSize <= 0 || compressedSize > 50 * 1024 * 1024) return json({ error: 'UPLOAD_SIZE_INVALID' }, 400)

    const now = Date.now()
    const uploadExpiresAt = new Date(now + input.retentionHours * 3_600_000).toISOString()
    const jobExpiresAt = new Date(now + Number(Deno.env.get('REPORT_RETENTION_DAYS') ?? 30) * 86_400_000).toISOString()
    const { data: upload, error: uploadError } = await admin.from('project_uploads').insert({
      project_id: input.projectId, owner_id: user.id, storage_path: input.storagePath,
      original_filename_masked: filename.replace(/[^.]/g, '*'), compressed_size: compressedSize, status: 'UPLOADED', expires_at: uploadExpiresAt,
    }).select('id').single()
    if (uploadError) throw uploadError
    const { data: job, error: jobError } = await admin.from('analysis_jobs').insert({
      project_id: input.projectId, upload_id: upload.id, owner_id: user.id, status: 'PREPARING',
      current_stage: 'Secure upload', progress_percentage: 2, started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(), expires_at: jobExpiresAt,
    }).select('id,status').single()
    if (jobError) throw jobError
    waitUntil(invokeFunction('prepare-project', { jobId: job.id }))
    return json({ jobId: job.id, status: job.status }, 202)
  } catch (error) {
    console.error('create-analysis failed', error instanceof Error ? error.name : 'UnknownError')
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return json({ error: 'UNAUTHENTICATED' }, 401)
    if (error instanceof Error && error.message === 'ACCESS_DENIED') return json({ error: 'ACCESS_DENIED' }, 403)
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'INVALID_REQUEST' }, 400)
    return json({ error: 'CREATE_ANALYSIS_FAILED' }, 500)
  }
})
