import { useMutation, useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, ArrowRight, Blocks, CheckCircle2, Code2, Download, FileCheck2, LoaderCircle, MonitorSmartphone, Settings2, ShieldCheck, TestTube2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { SeverityBadge } from '@/components/SeverityBadge'
import { analysisService } from '@/services/analysisService'
import type { Finding, ReviewCategory, Severity } from '@/types/domain'

const assessmentAreas: Array<{ category: ReviewCategory; title: string; description: string; icon: LucideIcon }> = [
  { category: 'DESIGN', title: 'Architecture', description: 'Boundaries, coupling, scalability, and platform design.', icon: Blocks },
  { category: 'DEVELOPER_QUALITY', title: 'Developer quality', description: 'Maintainability, bulkification, and error handling.', icon: Code2 },
  { category: 'SECURITY', title: 'Security', description: 'Access enforcement, sharing, injection, and data exposure.', icon: ShieldCheck },
  { category: 'UI_UX', title: 'UI / UX', description: 'Accessibility, responsiveness, states, and user feedback.', icon: MonitorSmartphone },
  { category: 'UNIT_TESTING', title: 'Testing', description: 'Isolation, assertions, negative paths, and regression safety.', icon: TestTube2 },
  { category: 'CONFIGURATION', title: 'Configuration', description: 'Metadata, permissions, and deployment maintainability.', icon: Settings2 },
]

export function ReportPage() {
  const { jobId = '' } = useParams()
  const { data: job } = useQuery({ queryKey: ['analysis', jobId], queryFn: () => analysisService.get(jobId) })
  const { data: report } = useQuery({ queryKey: ['report', jobId], queryFn: () => analysisService.report(jobId) })
  const { data: findings = [] } = useQuery({ queryKey: ['findings', jobId], queryFn: () => analysisService.findings(jobId) })
  const exportPackage = useMutation({ mutationFn: () => analysisService.downloadReportPackage(report?.zipStoragePath ?? '', job?.projectName ?? 'Salesforce-project') })

  if (!report || !job) return <div className="surface p-8"><h2 className="font-semibold">Report is not ready</h2><p className="mt-1 text-sm text-slate-500">Return to analysis progress while findings are validated.</p><Link className="btn-secondary mt-5" to={`/analysis/${jobId}`}><ArrowLeft size={16} />Back to analysis</Link></div>

  const validatedFindings = findings.filter((finding) => finding.validationStatus === 'VALIDATED')
  const scores = new Map(report.categoryScores.map((item) => [item.category, item.score]))

  return <div className="mx-auto w-full min-w-0 max-w-[1120px] space-y-6 overflow-x-hidden pb-10">
    <header className="flex min-w-0 flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0"><Link className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-accent-600" to={`/analysis/${jobId}`}><ArrowLeft size={14} />Analysis workspace</Link><p className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-accent-600 sm:text-[11px] sm:tracking-[.22em]">Final evaluation report</p><h2 className="mt-2 break-words text-2xl font-bold tracking-tight sm:text-3xl">{job.projectName}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Evidence-based assessment from persisted and validated results.</p></div>
      <div className="shrink-0 text-right"><button className="btn-primary" onClick={() => exportPackage.mutate()} disabled={!report.zipStoragePath || exportPackage.isPending}>{exportPackage.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />}<span className="hidden sm:inline">{exportPackage.isPending ? 'Preparing…' : 'Export PDF package'}</span><span className="sm:hidden">Export</span></button><p className="mt-2 hidden text-[11px] text-slate-500 sm:block">Final report PDF · remediation plan PDF</p>{exportPackage.isError && <p className="mt-1 text-xs text-rose-600">Download failed.</p>}</div>
    </header>

    <section className="surface overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-[190px_minmax(0,1fr)]">
        <div className="flex items-center justify-between gap-3 border-b bg-accent-50 p-4 dark:bg-accent-500/[.06] sm:flex-col sm:justify-center sm:border-b-0 sm:border-r sm:p-6">
          <p className="max-w-20 text-[10px] font-bold uppercase tracking-[.16em] text-accent-700 dark:text-accent-300 sm:max-w-none sm:text-[11px] sm:tracking-[.18em]">Overall health</p>
          <ScoreRing score={report.overallScore} />
          <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700 sm:mt-1">Grade {report.overallGrade}</span>
        </div>
        <div className="min-w-0 p-5 sm:p-7"><div className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300"><Blocks size={17} /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Executive summary</p><h3 className="font-semibold">Architecture assessment</h3></div></div><div className="mt-4 max-w-4xl space-y-3 break-words text-[13px] leading-6 text-slate-600 dark:text-slate-300">{summaryParagraphs(report.architectureSummary).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-px border-t bg-slate-200 dark:bg-slate-800 sm:grid-cols-4"><ReportStat label="Files supplied" value={job.totalFiles} /><ReportStat label="Files reviewed" value={job.includedFiles} /><ReportStat label="Validated findings" value={validatedFindings.length} /><ReportStat label="Review areas" value={report.categoryScores.length} /></div>
    </section>

    <section>
      <SectionHeading eyebrow="Assessment matrix" title="Review-area breakdown" description="Each discipline is separated for clearer ownership and prioritization." />
      <div className="mt-4 grid gap-3 md:grid-cols-2">{assessmentAreas.map((area) => <AssessmentRow key={area.category} {...area} score={scores.get(area.category)} findings={validatedFindings.filter((finding) => finding.category === area.category)} applicable={area.category !== 'UI_UX' || report.uiUxApplicable} />)}</div>
    </section>

    <div className="grid gap-6 md:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] md:items-start">
      <section className="surface p-6"><SectionHeading eyebrow="Scorecard" title="Category health" description="Validated static findings in applicable areas." compact /><div className="mt-5 space-y-4">{report.categoryScores.filter((item) => item.category !== 'UI_UX' || report.uiUxApplicable).map((item) => <ScoreBar key={item.category} label={item.label} score={item.score} />)}</div></section>
      <section className="surface p-6"><SectionHeading eyebrow="Action plan" title="Top remediation priorities" description="Ordered by severity and likely risk reduction." compact /><div className="mt-5 divide-y">{report.topRecommendations.slice(0, 6).map((item, index) => <PriorityItem key={`${index}-${item}`} item={item} index={index} />)}</div>{report.topRecommendations.length > 6 && <p className="mt-4 text-xs text-slate-500">The export package contains all {report.topRecommendations.length} recommendations.</p>}</section>
    </div>

    {report.positiveObservations.length > 0 && <section className="surface p-6"><SectionHeading eyebrow="What is working" title="Positive observations" compact /><div className="mt-4 grid gap-3 md:grid-cols-2">{report.positiveObservations.map((item) => <div className="flex gap-3 rounded-xl bg-emerald-50/70 p-4 text-sm leading-6 text-slate-700 dark:bg-emerald-500/[.06] dark:text-slate-300" key={item}><CheckCircle2 className="mt-1 shrink-0 text-accent-600" size={17} /><span>{item}</span></div>)}</div></section>}

    <section className="surface overflow-hidden"><div className="flex flex-col gap-3 border-b p-6 sm:flex-row sm:items-end sm:justify-between"><SectionHeading eyebrow="Evidence register" title="Validated findings" description={`${validatedFindings.length} confirmed findings across applicable review areas.`} compact /><Link className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700 hover:text-accent-600 dark:text-accent-300" to="/findings">View all findings <ArrowRight size={14} /></Link></div><div className="divide-y">{validatedFindings.slice(0, 8).map((finding) => <FindingRow key={finding.id} finding={finding} />)}</div>{validatedFindings.length > 8 && <div className="border-t bg-slate-50 px-6 py-3 text-xs text-slate-500 dark:bg-slate-900">Showing 8 of {validatedFindings.length}. Open Findings or export the package for the complete register.</div>}</section>

    {report.limitations.length > 0 && <details className="surface group overflow-hidden"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-600">Review context</p><h3 className="mt-1 font-semibold">Scope and limitations <span className="font-normal text-slate-500">({report.limitations.length})</span></h3><p className="mt-1 text-xs text-slate-500">Expand to understand evidence gaps and static-analysis boundaries.</p></div><span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-lg transition group-open:rotate-45 dark:bg-slate-800">+</span></summary><div className="border-t bg-amber-50/40 px-6 py-5 dark:bg-amber-500/[.04]"><ul className="grid gap-x-8 gap-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300 md:grid-cols-2">{report.limitations.map((item) => <li className="flex gap-2" key={item}><span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />{item}</li>)}</ul></div></details>}
  </div>
}

function ScoreRing({ score }: { score: number }) {
  return <div className="grid shrink-0 place-items-center rounded-full p-[7px] sm:mt-4" style={{ width: 88, height: 88, background: `conic-gradient(#0d8875 ${Math.max(0, Math.min(score, 100)) * 3.6}deg, rgba(13,136,117,.14) 0deg)` }}><div className="grid h-full w-full place-items-center rounded-full bg-white dark:bg-slate-900"><div className="text-center"><span className="block text-2xl font-bold leading-none">{score}</span><span className="mt-1 block text-[9px] text-slate-500">out of 100</span></div></div></div>
}

function AssessmentRow({ title, description, icon: Icon, score, findings, applicable }: { category: ReviewCategory; title: string; description: string; icon: LucideIcon; score?: number; findings: Finding[]; applicable: boolean }) {
  return <article className="surface flex min-w-0 gap-3 p-4 sm:gap-4 sm:p-5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300 sm:size-10"><Icon size={19} /></span><div className="min-w-0 flex-1"><div className="flex min-w-0 items-start justify-between gap-2 sm:gap-3"><div className="min-w-0"><h4 className="break-words text-sm font-semibold">{title}</h4><p className="mt-1 break-words text-xs leading-5 text-slate-500">{description}</p></div><ScorePill score={score} applicable={applicable} /></div><div className="mt-3 flex items-center gap-2 border-t pt-3 text-xs"><FileCheck2 className="shrink-0 text-slate-400" size={14} /><span className="font-semibold">{applicable ? `${findings.length} validated finding${findings.length === 1 ? '' : 's'}` : 'No applicable artifacts'}</span></div>{applicable && findings[0] && <p className="mt-2 truncate text-xs text-slate-500" title={findings[0].title}>Highest priority: {findings[0].title}</p>}</div></article>
}

function ScorePill({ score, applicable }: { score?: number; applicable: boolean }) {
  if (!applicable) return <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800">N/A</span>
  if (score === undefined) return <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800">Next run</span>
  const color = score >= 80 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : score >= 60 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${color}`}>{score}/100</span>
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500'
  return <div><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium">{label}</span><span className="font-mono font-bold">{score}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(score, 100))}%` }} /></div></div>
}

