import { BlobReader, BlobWriter, ZipReader, configure } from 'npm:@zip.js/zip.js@2.7.57'
import { z } from 'npm:zod@3.24.1'
import { serviceClient } from '../_shared/client.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { extensionOf, isExecutablePath, isIgnoredPath, isSupportedPath, maskPath, metadataType, normalizeArchivePath } from '../_shared/files.ts'
import { maskConfidentialContent } from '../_shared/masking.ts'
import { failJob, invokeFunction, positiveIntegerEnv, requireServiceAuthorization, sha256, waitUntil } from '../_shared/pipeline.ts'

const inputSchema = z.object({ jobId: z.string().uuid() })

interface ArchiveEntry {
  filename: string
  directory: boolean
  encrypted?: boolean
  compressedSize?: number
  uncompressedSize: number
  externalFileAttributes?: number
  getData: (writer: BlobWriter) => Promise<Blob | undefined>
}

function unixMode(entry: ArchiveEntry): number {
  return ((entry.externalFileAttributes ?? 0) >>> 16) & 0xffff
}

function isSymbolicLink(entry: ArchiveEntry): boolean {
  return (unixMode(entry) & 0o170000) === 0o120000
}

async function countFiles(jobId: string, status?: string): Promise<number> {
  let query = serviceClient().from('repository_files').select('id', { count: 'exact', head: true }).eq('analysis_job_id', jobId)
  if (status) query = query.eq('status', status)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let jobId = ''
  let archive: ZipReader<Blob> | null = null
  try {
    requireServiceAuthorization(request)
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
    jobId = inputSchema.parse(await request.json()).jobId
    const admin = serviceClient()
    const { data: current, error: currentError } = await admin.from('analysis_jobs')
      .select('id,status,owner_id,project_id,upload_id,cancel_requested_at').eq('id', jobId).single()
    if (currentError) throw currentError
    if (current.cancel_requested_at) {
      await admin.from('analysis_jobs').update({ status: 'CANCELLED', current_stage: 'Cancelled', completed_at: new Date().toISOString() }).eq('id', jobId)
      return json({ jobId, status: 'CANCELLED' })
    }
    if (['COMPLETED', 'PARTIALLY_COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED'].includes(current.status)) return json({ jobId, status: current.status })

    const nextStatus = current.status === 'PREPARING' ? 'VALIDATING_ARCHIVE' : 'MASKING_CONTENT'
    const { data: claimed, error: claimError } = await admin.rpc('claim_analysis_stage', {
      p_job_id: jobId, p_allowed_statuses: [current.status], p_next_status: nextStatus,
      p_current_stage: nextStatus === 'VALIDATING_ARCHIVE' ? 'Archive validation' : 'Confidential-data masking', p_lease_seconds: 140,
    })
    if (claimError) throw claimError
    const claim = claimed?.[0]
    if (!claim) return json({ jobId, status: 'BUSY' }, 202)

    const { data: upload, error: uploadError } = await admin.from('project_uploads').select('storage_path').eq('id', claim.upload_id).single()
    if (uploadError) throw uploadError
    const { data: archiveBlob, error: downloadError } = await admin.storage.from('project-uploads').download(upload.storage_path)
    if (downloadError || !archiveBlob) throw downloadError ?? new Error('UPLOAD_DOWNLOAD_FAILED')

    archive = new ZipReader(new BlobReader(archiveBlob))
    configure({ useWebWorkers: false })
    const entries = (await archive.getEntries()) as unknown as ArchiveEntry[]
    const maxFileCount = positiveIntegerEnv('MAX_FILE_COUNT', 10000, 10000)
    const maxExtractedBytes = positiveIntegerEnv('MAX_EXTRACTED_SIZE_MB', 100, 100) * 1024 * 1024
    const maxIndividualBytes = positiveIntegerEnv('MAX_INDIVIDUAL_FILE_SIZE_MB', 5, 10) * 1024 * 1024
    const maxCompressionRatio = positiveIntegerEnv('MAX_COMPRESSION_RATIO', 25, 100)
    const files = entries.filter((entry) => !entry.directory)
    if (files.length > maxFileCount) throw new Error('ARCHIVE_FILE_COUNT_EXCEEDED')
    const declaredBytes = files.reduce((sum, entry) => sum + Math.max(0, entry.uncompressedSize), 0)
    if (declaredBytes > maxExtractedBytes) throw new Error('ARCHIVE_EXTRACTED_SIZE_EXCEEDED')

    for (const entry of files) {
      normalizeArchivePath(entry.filename)
      if (entry.encrypted) throw new Error('ARCHIVE_PASSWORD_PROTECTED')
      if (isSymbolicLink(entry)) throw new Error('ARCHIVE_SYMBOLIC_LINK')
      if ((unixMode(entry) & 0o111) !== 0 || isExecutablePath(entry.filename)) throw new Error('ARCHIVE_EXECUTABLE_FILE')
      if (entry.uncompressedSize > 1024 * 1024 && entry.uncompressedSize / Math.max(1, entry.compressedSize ?? 0) > maxCompressionRatio) throw new Error('ARCHIVE_COMPRESSION_RATIO_EXCEEDED')
    }

    let cursor = Number(claim.stage_cursor ?? 0)
    let extractedThisRun = 0
    const batchSize = positiveIntegerEnv('PREPARE_FILES_PER_INVOCATION', 5, 10)
    while (cursor < entries.length && extractedThisRun < batchSize) {
      const entry = entries[cursor] as ArchiveEntry
      cursor += 1
      if (entry.directory) continue
      const path = normalizeArchivePath(entry.filename)
      const maskedPath = maskPath(path)
      const fallbackHash = await sha256(`${path}:${entry.uncompressedSize}`)
      const baseRecord = {
        analysis_job_id: jobId, relative_path_masked: maskedPath, file_type: extensionOf(path) || 'unknown',
        metadata_type: metadataType(path), file_hash: fallbackHash, size_bytes: Math.max(0, entry.uncompressedSize),
      }
      if (isIgnoredPath(path)) {
        const { error } = await admin.from('repository_files').upsert({ ...baseRecord, status: 'EXCLUDED', is_excluded: true, exclusion_reason: 'IGNORED_DIRECTORY' }, { onConflict: 'analysis_job_id,relative_path_masked' })
        if (error) throw error
        continue
      }
      if (!isSupportedPath(path)) {
        const { error } = await admin.from('repository_files').upsert({ ...baseRecord, status: 'UNSUPPORTED', is_excluded: true, exclusion_reason: 'UNSUPPORTED_FILE_TYPE' }, { onConflict: 'analysis_job_id,relative_path_masked' })
        if (error) throw error
        continue
      }
      if (entry.uncompressedSize > maxIndividualBytes) {
        const { error } = await admin.from('repository_files').upsert({ ...baseRecord, status: 'EXCLUDED', is_excluded: true, exclusion_reason: 'INDIVIDUAL_FILE_SIZE_EXCEEDED' }, { onConflict: 'analysis_job_id,relative_path_masked' })
        if (error) throw error
        continue
      }

      const blob = await entry.getData(new BlobWriter('text/plain'))
      if (!blob || blob.size > maxIndividualBytes) throw new Error('ARCHIVE_ENTRY_SIZE_MISMATCH')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      if (bytes.includes(0)) {
        const { error } = await admin.from('repository_files').upsert({ ...baseRecord, size_bytes: bytes.byteLength, status: 'EXCLUDED', is_excluded: true, exclusion_reason: 'BINARY_CONTENT' }, { onConflict: 'analysis_job_id,relative_path_masked' })
        if (error) throw error
        continue
      }
      const source = new TextDecoder().decode(bytes)
      const masked = maskConfidentialContent(source)
      const fileHash = await sha256(bytes)
      const maskedStoragePath = `${claim.owner_id}/${claim.project_id}/${jobId}/files/${cursor.toString().padStart(6, '0')}-${fileHash.slice(0, 16)}.txt`
      const { error: storageError } = await admin.storage.from('masked-analysis').upload(maskedStoragePath, masked.masked, { contentType: 'text/plain; charset=utf-8', upsert: true })
      if (storageError) throw storageError
      const { error: fileError } = await admin.from('repository_files').upsert({
        ...baseRecord, storage_path_masked: maskedStoragePath, file_hash: fileHash, size_bytes: bytes.byteLength,
        status: 'INCLUDED', contains_sensitive_data: masked.replacementCount > 0, is_excluded: false, exclusion_reason: null,
      }, { onConflict: 'analysis_job_id,relative_path_masked' })
      if (fileError) throw fileError
      extractedThisRun += 1
    }

    const done = cursor >= entries.length
    const progress = done ? 48 : Math.min(46, 12 + Math.round((cursor / Math.max(entries.length, 1)) * 34))
    const update: Record<string, unknown> = {
      status: done ? 'CREATING_REVIEW_UNITS' : 'MASKING_CONTENT',
      current_stage: done ? 'Review grouping' : 'Confidential-data masking',
      progress_percentage: progress, stage_cursor: done ? 0 : cursor,
      stage_metadata_json: { archiveEntries: entries.length, declaredExtractedBytes: declaredBytes },
      lease_token: null, lease_expires_at: null, last_heartbeat_at: new Date().toISOString(),
    }
    if (done) {
      update.total_files = await countFiles(jobId)
      update.included_files = await countFiles(jobId, 'INCLUDED')
      update.supported_files = update.included_files
      update.excluded_files = await countFiles(jobId, 'EXCLUDED')
      update.unsupported_files = await countFiles(jobId, 'UNSUPPORTED')
      const { data: hashes, error: hashError } = await admin.from('repository_files').select('file_hash').eq('analysis_job_id', jobId).eq('status', 'INCLUDED').order('relative_path_masked')
      if (hashError) throw hashError
      await admin.from('project_uploads').update({ repository_hash: await sha256((hashes ?? []).map((row) => row.file_hash).join(':')), status: 'PREPARED' }).eq('id', claim.upload_id)
    }
    const { error: updateError } = await admin.from('analysis_jobs').update(update).eq('id', jobId).eq('lease_token', claim.lease_token)
    if (updateError) throw updateError

    const next = invokeFunction(done ? 'create-review-units' : 'prepare-project', { jobId })
    waitUntil(next)
    return json({ jobId, status: done ? 'CREATING_REVIEW_UNITS' : 'MASKING_CONTENT', cursor }, 202)
  } catch (error) {
    if (jobId) await failJob(jobId, error instanceof Error ? error.message.split(':')[0] : 'PREPARE_PROJECT_FAILED', 'Secure archive preparation failed.')
    const status = error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500
    return json({ error: status === 401 ? 'UNAUTHORIZED' : 'PREPARE_PROJECT_FAILED' }, status)
  } finally {
    if (archive) await archive.close().catch(() => undefined)
  }
})
