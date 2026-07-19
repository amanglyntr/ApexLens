import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { serviceClient, userClient } from './client.ts'

export interface AccessProfile { id: string; role: 'USER' | 'ADMIN'; approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' }

export async function authenticatedUser(request: Request): Promise<User> {
  const client = userClient(request.headers.get('Authorization') ?? '')
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error('UNAUTHENTICATED')
  return data.user
}

export async function accessProfile(userId: string, admin: SupabaseClient = serviceClient()): Promise<AccessProfile> {
  const { data, error } = await admin.from('profiles').select('id,role,approval_status').eq('id', userId).maybeSingle()
  if (error || !data) throw new Error('ACCESS_DENIED')
  return data as AccessProfile
}

export async function requireApprovedUser(request: Request): Promise<{ user: User; profile: AccessProfile }> {
  const user = await authenticatedUser(request)
  const profile = await accessProfile(user.id)
  if (profile.approval_status !== 'APPROVED') throw new Error('ACCESS_DENIED')
  return { user, profile }
}

export async function requireAdmin(request: Request): Promise<{ user: User; profile: AccessProfile }> {
  const access = await requireApprovedUser(request)
  if (access.profile.role !== 'ADMIN') throw new Error('ACCESS_DENIED')
  return access
}