function PriorityItem({ item, index }: { item: string; index: number }) {
  const severity = prioritySeverity(item)
  const text = severity ? item.replace(new RegExp(`^${severity}:?\\s*`, 'i'), '') : item
  return <div className="flex min-w-0 gap-3 py-4 first:pt-0 last:pb-0"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 font-mono text-[11px] font-bold dark:bg-slate-800">{index + 1}</span><div className="min-w-0">{severity && <span className="mb-1.5 inline-flex text-[10px] font-bold tracking-wide text-slate-500">{severity}</span>}<p className="break-words text-[13px] leading-6">{text}</p></div></div>
}

function FindingRow({ finding }: { finding: Finding }) {
  return <article className="grid min-w-0 gap-3 px-5 py-4 sm:grid-cols-[112px_minmax(0,1fr)_180px] sm:items-start sm:px-6"><div className="justify-self-start"><SeverityBadge severity={finding.severity} /></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{categoryLabel(finding.category)}</p><h4 className="mt-1 break-words text-sm font-semibold">{finding.title}</h4><p className="mt-1 break-words text-xs leading-5 text-slate-500">{finding.recommendation}</p></div><p className="min-w-0 truncate font-mono text-[10px] text-slate-400" title={finding.maskedFilePath}>{finding.maskedFilePath}</p></article>
}

function ReportStat({ label, value }: { label: string; value: number }) { return <div className="min-w-0 bg-white p-4 dark:bg-slate-900/90"><p className="text-xl font-bold">{value}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{label}</p></div> }

function SectionHeading({ eyebrow, title, description, compact = false }: { eyebrow: string; title: string; description?: string; compact?: boolean }) { return <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-accent-600">{eyebrow}</p><h3 className={`${compact ? 'mt-1 text-base' : 'mt-1 text-lg'} font-semibold`}>{title}</h3>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div> }

function summaryParagraphs(summary: string): string[] {
  const sentences = summary.trim().split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length < 3) return [summary]
  const paragraphs: string[] = []
  for (let index = 0; index < sentences.length; index += 2) paragraphs.push(sentences.slice(index, index + 2).join(' '))
  return paragraphs
}

function categoryLabel(category: ReviewCategory): string { return assessmentAreas.find((area) => area.category === category)?.title ?? category.replaceAll('_', ' ') }
function prioritySeverity(value: string): Severity | undefined { return (['CRITICAL', 'MAJOR', 'MODERATE', 'MINOR', 'INFORMATIONAL'] as Severity[]).find((severity) => value.toUpperCase().startsWith(severity)) }
