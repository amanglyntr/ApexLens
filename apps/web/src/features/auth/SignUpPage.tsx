import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import type { z } from 'zod'
import { useAuth } from '@/app/AuthProvider'
import { signUpSchema } from '@/utilities/schemas'
import { AuthShell } from './AuthShell'

type FormData = z.infer<typeof signUpSchema>

export function SignUpPage() {
  const { user, signUp } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(signUpSchema), defaultValues: { displayName: '', email: '', password: '' } })
  if (user) return <Navigate to="/" replace />
  const submit = handleSubmit(async (values) => {
    try { setError(''); await signUp(values.email, values.password, values.displayName); navigate('/pending', { replace: true }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to request access.') }
  })
  return <AuthShell><p className="text-sm font-semibold text-accent-600">Request access</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Create your account</h2><p className="mt-2 text-sm text-slate-500">An administrator must approve the account before sign-in.</p>
    <form className="mt-8 space-y-5" onSubmit={submit}><div><label className="label" htmlFor="displayName">Full name</label><input id="displayName" className="field" autoComplete="name" {...register('displayName')} />{errors.displayName && <p className="mt-1 text-xs text-rose-600">{errors.displayName.message}</p>}</div><div><label className="label" htmlFor="email">Email address</label><input id="email" className="field" type="email" autoComplete="email" {...register('email')} />{errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}</div><div><label className="label" htmlFor="password">Password</label><input id="password" className="field" type="password" autoComplete="new-password" {...register('password')} />{errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}</div>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}<button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Submitting…' : 'Submit access request'}<ArrowRight size={17} /></button></form>
    <p className="mt-6 text-center text-sm text-slate-500">Already approved? <Link className="font-semibold text-accent-600" to="/login">Sign in</Link></p>
  </AuthShell>
}
