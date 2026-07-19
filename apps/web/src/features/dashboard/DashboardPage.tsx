import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowUpRight, FileCheck2, FolderKanban, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { analysisService } from '@/services/analysisService'
import { projectService } from '@/services/projectService'
import { StatCard } from '@/components/StatCard'

const COLORS = ['#e11d48', '#f97316', '#f59e0b', '#0ea5e9']

export function DashboardPage() {
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectService.list })
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: analysisService.list, refetchInterval: 5000 })
  const latest = jobs[0]
  const severity = latest ? [
    { name: 'Critical', value: latest.findingCounts.CRITICAL }, { name: 'Major', value: latest.findingCounts.MAJOR },
    { name: 'Moderate', value: latest.findingCounts.MODERATE }, { name: 'Minor', value: latest.findingCounts.MINOR },
  ] : []
  return <div className="space-y-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono text-xs uppercase tracking-[.2em] text-accent-600">Workspace health</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Your codebase at a glance</h2><p className="mt-2 text-sm text-slate-500">Coverage, risk, and analysis activity across Salesforce projects.</p></div><Link to="/projects/new" className="btn-primary">Start new analysis <ArrowUpRight size={17} /></Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Active projects" value={projects.length} detail="Across this workspace" icon={FolderKanban} /><StatCard label="Files analyzed" value={latest?.includedFiles ?? 0} detail="Most recent analysis" icon={FileCheck2} /><StatCard label="Critical + major" value={(latest?.findingCounts.CRITICAL ?? 0) + (latest?.findingCounts.MAJOR ?? 0)} detail="Prioritized findings" icon={ShieldAlert} /><StatCard label="Reports generated" value={jobs.filter((j) => j.status === 'COMPLETED').length} detail="Ready for review" icon={Activity} /></div>
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <section className="surface p-6"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Recent projects</h3><p className="mt-1 text-xs text-slate-500">Last accessed Salesforce repositories</p></div><Link to="/projects" className="text-sm font-semibold text-accent-600">View all</Link></div><div className="mt-5 space-y-2">{projects.slice(0, 4).map((project, index) => <div key={project.id} className="flex items-center gap-4 rounded-xl border p-4 transition hover:border-accent-300"><span className="grid size-10 place-items-center rounded-xl bg-slate-100 font-mono text-xs font-bold dark:bg-slate-800">{project.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{project.name}</p><p className="truncate text-xs text-slate-500">{project.description}</p></div><span className="text-xs text-slate-500">{index === 0 ? 'Today' : 'Not analyzed'}</span></div>)}</div></section>
      <section className="surface p-6"><h3 className="font-semibold">Finding distribution</h3><p className="mt-1 text-xs text-slate-500">Latest completed report</p><div className="mt-3 h-48"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={severity} dataKey="value" nameKey="name" innerRadius={55} outerRadius={78} paddingAngle={4}>{severity.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="grid grid-cols-2 gap-2">{severity.map((item, index) => <div key={item.name} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-500"><span className="size-2 rounded-full" style={{ background: COLORS[index] }} />{item.name}</span><strong>{item.value}</strong></div>)}</div></section>
    </div>
  </div>
}
