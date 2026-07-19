export type ScoreCategory = 'SECURITY' | 'DESIGN' | 'DEVELOPER_QUALITY' | 'UI_UX' | 'UNIT_TESTING' | 'CONFIGURATION'
export type ScoreSeverity = 'CRITICAL' | 'MAJOR' | 'MODERATE' | 'MINOR' | 'INFORMATIONAL'
export const SCORING_VERSION = 'score-v2'
const weights: Record<ScoreCategory, number> = { SECURITY: 0.25, DESIGN: 0.2, DEVELOPER_QUALITY: 0.2, UI_UX: 0.1, UNIT_TESTING: 0.15, CONFIGURATION: 0.1 }
const penalties: Record<ScoreSeverity, number> = { CRITICAL: 20, MAJOR: 8, MODERATE: 3, MINOR: 1, INFORMATIONAL: 0 }

export function calculateScores(findings: Array<{ category: ScoreCategory; severity: ScoreSeverity; validationStatus: string; subcategory?: string; title?: string }>, applicableCategories: ScoreCategory[] = Object.keys(weights) as ScoreCategory[]) {
  const applicable = new Set(applicableCategories)
  const categoryScores = Object.fromEntries(applicableCategories.map((category) => [category, 100])) as Partial<Record<ScoreCategory, number>>
  for (const finding of findings) if (finding.validationStatus === 'VALIDATED' && applicable.has(finding.category)) categoryScores[finding.category] = Math.max(0, (categoryScores[finding.category] ?? 100) - penalties[finding.severity])
  const validated = findings.filter((finding) => finding.validationStatus === 'VALIDATED')
  const descriptor = (finding: typeof findings[number]) => `${finding.subcategory ?? ''} ${finding.title ?? ''}`.toLowerCase()
  const credentialExposure = validated.some((finding) => finding.category === 'SECURITY' && /credential|secret|api key|private key|token exposure/.test(descriptor(finding)))
  const injection = validated.some((finding) => finding.category === 'SECURITY' && /injection/.test(descriptor(finding)) && finding.severity === 'CRITICAL')
  const authorizationBypass = validated.some((finding) => finding.category === 'SECURITY' && /authorization bypass|privilege bypass/.test(descriptor(finding)))
  const loopLimitFindings = validated.filter((finding) => finding.category === 'DEVELOPER_QUALITY' && /soql.*loop|dml.*loop|bulkification/.test(descriptor(finding))).length
  const assertionFinding = validated.some((finding) => finding.category === 'UNIT_TESTING' && /no.*assert|coverage.only|meaningful assertion/.test(descriptor(finding)))
  if (injection || authorizationBypass) categoryScores.SECURITY = Math.min(categoryScores.SECURITY ?? 100, 49)
  if (loopLimitFindings >= 3) categoryScores.DEVELOPER_QUALITY = Math.min(categoryScores.DEVELOPER_QUALITY ?? 100, 59)
  if (assertionFinding) categoryScores.UNIT_TESTING = Math.min(categoryScores.UNIT_TESTING ?? 100, 59)
  const applicableWeight = Object.entries(weights).reduce((sum, [category, weight]) => sum + (applicable.has(category as ScoreCategory) ? weight : 0), 0)
  let overallScore = Math.round(Object.entries(weights).reduce((sum, [category, weight]) => applicable.has(category as ScoreCategory) ? sum + (categoryScores[category as ScoreCategory] ?? 100) * weight : sum, 0) / applicableWeight)
  if (credentialExposure) overallScore = Math.min(overallScore, 69)
  const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : overallScore >= 50 ? 'E' : 'F'
  return { version: SCORING_VERSION, categoryScores, overallScore, grade }
}
