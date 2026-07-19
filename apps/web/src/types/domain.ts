export const JOB_STATUSES = [
  'UPLOADED', 'PREPARING', 'VALIDATING_ARCHIVE', 'EXTRACTING', 'BUILDING_INVENTORY',
  'SCANNING_CONFIDENTIAL_DATA', 'MASKING_CONTENT', 'CREATING_REVIEW_UNITS',
  'AI_REVIEW_IN_PROGRESS', 'VALIDATING_FINDINGS', 'CALCULATING_SCORES',
  'GENERATING_REPORT', 'FINAL_CONFIDENTIALITY_CHECK', 'COMPLETED', 'PARTIALLY_COMPLETED',
  'RETRY_SCHEDULED', 'CANCEL_REQUESTED', 'CANCELLED', 'FAILED', 'EXPIRED',
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]
export type Severity = 'CRITICAL' | 'MAJOR' | 'MODERATE' | 'MINOR' | 'INFORMATIONAL'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type ReviewCategory = 'SECURITY' | 'DESIGN' | 'DEVELOPER_QUALITY' | 'UI_UX' | 'UNIT_TESTING' | 'CONFIGURATION'

export interface Project {
  id: string
  name: string
  description: string
  status: 'ACTIVE' | 'ARCHIVED'
  createdAt: string
  lastAnalysisAt?: string
  latestAnalysis?: { id: string; status: JobStatus; updatedAt: string }
}

export interface Finding {
  id: string
  analysisJobId: string
  category: ReviewCategory
  subcategory: string
  severity: Severity
  confidence: Confidence
  title: string
  issue: string
  maskedFilePath: string
  methodName?: string
  lineStart?: number
  lineEnd?: number
  evidence: string
  impact: string
  standardViolated: string
  recommendation: string
  validationStatus: 'PRELIMINARY' | 'VALIDATED' | 'REJECTED' | 'DUPLICATE'
}

export interface AnalysisJob {
  id: string
  projectId: string
  projectName: string
  status: JobStatus
  currentStage: string
  progressPercentage: number
  totalFiles: number
  includedFiles: number
  excludedFiles: number
  totalReviewUnits: number
  completedReviewUnits: number
  findingCounts: Record<Severity, number>
  errorCode?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface AnthropicUsageSummary {
  apiCalls: number
  successfulCalls: number
  rejectedCalls: number
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

export interface Report {
  analysisJobId: string
  overallScore: number
  overallGrade: string
  categoryScores: Array<{ category: ReviewCategory; label: string; score: number }>
  architectureSummary: string
  topRecommendations: string[]
  positiveObservations: string[]
  limitations: string[]
  zipStoragePath?: string
  uiUxApplicable: boolean
}
