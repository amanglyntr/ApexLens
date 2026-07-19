import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, FileSearch, Search, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SeverityBadge } from '@/components/SeverityBadge'
import { analysisService } from '@/services/analysisService'
import type { Finding, Severity } from '@/types/domain'

const severities: Array<Severity | 'ALL'> = ['ALL', 'CRITICAL', 'MAJOR', 'MODERATE', 'MINOR', 'INFORMATIONAL']

export function FindingsPage() {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState<Severity | 'ALL'>('ALL')
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: analysisService.list })
  const latest = jobs.find((job) => job.status === 'COMPLETED' || job.status === 'PARTIALLY_COMPLETED') ?? jobs[0]
  const { data: findings = [], isLoading } = useQuery({ queryKey: ['findings', latest?.id], queryFn: () => analysisService.findings(latest?.id ?? ''), enabled: Boolean(latest) })
  const validated = findings.filter((finding) => finding.validationStatus === 'VALIDATED')
  const filtered = useMemo(() => validated.filter((finding) => (severity === 'ALL' || finding.severity === severity) && `${finding.title} ${finding.issue} ${finding.maskedFilePath} ${finding.category}`.toLowerCase().includes(search.toLowerCase())), [validated, search, severity])
  const highRisk = validated.filter((finding) => finding.severity === 'CRITICAL' || finding.severity === 'MAJOR').length

  return <div className="mx-auto max-w-[1180px] space-y-6">
    <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[.2em] text-accent-600">Evidence register</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Findings explorer</h2><p className="mt-2 text-sm text-slate-500">Search confirmed observations from the latest completed analysis.</p></div>{latest && <Link className="btn-secondary" to={`/analysis/${latest.id}/report`}>Open report <ArrowUpRight size={16} /></Link>}</header>

    <div className="grid gap-3 sm:grid-cols-3"><FindingStat icon={FileSearch} label="Validated findings" value={validated.length} /><FindingStat icon={ShieldAlert} label="Critical and major" value={highRisk} tone="risk" /><FindingStat icon={AlertTriangle} label="Review categories" value={new Set(validated.map((finding) => finding.category)).size} /></div>

    <section className="surface p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><label className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-3 text-slate-400" size={17} /><input className="field pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search findings, evidence, category, or file path" /></label><div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">{severities.map((item) => <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-bold transition ${severity === item ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`} onClick={() => setSeverity(item)} key={item}>{item === 'ALL' ? 'ALL' : item}</button>)}</div></div></section>

    {isLoading ? <div className="grid gap-4 lg:grid-cols-2"><div className="surface h-56 animate-pulse" /><div className="surface h-56 animate-pulse" /></div> : !filtered.length ? <div className="surface grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800"><FileSearch /></span><h3 className="mt-4 font-semibold">No matching findings</h3><p className="mt-1 text-sm text-slate-500">Adjust the search or severity filter.</p></div></div> : <div className="grid items-start gap-4 lg:grid-cols-2">{filtered.map((finding) => <FindingCard finding={finding} key={finding.id} />)}</div>}
  </div>
}

function FindingCard({ finding }: { finding: Finding }) {
  return <article className="surface group min-w-0 overflow-hidden transition hover:border-accent-300 hover:shadow-lg"><div className="flex items-center justify-between gap-3 border-b bg-slate-50/70 px-4 py-3 dark:bg-slate-900/60 sm:px-5"><SeverityBadge severity={finding.severity} /><span className="text-right text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">{finding.category.replaceAll('_', ' ')}</span></div><div className="min-w-0 p-4 sm:p-5"><h3 className="break-words text-sm font-semibold leading-6">{finding.title}</h3><p className="mt-2 break-words text-xs leading-5 text-slate-500">{finding.issue}</p><div className="mt-4 rounded-xl border-l-4 border-accent-400 bg-accent-50/60 p-3 dark:bg-accent-500/[.06]"><p className="text-[9px] font-bold uppercase tracking-[.14em] text-accent-700 dark:text-accent-300">Recommended action</p><p className="mt-1 break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{finding.recommendation}</p></div></div><div className="flex min-w-0 items-center justify-between gap-3 border-t px-4 py-3 sm:px-5"><p className="min-w-0 truncate font-mono text-[10px] text-slate-400" title={finding.maskedFilePath}>{finding.maskedFilePath}{finding.lineStart ? `:${finding.lineStart}${finding.lineEnd ? `–${finding.lineEnd}` : ''}` : ''}</p><span className="shrink-0 text-[9px] font-bold text-slate-400">{finding.confidence} CONFIDENCE</span></div></article>
}

function FindingStat({ icon: Icon, label, value, tone = 'default' }: { icon: typeof FileSearch; label: string; value: number; tone?: 'default' | 'risk' }) { return <div className="surface flex items-center gap-4 p-4"><span className={`grid size-10 place-items-center rounded-xl ${tone === 'risk' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300' : 'bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300'}`}><Icon size={18} /></span><div><p className="text-xl font-bold">{value}</p><p className="text-[11px] text-slate-500">{label}</p></div></div> }
