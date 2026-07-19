import { zipSync } from 'npm:fflate@0.8.2'
import { z } from 'npm:zod@3.24.1'
import { callClaudeJson } from '../_shared/anthropic.ts'
import { serviceClient } from '../_shared/client.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { maskConfidentialContent } from '../_shared/masking.ts'
import { createTextPdf, type PdfBlock } from '../_shared/pdf.ts'
import { calculateScores, type ScoreCategory, type ScoreSeverity } from '../_shared/scoring.ts'
import { failJob, recordProcessingError, requireServiceAuthorization } from '../_shared/pipeline.ts'

const inputSchema = z.object({ jobId: z.string().uuid() })
const summarySchema = z.object({ architectureSummary: z.string(), topRecommendations: z.array(z.string()).max(12), limitations: z.array(z.string()).max(20) })
const summaryJsonSchema: Record<string, unknown> = {
  type: 'object', additionalProperties: false,
  properties: {
    architectureSummary: { type: 'string' }, topRecommendations: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  }, required: ['architectureSummary', 'topRecommendations', 'limitations'],
}

const escapeHtml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const exportName = (value: string) => value.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'Salesforce-project'
const exportTimestamp = (date: Date) => date.toISOString().replace('T', '_').replace(/[:.]/g, '-').replace('Z', '_UTC')

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let jobId = ''
  try {
    requireServiceAuthorization(request)
    jobId = inputSchema.parse(await request.json()).jobId
    const admin = serviceClient()
    const { data: job, error: jobError } = await admin.from('analysis_jobs').select('*').eq('id', jobId).single()
    if (jobError) throw jobError
    const { data: project, error: projectError } = await admin.from('projects').select('name').eq('id', job.project_id).single()
    if (projectError) throw projectError
    if (job.cancel_requested_at) {
      await admin.from('analysis_jobs').update({ status: 'CANCELLED', current_stage: 'Cancelled', completed_at: new Date().toISOString() }).eq('id', jobId)
      return json({ jobId, status: 'CANCELLED' })
    }
    const { data: claimed, error: claimError } = await admin.rpc('claim_analysis_stage', {
      p_job_id: jobId, p_allowed_statuses: ['CALCULATING_SCORES', 'GENERATING_REPORT'], p_next_status: 'GENERATING_REPORT',
      p_current_stage: 'Final report generation', p_lease_seconds: 360,
    })
    if (claimError) throw claimError
    const claim = claimed?.[0]
    if (!claim) return json({ jobId, status: 'BUSY' }, 202)

    const { data: findings, error: findingsError } = await admin.from('findings').select('*').eq('analysis_job_id', jobId).eq('validation_status', 'VALIDATED').order('severity').order('created_at')
    if (findingsError) throw findingsError
    const { data: observations, error: observationError } = await admin.from('positive_observations').select('title,description').eq('analysis_job_id', jobId)
    if (observationError) throw observationError
    const { data: units, error: unitError } = await admin.from('review_units').select('limitations_json,status').eq('analysis_job_id', jobId)
    if (unitError) throw unitError
    const { data: repositoryFiles, error: repositoryFileError } = await admin.from('repository_files').select('file_type').eq('analysis_job_id', jobId).eq('status', 'INCLUDED')
    if (repositoryFileError) throw repositoryFileError

    const severityRank: Record<string, number> = { CRITICAL: 0, MAJOR: 1, MODERATE: 2, MINOR: 3, INFORMATIONAL: 4 }
    const validatedFindings = [...(findings ?? [])].sort((a, b) => (severityRank[a.severity] ?? 5) - (severityRank[b.severity] ?? 5))
    const scoreInput = validatedFindings.map((finding) => ({ category: finding.category as ScoreCategory, severity: finding.severity as ScoreSeverity, validationStatus: finding.validation_status, subcategory: finding.subcategory, title: finding.title }))
    const uiFileTypes = new Set(['js', 'ts', 'html', 'css', 'cmp', 'app', 'page', 'component'])
    const uiUxApplicable = (repositoryFiles ?? []).some((file) => uiFileTypes.has(file.file_type))
    const applicableReviewAreas: ScoreCategory[] = ['SECURITY', 'DESIGN', 'DEVELOPER_QUALITY', 'UNIT_TESTING', 'CONFIGURATION', ...(uiUxApplicable ? ['UI_UX' as const] : [])]
    const scores = calculateScores(scoreInput, applicableReviewAreas)
    const persistedLimitations = (units ?? []).flatMap((unit) => Array.isArray(unit.limitations_json) ? unit.limitations_json.filter((item): item is string => typeof item === 'string') : [])
    if (Number(job.failed_review_units) > 0) persistedLimitations.push(`${job.failed_review_units} review unit(s) failed after retries.`)
    persistedLimitations.push('Static review does not prove runtime behavior or actual Apex test coverage.')
    const summaryFindings = validatedFindings.slice(0, 200)
    const summaryObservations = (observations ?? []).slice(0, 100)
    if (validatedFindings.length > summaryFindings.length) persistedLimitations.push(`The narrative summary used the 200 highest-priority findings; all ${validatedFindings.length} validated findings remain in the exports.`)
    const summary = await callClaudeJson({
      model: Deno.env.get('CLAUDE_REPORT_MODEL') ?? 'claude-sonnet-5',
      system: 'Create a concise Salesforce architecture report from persisted structured results only. Do not infer new source findings, credentials, coverage percentages, hours, or runtime behavior. Prioritize remediation by severity and impact.',
      prompt: JSON.stringify({ inventory: { totalFiles: job.total_files, includedFiles: job.included_files, excludedFiles: job.excluded_files, unsupportedFiles: job.unsupported_files }, applicableReviewAreas, scores, findings: summaryFindings, positiveObservations: summaryObservations, limitations: persistedLimitations }),
      schema: summaryJsonSchema, validator: summarySchema, maxTokens: 5000,
      tracking: { analysisJobId: jobId, stage: 'REPORT' },
    })
    const limitations = [...new Set([...persistedLimitations, ...summary.limitations])]
    const safeSummary = maskConfidentialContent(summary.architectureSummary).masked
    const safeRecommendations = summary.topRecommendations.map((item) => maskConfidentialContent(item).masked)
    const generatedAt = new Date()
    const generatedAtIso = generatedAt.toISOString()
    const reportStem = `${exportName(project.name)}_${exportTimestamp(generatedAt)}`
    const reportObject = {
      version: 1, jobId, projectName: project.name, generatedAt: generatedAtIso, overallScore: scores.overallScore, overallGrade: scores.grade,
      categoryScores: scores.categoryScores, applicableReviewAreas, inventory: { totalFiles: job.total_files, includedFiles: job.included_files, excludedFiles: job.excluded_files, unsupportedFiles: job.unsupported_files },
      architectureSummary: safeSummary, topRecommendations: safeRecommendations, positiveObservations: observations ?? [], limitations, findings: validatedFindings,
    }
    const jsonReport = maskConfidentialContent(JSON.stringify(reportObject, null, 2)).masked
    const csvHeader = ['Severity', 'Category', 'Title', 'File', 'Method', 'Issue', 'Impact', 'Recommendation'].map(csvCell).join(',')
    const csvRows = validatedFindings.map((finding) => [finding.severity, finding.category, finding.title, finding.masked_file_path, finding.method_name, finding.issue, finding.impact, finding.recommendation].map(csvCell).join(','))
    const csvReport = maskConfidentialContent([csvHeader, ...csvRows].join('\r\n')).masked
    const markdown = maskConfidentialContent(`# ${project.name} remediation plan\n\nGenerated: ${generatedAtIso}\n\nGrade: **${scores.grade}** (${scores.overallScore}/100)\n\n## Immediate and next-sprint priorities\n\n${safeRecommendations.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\n## Limitations\n\n${limitations.map((item) => `- ${item}`).join('\n')}`).masked
    const categoryHtml = Object.entries(scores.categoryScores).map(([category, score]) => `<div class="score"><span>${escapeHtml(category.replaceAll('_', ' '))}</span><strong>${score}/100</strong></div>`).join('')
    const observationHtml = (observations ?? []).map((observation) => `<li><strong>${escapeHtml(observation.title)}:</strong> ${escapeHtml(observation.description)}</li>`).join('')
    const findingHtml = validatedFindings.map((finding) => `<article><div class="finding-head"><span class="severity">${escapeHtml(finding.severity)}</span><span>${escapeHtml(finding.category.replaceAll('_', ' '))}</span></div><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.issue)}</p><p><code>${escapeHtml(finding.masked_file_path)}</code></p><p><strong>Impact:</strong> ${escapeHtml(finding.impact)}</p><p><strong>Recommendation:</strong> ${escapeHtml(finding.recommendation)}</p></article>`).join('\n')
    const htmlReport = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.name)} — Apex Lens Report</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{font:15px/1.65 system-ui,-apple-system,sans-serif;max-width:1050px;margin:0 auto;padding:40px 24px;color:#172033;background:#f8fafc}header,.panel{background:white;border:1px solid #dbe3ee;border-radius:16px;padding:24px;margin-bottom:20px}h1{margin:0;font-size:30px}h2{margin:28px 0 12px}h3{margin:8px 0}.meta{color:#64748b}.grade{display:inline-block;margin-top:16px;padding:8px 14px;border-radius:999px;background:#d3f8ee;color:#0d6d60;font-weight:700}.scores{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.score{display:flex;justify-content:space-between;padding:12px;border-radius:10px;background:#f1f5f9}.inventory{display:flex;flex-wrap:wrap;gap:18px;margin-top:18px}.inventory span{color:#64748b}article{border-top:1px solid #e2e8f0;padding:20px 0}.finding-head{display:flex;gap:10px;color:#64748b;font-size:12px;font-weight:700}.severity{color:#be123c}code{word-break:break-all;color:#475569}li{margin:8px 0}@media(max-width:600px){body{padding:20px 12px}header,.panel{padding:18px}h1{font-size:24px}}</style></head><body><header><p class="meta">Salesforce Apex Lens · Generated ${escapeHtml(generatedAtIso)}</p><h1>${escapeHtml(project.name)}</h1><span class="grade">Grade ${escapeHtml(scores.grade)} · ${scores.overallScore}/100</span><div class="inventory"><span><strong>${job.total_files}</strong> files supplied</span><span><strong>${job.included_files}</strong> files reviewed</span><span><strong>${validatedFindings.length}</strong> validated findings</span></div></header><section class="panel"><h2>Architecture assessment</h2><p>${escapeHtml(safeSummary)}</p><h2>Category scores</h2><div class="scores">${categoryHtml}</div></section><section class="panel"><h2>Top remediation priorities</h2><ol>${safeRecommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>${observationHtml ? `<h2>Positive observations</h2><ul>${observationHtml}</ul>` : ''}</section><section class="panel"><h2>Validated findings</h2>${findingHtml || '<p>No validated findings.</p>'}</section><section class="panel"><h2>Scope and limitations</h2><ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section></body></html>`
    const safeHtml = maskConfidentialContent(htmlReport).masked
    const reportBlocks: PdfBlock[] = [
      { kind: 'title', text: `${project.name} - Final evaluation report` },
      { kind: 'subtitle', text: `Generated ${generatedAtIso} | Grade ${scores.grade} | ${scores.overallScore}/100 | ${job.included_files} of ${job.total_files} files reviewed | ${validatedFindings.length} validated findings` },
      { kind: 'heading', text: 'Architecture assessment' }, { kind: 'text', text: safeSummary },
      { kind: 'heading', text: 'Category scores' },
      ...Object.entries(scores.categoryScores).map(([category, score]): PdfBlock => ({ kind: 'bullet', text: `${category.replaceAll('_', ' ')}: ${score}/100` })),
      { kind: 'heading', text: 'Top remediation priorities' }, ...safeRecommendations.map((item): PdfBlock => ({ kind: 'bullet', text: item })),
      ...((observations ?? []).length ? [{ kind: 'heading', text: 'Positive observations' } as PdfBlock, ...(observations ?? []).map((item): PdfBlock => ({ kind: 'bullet', text: `${item.title}: ${item.description}` }))] : []),
      { kind: 'heading', text: 'Validated findings' },
      ...validatedFindings.flatMap((finding): PdfBlock[] => [
        { kind: 'heading', text: `${finding.severity}: ${finding.title}` },
        { kind: 'subtitle', text: `${finding.category.replaceAll('_', ' ')} | ${finding.masked_file_path ?? 'Location unavailable'}` },
        { kind: 'text', text: `Issue: ${finding.issue}` }, { kind: 'text', text: `Impact: ${finding.impact}` },
        { kind: 'text', text: `Recommendation: ${finding.recommendation}` },
      ]),
      { kind: 'heading', text: 'Scope and limitations' }, ...limitations.map((item): PdfBlock => ({ kind: 'bullet', text: item })),
    ]
    const remediationBlocks: PdfBlock[] = [
      { kind: 'title', text: `${project.name} - Remediation plan` },
      { kind: 'subtitle', text: `Generated ${generatedAtIso} | Grade ${scores.grade} | ${scores.overallScore}/100` },
      { kind: 'heading', text: 'Immediate and next-sprint priorities' }, ...safeRecommendations.map((item): PdfBlock => ({ kind: 'bullet', text: item })),
      { kind: 'heading', text: 'Finding-by-finding actions' },
      ...validatedFindings.flatMap((finding): PdfBlock[] => [
        { kind: 'heading', text: `${finding.severity}: ${finding.title}` },
        { kind: 'subtitle', text: finding.masked_file_path ?? 'Location unavailable' },
        { kind: 'text', text: finding.recommendation },
      ]),
      { kind: 'heading', text: 'Planning limitations' }, ...limitations.map((item): PdfBlock => ({ kind: 'bullet', text: item })),
    ]
    const finalPdf = await createTextPdf(`${project.name} - Final evaluation report`, reportBlocks)
    const remediationPdf = await createTextPdf(`${project.name} - Remediation plan`, remediationBlocks)
    const filenames = { pdf: `${reportStem}_final-report.pdf`, remediationPdf: `${reportStem}_remediation-plan.pdf`, zip: `${reportStem}_report-package.zip` }
    const packageZip = zipSync({ [filenames.pdf]: finalPdf, [filenames.remediationPdf]: remediationPdf }, { level: 6 })

    const base = `${claim.owner_id}/${claim.project_id}/${jobId}`
    const paths = { pdf: `${base}/${filenames.pdf}`, remediationPdf: `${base}/${filenames.remediationPdf}`, zip: `${base}/${filenames.zip}` }
    const uploads = [
      [paths.pdf, finalPdf, 'application/pdf'], [paths.remediationPdf, remediationPdf, 'application/pdf'],
      [paths.zip, packageZip, 'application/zip'],
    ] as const
    for (const [path, content, contentType] of uploads) {
      const { error } = await admin.storage.from('report-exports').upload(path, content, { contentType, upsert: true })
      if (error) throw error
    }
    const { error: reportError } = await admin.from('reports').upsert({
      analysis_job_id: jobId, version: 1, status: 'COMPLETED', overall_score: scores.overallScore, overall_grade: scores.grade,
      category_scores_json: scores.categoryScores, architecture_summary: safeSummary, top_recommendations_json: safeRecommendations,
      limitations_json: limitations, html_storage_path: null, json_storage_path: null, csv_storage_path: null,
      markdown_storage_path: null, pdf_storage_path: paths.pdf, zip_storage_path: paths.zip,
    }, { onConflict: 'analysis_job_id,version' })
    if (reportError) throw reportError

    const severityCounts = Object.fromEntries(['CRITICAL', 'MAJOR', 'MODERATE', 'MINOR', 'INFORMATIONAL'].map((severity) => [severity, validatedFindings.filter((finding) => finding.severity === severity).length]))
    const finalStatus = Number(job.failed_review_units) > 0 ? 'PARTIALLY_COMPLETED' : 'COMPLETED'
    const { error: completeError } = await admin.from('analysis_jobs').update({
      status: finalStatus, current_stage: finalStatus === 'COMPLETED' ? 'Analysis complete' : 'Analysis partially complete', progress_percentage: 100,
      critical_count: severityCounts.CRITICAL, major_count: severityCounts.MAJOR, moderate_count: severityCounts.MODERATE,
      minor_count: severityCounts.MINOR, informational_count: severityCounts.INFORMATIONAL, scoring_version: scores.version,
      model_version: Deno.env.get('CLAUDE_REVIEW_MODEL') ?? 'claude-sonnet-5', completed_at: new Date().toISOString(),
      lease_token: null, lease_expires_at: null, last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId).eq('lease_token', claim.lease_token)
    if (completeError) throw completeError
    await admin.from('projects').update({ last_analysis_at: new Date().toISOString() }).eq('id', claim.project_id)
    await admin.from('audit_events').insert({ owner_id: claim.owner_id, project_id: claim.project_id, analysis_job_id: jobId, event_type: 'ANALYSIS_COMPLETED', masked_metadata_json: { status: finalStatus, grade: scores.grade, score: scores.overallScore } })
    return json({ jobId, status: finalStatus, reportVersion: 1 })
  } catch (error) {
    console.error(JSON.stringify({
      event: 'edge_function_failure', function: 'finalize-report', jobId: jobId || null,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorCode: error instanceof Error ? error.message.slice(0, 160) : 'UNKNOWN',
    }))
    if (jobId) await recordProcessingError({ jobId, functionName: 'finalize-report', stage: 'REPORT_GENERATION', errorCode: 'FINALIZE_REPORT_FAILED', error })
    if (jobId) await failJob(jobId, 'FINALIZE_REPORT_FAILED', 'Final report generation failed.')
    return json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'FINALIZE_REPORT_FAILED' }, error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500)
  }
})
