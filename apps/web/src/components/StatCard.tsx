import type { LucideIcon } from 'lucide-react'

export function StatCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: LucideIcon }) {
  return <div className="surface p-5">
    <div className="flex items-start justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><span className="rounded-lg bg-accent-50 p-2 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300"><Icon size={18} /></span></div>
    <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>
}
