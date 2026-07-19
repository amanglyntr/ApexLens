import { supabase } from './supabase'

export interface AdminUserAnalytics {
  id: string
  displayName: string
  email: string
  role: 'USER' | 'ADMIN'
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  joinedAt: string
  projects: number
  analyses: number
  completedAnalyses: number
  failedAnalyses: number
  filesAnalyzed: number
  findings: number
  criticalFindings: number
  majorFindings: number
  apiCalls: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  totalTokens: number
  averageScore: number | null
  developerQualityScore: number | null
  lastActivityAt: string | null
}

export interface AdminAnalytics {
  generatedAt: string
  totals: {
    registeredUsers: number
    approvedUsers: number
    pendingUsers: number
    projects: number
    analyses: number
    completedAnalyses: number
    failedAnalyses: number
    filesAnalyzed: number
    findings: number
    averageScore: number | null
  }
  severity: Record<'CRITICAL' | 'MAJOR' | 'MODERATE' | 'MINOR' | 'INFORMATIONAL', number>
  tokens: {
    apiCalls: number
    successfulCalls: number
    rejectedCalls: number
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
  }
  trend: Array<{ date: string; analyses: number; findings: number; tokens: number }>
  users: AdminUserAnalytics[]
  projects: Array<{ id: string; name: string; ownerId: string; ownerName: string; analyses: number; findings: number; criticalFindings: number; latestScore: number | null; lastAnalysisAt: string | null }>
  recentAnalyses: Array<{ id: string; projectName: string; userName: string; status: string; findings: number; updatedAt: string }>
}

export const adminAnalyticsService = {
  async get(): Promise<AdminAnalytics> {
    const { data, error } = await supabase.functions.invoke<AdminAnalytics>('admin-analytics', { body: {} })
    if (error || !data) throw new Error('Unable to load administrator analytics.')
    return data
  },
}
