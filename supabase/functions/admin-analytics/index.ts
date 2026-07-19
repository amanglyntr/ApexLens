import { requireAdmin } from '../_shared/access.ts'
import { serviceClient } from '../_shared/client.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

type NumericRecord = Record<string, number>

function sumFindings(job: Record<string, unknown>) {
  return ['critical_count', 'major_count', 'moderate_count', 'minor_count', 'informational_count']
    .reduce((total, key) => total + Number(job[key] ?? 0), 0)
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function dayKey(value: string) {
  return value.slice(0, 10)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    await requireAdmin(request)
    const admin = serviceClient()
    const [profilesResult, projectsResult, jobsResult, reportsResult, usageResult, authResult] = await Promise.all([
      admin.from('profiles').select('id,display_name,role,approval_status,created_at,approved_at').order('created_at', { ascending: false }).limit(1000),
      admin.from('projects').select('id,owner_id,name,status,created_at,last_analysis_at').order('created_at', { ascending: false }).limit(10000),
      admin.from('analysis_jobs').select('id,project_id,owner_id,status,total_files,included_files,critical_count,major_count,moderate_count,minor_count,informational_count,created_at,updated_at,completed_at').order('created_at', { ascending: false }).limit(10000),
      admin.from('reports').select('analysis_job_id,overall_score,overall_grade,category_scores_json,created_at').order('created_at', { ascending: false }).limit(10000),
      admin.from('anthropic_api_usage').select('analysis_job_id,response_status,input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens,created_at').order('created_at', { ascending: false }).limit(50000),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ])

    for (const result of [profilesResult, projectsResult, jobsResult, reportsResult, usageResult]) {
      if (result.error) throw result.error
    }
    if (authResult.error) throw authResult.error

    const profiles = profilesResult.data ?? []
    const projects = projectsResult.data ?? []
    const jobs = jobsResult.data ?? []
    const reports = reportsResult.data ?? []
    const usage = usageResult.data ?? []
    const emails = new Map(authResult.data.users.map((user) => [user.id, user.email ?? '']))
    const projectById = new Map(projects.map((project) => [project.id, project]))
    const jobById = new Map(jobs.map((job) => [job.id, job]))

    const users = new Map(profiles.map((profile) => [profile.id, {
      id: profile.id,
      displayName: profile.display_name ?? 'User',
      email: emails.get(profile.id) ?? '',
      role: profile.role,
      approvalStatus: profile.approval_status,
      joinedAt: profile.created_at,
      projects: 0,
      analyses: 0,
      completedAnalyses: 0,
      failedAnalyses: 0,
      filesAnalyzed: 0,
      findings: 0,
      criticalFindings: 0,
      majorFindings: 0,
      apiCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      scoreTotal: 0,
      scoreCount: 0,
      developerQualityTotal: 0,
      developerQualityCount: 0,
      lastActivityAt: null as string | null,
    }]))

    for (const project of projects) {
      const user = users.get(project.owner_id)
      if (user) user.projects += 1
    }

    const severity: NumericRecord = { CRITICAL: 0, MAJOR: 0, MODERATE: 0, MINOR: 0, INFORMATIONAL: 0 }
    const completedStatuses = new Set(['COMPLETED', 'PARTIALLY_COMPLETED'])
    const failedStatuses = new Set(['FAILED', 'CANCELLED', 'EXPIRED'])
    for (const job of jobs) {
      const user = users.get(job.owner_id)
      const findings = sumFindings(job)
      severity.CRITICAL += Number(job.critical_count ?? 0)
      severity.MAJOR += Number(job.major_count ?? 0)
      severity.MODERATE += Number(job.moderate_count ?? 0)
      severity.MINOR += Number(job.minor_count ?? 0)
      severity.INFORMATIONAL += Number(job.informational_count ?? 0)
      if (!user) continue
      user.analyses += 1
      user.completedAnalyses += completedStatuses.has(job.status) ? 1 : 0
      user.failedAnalyses += failedStatuses.has(job.status) ? 1 : 0
      user.filesAnalyzed += Number(job.included_files ?? 0)
      user.findings += findings
      user.criticalFindings += Number(job.critical_count ?? 0)
      user.majorFindings += Number(job.major_count ?? 0)
      if (!user.lastActivityAt || job.updated_at > user.lastActivityAt) user.lastActivityAt = job.updated_at
    }

    const latestReportByJob = new Map<string, typeof reports[number]>()
    for (const report of reports) if (!latestReportByJob.has(report.analysis_job_id)) latestReportByJob.set(report.analysis_job_id, report)
    for (const [jobId, report] of latestReportByJob) {
      const job = jobById.get(jobId)
      const user = job ? users.get(job.owner_id) : undefined
      if (!user || report.overall_score == null) continue
      user.scoreTotal += Number(report.overall_score)
      user.scoreCount += 1
      const categories = report.category_scores_json && typeof report.category_scores_json === 'object' && !Array.isArray(report.category_scores_json)
        ? report.category_scores_json as NumericRecord : {}
      if (categories.DEVELOPER_QUALITY != null) {
        user.developerQualityTotal += Number(categories.DEVELOPER_QUALITY)
        user.developerQualityCount += 1
      }
    }

    const tokenTotals = { apiCalls: usage.length, successfulCalls: 0, rejectedCalls: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }
    for (const call of usage) {
      tokenTotals.successfulCalls += call.response_status === 'API_SUCCEEDED' ? 1 : 0
      tokenTotals.rejectedCalls += call.response_status === 'API_REJECTED' ? 1 : 0
      tokenTotals.inputTokens += Number(call.input_tokens ?? 0)
      tokenTotals.outputTokens += Number(call.output_tokens ?? 0)
      tokenTotals.cacheCreationTokens += Number(call.cache_creation_input_tokens ?? 0)
      tokenTotals.cacheReadTokens += Number(call.cache_read_input_tokens ?? 0)
      const job = jobById.get(call.analysis_job_id)
      const user = job ? users.get(job.owner_id) : undefined
      if (!user) continue
      user.apiCalls += 1
      user.inputTokens += Number(call.input_tokens ?? 0)
      user.outputTokens += Number(call.output_tokens ?? 0)
      user.cacheTokens += Number(call.cache_creation_input_tokens ?? 0) + Number(call.cache_read_input_tokens ?? 0)
    }

    const userRows = [...users.values()].map(({ scoreTotal, scoreCount, developerQualityTotal, developerQualityCount, ...user }) => ({
      ...user,
      averageScore: scoreCount ? round(scoreTotal / scoreCount) : null,
      developerQualityScore: developerQualityCount ? round(developerQualityTotal / developerQualityCount) : null,
      totalTokens: user.inputTokens + user.outputTokens + user.cacheTokens,
    })).sort((a, b) => b.totalTokens - a.totalTokens || b.analyses - a.analyses)

    const reportScores = [...latestReportByJob.values()].filter((report) => report.overall_score != null).map((report) => Number(report.overall_score))
    const totalFindings = Object.values(severity).reduce((sum, count) => sum + count, 0)
    const thirtyDays: Array<{ date: string; analyses: number; findings: number; tokens: number }> = []
    const trendMap = new Map<string, { date: string; analyses: number; findings: number; tokens: number }>()
    for (let offset = 29; offset >= 0; offset -= 1) {
      const date = new Date()
      date.setUTCDate(date.getUTCDate() - offset)
      const row = { date: date.toISOString().slice(0, 10), analyses: 0, findings: 0, tokens: 0 }
      thirtyDays.push(row)
      trendMap.set(row.date, row)
    }
    for (const job of jobs) {
      const row = trendMap.get(dayKey(job.created_at))
      if (row) { row.analyses += 1; row.findings += sumFindings(job) }
    }
    for (const call of usage) {
      const row = trendMap.get(dayKey(call.created_at))
      if (row) row.tokens += Number(call.input_tokens ?? 0) + Number(call.output_tokens ?? 0) + Number(call.cache_creation_input_tokens ?? 0) + Number(call.cache_read_input_tokens ?? 0)
    }

    const projectStats = new Map(projects.map((project) => [project.id, {
      id: project.id, name: project.name, ownerId: project.owner_id,
      ownerName: users.get(project.owner_id)?.displayName ?? 'Unknown user', analyses: 0, findings: 0,
      criticalFindings: 0, latestScore: null as number | null, lastAnalysisAt: project.last_analysis_at,
    }]))
    for (const job of jobs) {
      const project = projectStats.get(job.project_id)
      if (!project) continue
      project.analyses += 1
      project.findings += sumFindings(job)
      project.criticalFindings += Number(job.critical_count ?? 0)
      if (project.latestScore == null) project.latestScore = Number(latestReportByJob.get(job.id)?.overall_score ?? 0) || null
    }

    return json({
      generatedAt: new Date().toISOString(),
      totals: {
        registeredUsers: profiles.length,
        approvedUsers: profiles.filter((profile) => profile.approval_status === 'APPROVED').length,
        pendingUsers: profiles.filter((profile) => profile.approval_status === 'PENDING').length,
        projects: projects.length,
        analyses: jobs.length,
        completedAnalyses: jobs.filter((job) => completedStatuses.has(job.status)).length,
        failedAnalyses: jobs.filter((job) => failedStatuses.has(job.status)).length,
        filesAnalyzed: jobs.reduce((sum, job) => sum + Number(job.included_files ?? 0), 0),
        findings: totalFindings,
        averageScore: reportScores.length ? round(reportScores.reduce((sum, score) => sum + score, 0) / reportScores.length) : null,
      },
      severity,
      tokens: tokenTotals,
      trend: thirtyDays,
      users: userRows,
      projects: [...projectStats.values()].sort((a, b) => b.criticalFindings - a.criticalFindings || b.findings - a.findings).slice(0, 10),
      recentAnalyses: jobs.slice(0, 10).map((job) => ({
        id: job.id, projectName: projectById.get(job.project_id)?.name ?? 'Deleted project',
        userName: users.get(job.owner_id)?.displayName ?? 'Unknown user', status: job.status,
        findings: sumFindings(job), updatedAt: job.updated_at,
      })),
    })
  } catch (error) {
    console.error('admin-analytics failed', error instanceof Error ? error.name : 'UnknownError')
    const status = error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : error instanceof Error && error.message === 'ACCESS_DENIED' ? 403 : 500
    return json({ error: status === 500 ? 'ADMIN_ANALYTICS_FAILED' : error instanceof Error ? error.message : 'ACCESS_DENIED' }, status)
  }
})
