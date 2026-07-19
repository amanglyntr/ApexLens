import type { Severity } from '@/types/domain'
import { clsx } from 'clsx'

const styles: Record<Severity, string> = {
  CRITICAL: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  MAJOR: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  MODERATE: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  MINOR: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  INFORMATIONAL: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide', styles[severity])}>
    <span className="size-1.5 rounded-full bg-current" />{severity}
  </span>
}
