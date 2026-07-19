import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import type { z } from 'zod'
import { useAuth } from '@/app/AuthProvider'
import { signInSchema } from '@/utilities/schemas'
import { AuthShell } from './AuthShell'

type FormData = z.infer<typeof signInSchema>

export function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } })
  if (user) return <Navigate to="/" replace />
  const submit = handleSubmit(async (values) => {
    try { setError(''); await signIn(values.email, values.password); navigate('/', { replace: true }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in.') }
  })
  return <AuthShell><p className="text-sm font-semibold text-accent-600">Welcome back</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Sign in to Apex Lens</h2><p className="mt-2 text-sm text-slate-500">Only administrator-approved accounts can sign in.</p>
    <form className="mt-8 space-y-5" onSubmit={submit}><div><label className="label" htmlFor="email">Email address</label><input id="email" className="field" type="email" autoComplete="email" {...register('email')} />{errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}</div><div><label className="label" htmlFor="password">Password</label><input id="password" className="field" type="password" autoComplete="current-password" {...register('password')} />{errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}</div>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}<button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button></form>
    <p className="mt-6 text-center text-sm text-slate-500">Need an account? <Link className="font-semibold text-accent-600" to="/signup">Request access</Link></p>
  </AuthShell>
}
