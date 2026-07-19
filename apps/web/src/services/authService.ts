import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface AppUser { id: string; email: string; displayName: string; role: 'USER' | 'ADMIN' }

async function approvedUser(user: User): Promise<AppUser> {
  const { data: profile, error } = await supabase.from('profiles').select('display_name,role,approval_status').eq('id', user.id).maybeSingle()
  if (error || !profile || profile.approval_status !== 'APPROVED') {
    await supabase.auth.signOut()
    throw new Error('Account approval is required.')
  }
  return { id: user.id, email: user.email ?? '', displayName: profile.display_name ?? user.email?.split('@')[0] ?? 'User', role: profile.role === 'ADMIN' ? 'ADMIN' : 'USER' }
}

export const authService = {
  async session(): Promise<AppUser | null> {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    try { return await approvedUser(data.user) } catch { return null }
  },
  async signIn(email: string, password: string): Promise<AppUser> {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error || !data.user) throw new Error('Unable to sign in. Verify your credentials and approval status.')
    return approvedUser(data.user)
  },
  async signUp(email: string, password: string, displayName: string): Promise<void> {
    const { error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { display_name: displayName.trim() } } })
    if (error) throw new Error('Unable to create the account.')
    await supabase.auth.signOut()
  },
  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error('Unable to sign out.')
  },
  async resetPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase())
    if (error) throw new Error('Unable to send the password reset request.')
  },
}
