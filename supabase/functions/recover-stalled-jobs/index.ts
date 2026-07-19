import { serviceClient } from '../_shared/client.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { invokeFunction, positiveIntegerEnv, requireServiceAuthorization } from '../_shared/pipeline.ts'

function functionForStatus(status: string): string | null {
  if (['PREPARING', 'VALIDATING_ARCHIVE', 'EXTRACTING', 'BUILDING_INVENTORY', 'SCANNING_CONFIDENTIAL_DATA', 'MASKING_CONTENT'].includes(status)) return 'prepare-project'
  if (status === 'CREATING_REVIEW_UNITS') return 'create-review-units'
  if (status === 'AI_REVIEW_IN_PROGRESS') return 'process-review-units'
  if (status === 'VALIDATING_FINDINGS') return 'validate-findings'
  if (['CALCULATING_SCORES', 'GENERATING_REPORT', 'FINAL_CONFIDENTIALITY_CHECK'].includes(status)) return 'finalize-report'
  return null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    requireServiceAuthorization(request)
    const admin = serviceClient()
    const now = new Date()
    const stalledBefore = new Date(now.getTime() - positiveIntegerEnv('STALLED_JOB_TIMEOUT_MINUTES', 10, 60) * 60_000).toISOString()
    const maximumRetries = positiveIntegerEnv('MAX_RETRY_COUNT', 3, 5)
    const { data: jobs, error: jobsError } = await admin.from('analysis_jobs').select('id,status,retry_count').lt('last_heartbeat_at', stalledBefore).not('status', 'in', '(COMPLETED,PARTIALLY_COMPLETED,CANCELLED,FAILED,EXPIRED)').limit(20)
    if (jobsError) throw jobsError
    let recovered = 0
    let failed = 0
    for (const job of jobs ?? []) {
      const next = functionForStatus(job.status)
      if (!next || Number(job.retry_count) >= maximumRetries) {
        await admin.from('analysis_jobs').update({ status: 'FAILED', current_stage: 'Recovery exhausted', masked_error_code: 'MAX_RETRIES_EXCEEDED', masked_error_message: 'Processing could not be recovered.', completed_at: now.toISOString(), lease_token: null, lease_expires_at: null }).eq('id', job.id)
        failed += 1
        continue
      }
      await admin.from('analysis_jobs').update({ retry_count: Number(job.retry_count) + 1, lease_token: null, lease_expires_at: null, last_heartbeat_at: now.toISOString() }).eq('id', job.id)
      await invokeFunction(next, { jobId: job.id })
      recovered += 1
    }

    const { data: expiredUploads, error: uploadError } = await admin.from('project_uploads').select('id,storage_path').lt('expires_at', now.toISOString()).neq('status', 'EXPIRED').limit(100)
    if (uploadError) throw uploadError
    for (const upload of expiredUploads ?? []) {
      const { error } = await admin.storage.from('project-uploads').remove([upload.storage_path])
      if (!error) await admin.from('project_uploads').update({ status: 'EXPIRED' }).eq('id', upload.id)
    }

    const maskedCutoff = new Date(now.getTime() - positiveIntegerEnv('MASKED_ARTIFACT_RETENTION_HOURS', 24, 168) * 3_600_000).toISOString()
    const { data: completedJobs } = await admin.from('analysis_jobs').select('id,owner_id,project_id,completed_at,stage_metadata_json').in('status', ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED']).lt('completed_at', maskedCutoff).limit(20)
    for (const job of completedJobs ?? []) {
      const metadata = typeof job.stage_metadata_json === 'object' && job.stage_metadata_json ? job.stage_metadata_json as Record<string, unknown> : {}
      if (metadata.maskedArtifactsDeleted) continue
      const prefix = `${job.owner_id}/${job.project_id}/${job.id}/files`
      const { data: objects, error: listError } = await admin.storage.from('masked-analysis').list(prefix, { limit: 1000 })
      if (listError) continue
      if (objects?.length) await admin.storage.from('masked-analysis').remove(objects.map((object) => `${prefix}/${object.name}`))
      if ((objects?.length ?? 0) < 1000) await admin.from('analysis_jobs').update({ stage_metadata_json: { ...metadata, maskedArtifactsDeleted: true } }).eq('id', job.id)
    }

    const { data: expiredJobs } = await admin.from('analysis_jobs').select('id,owner_id,project_id').lt('expires_at', now.toISOString()).in('status', ['COMPLETED', 'PARTIALLY_COMPLETED']).limit(20)
    for (const job of expiredJobs ?? []) {
      const prefix = `${job.owner_id}/${job.project_id}/${job.id}`
      const { data: objects } = await admin.storage.from('report-exports').list(prefix, { limit: 100 })
      if (objects?.length) await admin.storage.from('report-exports').remove(objects.map((object) => `${prefix}/${object.name}`))
      await admin.from('analysis_jobs').update({ status: 'EXPIRED', current_stage: 'Report expired' }).eq('id', job.id)
    }
    return json({ recovered, failed, uploadsExpired: expiredUploads?.length ?? 0 })
  } catch (error) {
    return json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'RECOVERY_FAILED' }, error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500)
  }
})
