import { z } from 'npm:zod@3.24.1'
import { serviceClient } from '../_shared/client.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { failJob, invokeFunction, positiveIntegerEnv, requireServiceAuthorization, waitUntil } from '../_shared/pipeline.ts'

const inputSchema = z.object({ jobId: z.string().uuid() })
interface RepositoryFile { id: string; relative_path_masked: string; metadata_type: string | null; size_bytes: number }
interface ReviewGroup { key: string; files: RepositoryFile[] }

function featureKey(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const bundle = normalized.match(/\/(lwc|aura)\/([^/]+)\//i)
  if (bundle) return `${bundle[1].toLowerCase()}:${bundle[2].toLowerCase()}`
  const filename = (normalized.split('/').pop() ?? normalized)
    .replace(/-meta\.xml$/i, '').replace(/\.[^.]+$/, '')
  return filename.replace(/(?:tests?|trigger|handler|controller|service|selector|domain|queueable|batch|helper|util)$/i, '').toLowerCase() || filename.toLowerCase()
}

function buildGroups(files: RepositoryFile[], maximumFiles: number, maximumBytes: number): ReviewGroup[] {
  const related = new Map<string, RepositoryFile[]>()
  for (const file of files) {
    const key = featureKey(file.relative_path_masked)
    related.set(key, [...(related.get(key) ?? []), file])
  }
  const groups: ReviewGroup[] = []
  for (const [key, members] of [...related.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = members.sort((a, b) => a.relative_path_masked.localeCompare(b.relative_path_masked))
    let chunk: RepositoryFile[] = []
    let chunkBytes = 0
    for (const file of ordered) {
      if (chunk.length && (chunk.length >= maximumFiles || chunkBytes + Number(file.size_bytes) > maximumBytes)) {
        groups.push({ key, files: chunk })
        chunk = []
        chunkBytes = 0
      }
      chunk.push(file)
      chunkBytes += Number(file.size_bytes)
    }
    if (chunk.length) groups.push({ key, files: chunk })
  }
  return groups
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let jobId = ''
  try {
    requireServiceAuthorization(request)
    jobId = inputSchema.parse(await request.json()).jobId
    const admin = serviceClient()
    const { data: current, error: currentError } = await admin.from('analysis_jobs').select('status,cancel_requested_at').eq('id', jobId).single()
    if (currentError) throw currentError
    if (current.cancel_requested_at) {
      await admin.from('analysis_jobs').update({ status: 'CANCELLED', current_stage: 'Cancelled', completed_at: new Date().toISOString() }).eq('id', jobId)
      return json({ jobId, status: 'CANCELLED' })
    }
    const { data: claimed, error: claimError } = await admin.rpc('claim_analysis_stage', {
      p_job_id: jobId, p_allowed_statuses: ['CREATING_REVIEW_UNITS'], p_next_status: 'CREATING_REVIEW_UNITS',
      p_current_stage: 'Dependency-aware review grouping', p_lease_seconds: 120,
    })
    if (claimError) throw claimError
    const claim = claimed?.[0]
    if (!claim) return json({ jobId, status: 'BUSY' }, 202)

    const { data: rows, error: fileError } = await admin.from('repository_files')
      .select('id,relative_path_masked,metadata_type,size_bytes').eq('analysis_job_id', jobId).eq('status', 'INCLUDED').order('relative_path_masked')
    if (fileError) throw fileError
    const files = (rows ?? []) as RepositoryFile[]
    const groups = buildGroups(files, positiveIntegerEnv('MAX_REVIEW_UNIT_FILES', 15, 15), positiveIntegerEnv('MAX_REVIEW_UNIT_CHARS', 600000, 750000))
    const cursor = Number(claim.stage_cursor ?? 0)
    const batch = groups.slice(cursor, cursor + 50)
    for (let offset = 0; offset < batch.length; offset += 1) {
      const group = batch[offset]
      const sequence = cursor + offset + 1
      const estimatedTokens = Math.ceil(group.files.reduce((sum, file) => sum + Number(file.size_bytes), 0) / 4)
      const { data: unit, error: unitError } = await admin.from('review_units').upsert({
        analysis_job_id: jobId, sequence_number: sequence, review_type: group.key,
        status: 'PENDING', estimated_input_tokens: estimatedTokens,
      }, { onConflict: 'analysis_job_id,sequence_number' }).select('id').single()
      if (unitError) throw unitError
      const links = group.files.map((file) => ({ review_unit_id: unit.id, repository_file_id: file.id }))
      if (links.length) {
        const { error: linkError } = await admin.from('review_unit_files').upsert(links, { onConflict: 'review_unit_id,repository_file_id' })
        if (linkError) throw linkError
      }
    }

    const nextCursor = cursor + batch.length
    const done = nextCursor >= groups.length
    const { error: updateError } = await admin.from('analysis_jobs').update({
      status: done ? 'AI_REVIEW_IN_PROGRESS' : 'CREATING_REVIEW_UNITS',
      current_stage: done ? 'Claude review' : 'Dependency-aware review grouping',
      progress_percentage: done ? 55 : 50, total_review_units: groups.length,
      stage_cursor: done ? 0 : nextCursor, lease_token: null, lease_expires_at: null,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId).eq('lease_token', claim.lease_token)
    if (updateError) throw updateError
    waitUntil(invokeFunction(done ? 'process-review-units' : 'create-review-units', { jobId }))
    return json({ jobId, status: done ? 'AI_REVIEW_IN_PROGRESS' : 'CREATING_REVIEW_UNITS', reviewUnits: groups.length }, 202)
  } catch (error) {
    if (jobId) await failJob(jobId, 'CREATE_REVIEW_UNITS_FAILED', 'Review-unit creation failed.')
    return json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'CREATE_REVIEW_UNITS_FAILED' }, error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500)
  }
})
