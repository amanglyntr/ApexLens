import { z } from 'npm:zod@3.24.1'
import { requireAdmin } from '../_shared/access.ts'
import { serviceClient } from '../_shared/client.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('LIST') }),
  z.object({ action: z.enum(['APPROVE', 'REJECT']), userId: z.string().uuid() }),
])

function clientError(error: unknown): { code: string; status: number } {
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') return { code: 'UNAUTHENTICATED', status: 401 }
  if (error instanceof Error && error.message === 'ACCESS_DENIED') return { code: 'ACCESS_DENIED', status: 403 }
  if (error instanceof z.ZodError) return { code: 'INVALID_REQUEST', status: 400 }
  return { code: 'ADMIN_USERS_FAILED', status: 500 }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const access = await requireAdmin(request)
    const input = requestSchema.parse(await request.json())
    const admin = serviceClient()
    if (input.action === 'LIST') {
      const { data: profiles, error: profileError } = await admin.from('profiles').select('id,display_name,role,approval_status,created_at,approved_at').order('created_at', { ascending: false }).limit(200)
      if (profileError) throw profileError
      const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
      if (authError) throw authError
      const emails = new Map(authData.users.map((user) => [user.id, user.email ?? '']))
      return json({ users: (profiles ?? []).map((profile) => ({
        id: profile.id, email: emails.get(profile.id) ?? '', displayName: profile.display_name ?? 'User',
        role: profile.role, approvalStatus: profile.approval_status, createdAt: profile.created_at, approvedAt: profile.approved_at,
      })) })
    }
    if (input.userId === access.user.id) return json({ error: 'SELF_APPROVAL_CHANGE_FORBIDDEN' }, 400)
    const approvalStatus = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    if (input.action === 'APPROVE') {
      const { error: confirmationError } = await admin.auth.admin.updateUserById(input.userId, { email_confirm: true })
      if (confirmationError) throw confirmationError
    }
    const { data: target, error: targetError } = await admin.from('profiles').update({
      approval_status: approvalStatus, approved_by: access.user.id,
      approved_at: input.action === 'APPROVE' ? new Date().toISOString() : null,
    }).eq('id', input.userId).select('id').maybeSingle()
    if (targetError) throw targetError
    if (!target) return json({ error: 'USER_NOT_FOUND' }, 404)
    const { error: auditError } = await admin.from('audit_events').insert({
      owner_id: access.user.id, event_type: `USER_${approvalStatus}`,
      masked_metadata_json: { targetUserId: input.userId },
    })
    if (auditError) console.error('admin-users audit write failed', auditError.code ?? 'UNKNOWN_AUDIT_ERROR')
    return json({ userId: input.userId, approvalStatus })
  } catch (error) {
    console.error('admin-users failed', error instanceof Error ? error.name : 'UnknownError')
    const response = clientError(error)
    return json({ error: response.code }, response.status)
  }
})
