import { ScanSearch } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className="flex items-center gap-3">
    <span className="grid size-10 place-items-center rounded-xl bg-accent-600 text-white shadow-lg shadow-accent-600/20"><ScanSearch size={21} /></span>
    {!compact && <span><span className="block text-sm font-bold tracking-tight">Apex Lens</span><span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">Salesforce intelligence</span></span>}
  </Link>
}
