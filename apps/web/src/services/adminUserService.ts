import { supabase } from './supabase'

export interface ManagedUser {
  id: string
  email: string
  displayName: string
  role: 'USER' | 'ADMIN'
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: string
  approvedAt: string | null
}

async function invoke<T>(body: Record<string, string>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-users', { body })
  if (error || !data) throw new Error('Unable to complete the administrator request.')
  return data
}

export const adminUserService = {
  async list(): Promise<ManagedUser[]> {
    const result = await invoke<{ users: ManagedUser[] }>({ action: 'LIST' })
    return result.users
  },
  async setApproval(userId: string, action: 'APPROVE' | 'REJECT'): Promise<void> {
    await invoke({ action, userId })
  },
}
