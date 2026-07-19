import { z } from 'npm:zod@3.24.1'

export const createAnalysisRequestSchema = z.object({
  projectId: z.string().uuid(),
  storagePath: z.string().min(10).max(1024),
  retentionHours: z.number().int().min(1).max(168).default(24),
})

export const findingSchema = z.object({
  temporaryFindingId: z.string(), category: z.enum(['SECURITY', 'DESIGN', 'DEVELOPER_QUALITY', 'UI_UX', 'UNIT_TESTING', 'CONFIGURATION']),
  subcategory: z.string(), severity: z.enum(['CRITICAL', 'MAJOR', 'MODERATE', 'MINOR', 'INFORMATIONAL']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']), title: z.string(), issue: z.string(),
  location: z.object({ filePath: z.string(), classOrComponent: z.string().optional(), method: z.string().optional(), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() }),
  evidenceType: z.string(), evidence: z.string(), impact: z.string(), standardViolated: z.string(), recommendation: z.string(),
  maskedRefactoredCode: z.string().optional(), falsePositiveConsiderations: z.array(z.string()), status: z.literal('PRELIMINARY'),
})

export const reviewUnitResponseSchema = z.object({
  reviewUnitId: z.string().uuid(), filesReviewed: z.array(z.string()),
  positiveObservations: z.array(z.object({ title: z.string(), description: z.string() })),
  findings: z.array(findingSchema), limitations: z.array(z.string()),
})
