import { reviewUnitResponseSchema } from './schemas.ts'

export const reviewOutputJsonSchema: Record<string, unknown> = {
  type: 'object', additionalProperties: false,
  properties: {
    reviewUnitId: { type: 'string' },
    filesReviewed: { type: 'array', items: { type: 'string' } },
    positiveObservations: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, description: { type: 'string' } }, required: ['title', 'description'] } },
    findings: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: {
          temporaryFindingId: { type: 'string' },
          category: { type: 'string', enum: ['SECURITY', 'DESIGN', 'DEVELOPER_QUALITY', 'UI_UX', 'UNIT_TESTING', 'CONFIGURATION'] },
          subcategory: { type: 'string' }, severity: { type: 'string', enum: ['CRITICAL', 'MAJOR', 'MODERATE', 'MINOR', 'INFORMATIONAL'] },
          confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] }, title: { type: 'string' }, issue: { type: 'string' },
          location: { type: 'object', additionalProperties: false, properties: { filePath: { type: 'string' }, classOrComponent: { type: 'string' }, method: { type: 'string' }, startLine: { type: 'integer' }, endLine: { type: 'integer' } }, required: ['filePath'] },
          evidenceType: { type: 'string' }, evidence: { type: 'string' }, impact: { type: 'string' }, standardViolated: { type: 'string' }, recommendation: { type: 'string' },
          maskedRefactoredCode: { type: 'string' }, falsePositiveConsiderations: { type: 'array', items: { type: 'string' } }, status: { type: 'string', enum: ['PRELIMINARY'] },
        },
        required: ['temporaryFindingId', 'category', 'subcategory', 'severity', 'confidence', 'title', 'issue', 'location', 'evidenceType', 'evidence', 'impact', 'standardViolated', 'recommendation', 'falsePositiveConsiderations', 'status'],
      },
    },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: ['reviewUnitId', 'filesReviewed', 'positiveObservations', 'findings', 'limitations'],
}

export const REVIEW_SYSTEM_PROMPT = `You are a senior Salesforce Technical Architect, developer-quality, security, and UI/UX reviewer. Review only the supplied masked source. Produce evidence-based findings; never invent files, runtime behavior, permissions, or coverage. Treat placeholders as masked confidential values, not literal defects. Evaluate six distinct areas: Architecture/Design, Developer Quality, Security, UI/UX, Unit Testing, and Configuration. For UI/UX, review only supplied Lightning Web Component, Aura, Visualforce, HTML, CSS, JavaScript, or TypeScript evidence and assess accessibility, semantic structure, keyboard behavior, responsive layout, loading/error/empty states, destructive-action clarity, and user feedback. Do not create a UI/UX finding when no relevant UI artifact is supplied. Detect CRUD/FLS and sharing issues contextually, injection, sensitive logging, bulkification, governor risks, exception handling, hardcoding, architecture, and meaningful test quality. Use CRITICAL only for confirmed credential exposure, privilege bypass, exploitable injection, severe exposure, or destructive loss. Use MAJOR for missing access enforcement, SOQL/DML in loops, broken bulk handling, or serious unreliability. Include exact masked paths and line ranges when directly supported. Return no finding when evidence is insufficient; record the uncertainty as a limitation.`

export { reviewUnitResponseSchema }
