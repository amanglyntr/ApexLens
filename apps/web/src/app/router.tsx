import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { useAuth } from './AuthProvider'

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Securing workspace…</div>
  return user ? <AppLayout /> : <Navigate to="/login" replace />
}

function AdminOnly() {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid min-h-48 place-items-center text-sm text-slate-500">Checking administrator access…</div>
  return user?.role === 'ADMIN' ? <Outlet /> : <Navigate to="/" replace />
}

export const router = createBrowserRouter([
  { path: '/auth', element: <Navigate to="/login" replace /> },
  { path: '/login', lazy: async () => ({ Component: (await import('@/features/auth/LoginPage')).LoginPage }) },
  { path: '/signup', lazy: async () => ({ Component: (await import('@/features/auth/SignUpPage')).SignUpPage }) },
  { path: '/pending', lazy: async () => ({ Component: (await import('@/features/auth/PendingApprovalPage')).PendingApprovalPage }) },
  { path: '/', element: <ProtectedLayout />, children: [
    { index: true, lazy: async () => ({ Component: (await import('@/features/dashboard/DashboardPage')).DashboardPage }) },
    { path: 'projects', lazy: async () => ({ Component: (await import('@/features/projects/ProjectsPage')).ProjectsPage }) },
    { path: 'projects/new', lazy: async () => ({ Component: (await import('@/features/projects/NewProjectPage')).NewProjectPage }) },
    { path: 'analysis/:jobId', lazy: async () => ({ Component: (await import('@/features/analysis/AnalysisPage')).AnalysisPage }) },
    { path: 'analysis/:jobId/report', lazy: async () => ({ Component: (await import('@/features/reports/ReportPage')).ReportPage }) },
    { path: 'findings', lazy: async () => ({ Component: (await import('@/features/findings/FindingsPage')).FindingsPage }) },
    { path: 'admin', element: <AdminOnly />, children: [
      { path: 'users', lazy: async () => ({ Component: (await import('@/features/admin/AdminUsersPage')).AdminUsersPage }) },
    ] },
  ] },
  { path: '*', element: <Navigate to="/" replace /> },
])
