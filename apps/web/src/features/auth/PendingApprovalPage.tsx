import { Clock3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AuthShell } from './AuthShell'

export function PendingApprovalPage() {
  return <AuthShell><span className="grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"><Clock3 /></span><h2 className="mt-5 text-3xl font-bold tracking-tight">Approval pending</h2><p className="mt-3 text-sm leading-6 text-slate-500">Your access request was submitted. You can sign in after an administrator approves the account. Email confirmation may also be required.</p><Link className="btn-primary mt-8 w-full" to="/login">Return to sign in</Link></AuthShell>
}
