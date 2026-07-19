import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ShieldCheck, UserCheck, X } from 'lucide-react'
import { adminUserService, type ManagedUser } from '@/services/adminUserService'

export function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { data: users = [], isLoading, error } = useQuery({ queryKey: ['admin-users'], queryFn: adminUserService.list })
  const approval = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: 'APPROVE' | 'REJECT' }) => adminUserService.setApproval(userId, action),
    onSuccess: (_, { userId, action }) => {
      queryClient.setQueryData<ManagedUser[]>(['admin-users'], (current = []) => current.map((user) => user.id === userId ? {
        ...user,
        approvalStatus: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        approvedAt: action === 'APPROVE' ? new Date().toISOString() : null,
      } : user))
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
  if (isLoading) return <div className="surface h-72 animate-pulse" />
  if (error) return <div className="surface p-6 text-sm text-rose-600">Unable to load user access requests.</div>
  return <div><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300"><UserCheck /></span><div><h2 className="text-3xl font-bold tracking-tight">User approvals</h2><p className="mt-1 text-sm text-slate-500">Approve or reject account access requests.</p></div></div>
    <section className="surface mt-7 overflow-hidden"><div className="border-b px-5 py-4 text-xs text-slate-500">{users.length} registered users</div><div className="divide-y">{users.map((user) => <article className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center" key={user.id}><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-bold dark:bg-slate-800">{user.displayName.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{user.displayName}</p>{user.role === 'ADMIN' && <span className="inline-flex items-center gap-1 rounded-md bg-accent-50 px-2 py-0.5 text-[10px] font-bold text-accent-700"><ShieldCheck size={11} />ADMIN</span>}<span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold dark:bg-slate-800">{user.approvalStatus}</span></div><p className="mt-1 truncate text-xs text-slate-500">{user.email}</p><p className="mt-1 text-[10px] text-slate-400">Requested {new Date(user.createdAt).toLocaleDateString()}</p></div>{user.role !== 'ADMIN' && <div className="flex gap-2"><button className="btn-secondary text-accent-700" disabled={approval.isPending || user.approvalStatus === 'APPROVED'} onClick={() => approval.mutate({ userId: user.id, action: 'APPROVE' })}><Check size={15} />Approve</button><button className="btn-secondary text-rose-600" disabled={approval.isPending || user.approvalStatus === 'REJECTED'} onClick={() => approval.mutate({ userId: user.id, action: 'REJECT' })}><X size={15} />Reject</button></div>}</article>)}</div></section>
    {approval.error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Unable to update account approval.</p>}
  </div>
}
