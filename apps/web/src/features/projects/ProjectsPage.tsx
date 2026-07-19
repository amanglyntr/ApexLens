import { ArrowRight, Clock3, FileCheck2, FolderKanban, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { projectService } from '@/services/projectService'
import type { Project } from '@/types/domain'

const reportStatuses = new Set(['COMPLETED', 'PARTIALLY_COMPLETED'])

export function ProjectsPage() {
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: projectService.list })
  return <div className="mx-auto max-w-[1180px]"><header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[.2em] text-accent-600">Repository workspace</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Projects</h2><p className="mt-2 text-sm text-slate-500">Open completed reports, monitor active reviews, or start a fresh analysis.</p></div><Link className="btn-primary" to="/projects/new"><Plus size={17} />New project</Link></header>
    {isLoading ? <div className="surface mt-7 h-64 animate-pulse" /> : !projects.length ? <div className="mt-7"><EmptyState icon={FolderKanban} title="No projects yet" description="Create a project and upload your first Salesforce repository." /></div> : <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <ProjectCard project={project} key={project.id} />)}</div>}
  </div>
}

function ProjectCard({ project }: { project: Project }) {
  const latest = project.latestAnalysis
  const hasReport = Boolean(latest && reportStatuses.has(latest.status))
  const destination = latest ? hasReport ? `/analysis/${latest.id}/report` : `/analysis/${latest.id}` : `/projects/new?project=${project.id}`
  const action = !latest ? 'Start first analysis' : hasReport ? 'Open latest report' : latest.status === 'FAILED' ? 'Review failed analysis' : 'Continue analysis'
  const status = !latest ? 'NOT ANALYZED' : hasReport ? 'REPORT READY' : latest.status.replaceAll('_', ' ')
  return <article className="surface group relative min-w-0 overflow-hidden transition hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lg"><div className="h-1 bg-gradient-to-r from-accent-500 via-accent-300 to-transparent" /><div className="p-5"><div className="flex items-start justify-between gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-50 text-sm font-bold text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">{project.name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase()}</span><span className={`rounded-full px-2.5 py-1 text-right text-[9px] font-bold tracking-wide ${hasReport ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : latest ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{status}</span></div><h3 className="mt-6 break-words font-semibold">{project.name}</h3><p className="mt-1 line-clamp-2 min-h-10 break-words text-sm leading-5 text-slate-500">{project.description || 'No description provided.'}</p><div className="mt-5 flex items-center gap-2 text-[11px] text-slate-500">{hasReport ? <FileCheck2 size={14} className="shrink-0 text-accent-600" /> : <Clock3 className="shrink-0" size={14} />}{latest ? `Updated ${formatDate(latest.updatedAt)}` : 'Waiting for repository upload'}</div></div><Link className="flex items-center justify-between border-t bg-slate-50/70 px-5 py-4 text-sm font-semibold transition hover:bg-accent-50 hover:text-accent-700 dark:bg-slate-900/60 dark:hover:bg-accent-500/10 dark:hover:text-accent-300" to={destination} aria-label={`${action}: ${project.name}`}><span>{action}</span><ArrowRight className="shrink-0 transition-transform group-hover:translate-x-1" size={17} /></Link></article>
}

function formatDate(value: string): string { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
