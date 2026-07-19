import { BarChart3, FileSearch, FolderKanban, Gauge, LogOut, Menu, Moon, Plus, Sun, UserCheck, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Brand } from './Brand'
import { useTheme } from '@/app/ThemeProvider'
import { useAuth } from '@/app/AuthProvider'
import { clsx } from 'clsx'
import { PwaStatus } from './PwaStatus'

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const { user, signOut } = useAuth()
  const location = useLocation()
  const nav = [{ to: '/', label: 'Overview', icon: BarChart3 }, { to: '/projects', label: 'Projects', icon: FolderKanban }, { to: '/findings', label: 'Findings', icon: FileSearch }, ...(user?.role === 'ADMIN' ? [{ to: '/admin/analytics', label: 'Admin analytics', icon: Gauge }, { to: '/admin/users', label: 'User approvals', icon: UserCheck }] : [])]
  const title = location.pathname === '/' ? 'Overview' : location.pathname === '/admin/analytics' ? 'Admin analytics' : location.pathname === '/admin/users' ? 'User approvals' : location.pathname.includes('new') ? 'New analysis' : location.pathname.includes('analysis') ? 'Analysis workspace' : location.pathname.slice(1).replace('-', ' ')
  return <div className="min-h-screen">
    {open && <button className="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[1px] lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />}
    <aside className={clsx('fixed inset-y-0 left-0 z-40 w-64 border-r bg-white p-4 transition-transform dark:bg-slate-950 lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
      <div className="flex items-center justify-between"><Brand /><button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button></div>
      <nav className="mt-10 space-y-1">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900')}><Icon size={18} />{label}</NavLink>)}</nav>
      <NavLink to="/projects/new" className="btn-primary mt-6 w-full"><Plus size={17} /> New analysis</NavLink>
      <div className="absolute inset-x-4 bottom-4 rounded-xl border bg-slate-50 p-3 dark:bg-slate-900">
        <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-slate-200 text-xs font-bold dark:bg-slate-800">{user?.displayName.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{user?.displayName}</p><p className="truncate text-[10px] text-slate-500">{user?.email}</p></div><button onClick={() => void signOut()} title="Sign out"><LogOut size={16} /></button></div>
      </div>
    </aside>
    <main className="lg:pl-64">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-slate-50/90 px-4 backdrop-blur dark:bg-ink-950/90 sm:px-8"><div className="flex min-w-0 items-center gap-3"><button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button><h1 className="truncate font-semibold capitalize">{title}</h1></div><div className="flex items-center gap-2"><PwaStatus /><button className="btn-secondary !p-2.5" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={`Theme: ${theme}`}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button></div></header>
      <div className="mx-auto max-w-[1440px] p-4 sm:p-8"><Outlet /></div>
    </main>
  </div>
}
