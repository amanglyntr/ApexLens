import type { LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed p-8 text-center"><div><Icon className="mx-auto mb-3 text-slate-400" /><h3 className="font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p></div></div>
}
