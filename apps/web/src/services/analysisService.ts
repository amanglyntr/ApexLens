import type { AnalysisJob, AnthropicUsageSummary, Finding, JobStatus, Report, ReviewCategory, Severity } from '@/types/domain'
import { supabase } from './supabase'
const emptyCounts = (): Record<Severity, number> => ({ CRITICAL: 0, MAJOR: 0, MODERATE: 0, MINOR: 0, INFORMATIONAL: 0 })

function mapJob(row: {
  id: string; project_id: string; status: string; current_stage: string; progress_percentage: number; total_files: number; included_files: number;
  excluded_files: number; total_review_units: number; completed_review_units: number; critical_count: number; major_count: number; moderate_count: number;
  minor_count: number; informational_count: number; masked_error_code: string | null; masked_error_message: string | null; created_at: string; updated_at: string;
}, projectName = 'Salesforce project'): AnalysisJob {
  return {
    id: row.id, projectId: row.project_id, projectName, status: row.status as JobStatus, currentStage: row.current_stage,
    progressPercentage: row.progress_percentage, totalFiles: row.total_files, includedFiles: row.included_files, excludedFiles: row.excluded_files,
    totalReviewUnits: row.total_review_units, completedReviewUnits: row.completed_review_units,
    findingCounts: { CRITICAL: row.critical_count, MAJOR: row.major_count, MODERATE: row.moderate_count, MINOR: row.minor_count, INFORMATIONAL: row.informational_count },
    errorCode: row.masked_error_code ?? undefined, errorMessage: row.masked_error_message ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export const analysisService = {
  async list(): Promise<AnalysisJob[]> {
    const { data, error } = await supabase.from('analysis_jobs').select('*').order('updated_at', { ascending: false })
    if (error) throw error
    const projectIds = [...new Set(data.map((job) => job.project_id))]
    const projects = projectIds.length ? await supabase.from('projects').select('id,name').in('id', projectIds) : { data: [], error: null }
    if (projects.error) throw projects.error
    const names = new Map((projects.data ?? []).map((project) => [project.id, project.name]))
    return data.map((job) => mapJob(job, names.get(job.project_id)))
  },
  async create(projectId: string, projectName: string, uploadPath: string, retentionHours = 24): Promise<AnalysisJob> {
    const { data, error } = await supabase.functions.invoke<{ jobId: string; status: JobStatus }>('create-analysis', { body: { projectId, storagePath: uploadPath, retentionHours } })
    if (error || !data) throw error ?? new Error('Unable to create analysis')
    return { id: data.jobId, projectId, projectName, status: data.status, currentStage: 'Secure upload', progressPercentage: 0, totalFiles: 0, includedFiles: 0, excludedFiles: 0, totalReviewUnits: 0, completedReviewUnits: 0, findingCounts: emptyCounts(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  },
  async get(jobId: string): Promise<AnalysisJob> {
    const { data, error } = await supabase.from('analysis_jobs').select('*').eq('id', jobId).single()
    if (error) throw error
    const { data: project } = await supabase.from('projects').select('name').eq('id', data.project_id).maybeSingle()
    return mapJob(data, project?.name)
  },
  async findings(jobId: string): Promise<Finding[]> {
    const { data, error } = await supabase.from('findings').select('*').eq('analysis_job_id', jobId).neq('validation_status', 'REJECTED').order('created_at')
    if (error) throw error
    return data.map((finding) => ({ id: finding.id, analysisJobId: finding.analysis_job_id, category: finding.category as Finding['category'], subcategory: finding.subcategory, severity: finding.severity as Severity, confidence: finding.confidence as Finding['confidence'], title: finding.title, issue: finding.issue, maskedFilePath: finding.masked_file_path ?? '', methodName: finding.method_name ?? undefined, lineStart: finding.line_start ?? undefined, lineEnd: finding.line_end ?? undefined, evidence: finding.evidence, impact: finding.impact, standardViolated: finding.standard_violated ?? '', recommendation: finding.recommendation, validationStatus: finding.validation_status as Finding['validationStatus'] }))
  },
  async anthropicUsage(jobId: string): Promise<AnthropicUsageSummary> {
    const { data, error } = await supabase.from('anthropic_usage_by_job').select('*').eq('analysis_job_id', jobId).maybeSingle()
    if (error) throw error
    return {
      apiCalls: Number(data?.api_calls ?? 0), successfulCalls: Number(data?.successful_calls ?? 0), rejectedCalls: Number(data?.rejected_calls ?? 0),
      inputTokens: Number(data?.input_tokens ?? 0), outputTokens: Number(data?.output_tokens ?? 0),
      cacheCreationInputTokens: Number(data?.cache_creation_input_tokens ?? 0), cacheReadInputTokens: Number(data?.cache_read_input_tokens ?? 0),
    }
  },
  async report(jobId: string): Promise<Report | null> {
    const { data, error } = await supabase.from('reports').select('*').eq('analysis_job_id', jobId).eq('status', 'COMPLETED').order('version', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!data) return null
    const [{ data: observations, error: observationError }, { data: uiFile, error: uiFileError }] = await Promise.all([
      supabase.from('positive_observations').select('title,description').eq('analysis_job_id', jobId),
      supabase.from('repository_files').select('id').eq('analysis_job_id', jobId).eq('status', 'INCLUDED').in('file_type', ['js', 'ts', 'html', 'css', 'cmp', 'app', 'page', 'component']).limit(1).maybeSingle(),
    ])
    if (observationError) throw observationError
    if (uiFileError) throw uiFileError
    const categoryRecord = data.category_scores_json && typeof data.category_scores_json === 'object' && !Array.isArray(data.category_scores_json) ? data.category_scores_json as Record<string, unknown> : {}
    return {
      analysisJobId: jobId, overallScore: Number(data.overall_score ?? 0), overallGrade: data.overall_grade ?? 'N/A',
      categoryScores: Object.entries(categoryRecord).map(([category, score]) => ({ category: category as ReviewCategory, label: categoryLabel(category), score: Number(score) })),
      architectureSummary: data.architecture_summary ?? '',
      topRecommendations: Array.isArray(data.top_recommendations_json) ? data.top_recommendations_json.filter((item): item is string => typeof item === 'string') : [],
      positiveObservations: (observations ?? []).map((item) => `${item.title}: ${item.description}`),
      limitations: Array.isArray(data.limitations_json) ? data.limitations_json.filter((item): item is string => typeof item === 'string') : [],
      zipStoragePath: data.zip_storage_path ?? undefined, uiUxApplicable: Boolean(uiFile),
    }
  },
  async downloadReportPackage(storagePath: string, projectName: string): Promise<void> {
    const timestamp = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').replace('Z', '_UTC')
    const printableProjectName = [...projectName.trim()].filter((character) => character.charCodeAt(0) >= 32).join('')
    const safeProjectName = printableProjectName.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'Salesforce-project'
    const downloadName = `${safeProjectName}_${timestamp}_report-package.zip`
    const { data, error } = await supabase.storage.from('report-exports').createSignedUrl(storagePath, 60, { download: downloadName })
    if (error) throw error
    const anchor = document.createElement('a')
    anchor.href = data.signedUrl
    anchor.download = downloadName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  },
  async cancel(jobId: string): Promise<void> {
    const { error } = await supabase.functions.invoke('cancel-analysis', { body: { jobId } }); if (error) throw error
  },
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = { DESIGN: 'Architecture', DEVELOPER_QUALITY: 'Developer quality', SECURITY: 'Security', UI_UX: 'UI / UX', UNIT_TESTING: 'Testing', CONFIGURATION: 'Configuration' }
  return labels[category] ?? category.replaceAll('_', ' ')
}
