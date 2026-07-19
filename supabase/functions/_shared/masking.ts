export interface MaskingResult { masked: string; replacementCount: number; categories: Record<string, number> }

const rules: Array<{ category: string; pattern: RegExp; placeholder: string }> = [
  { category: 'PRIVATE_KEY', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g, placeholder: '***PRIVATE_KEY***' },
  { category: 'AUTHORIZATION', pattern: /Authorization\s*[:=]\s*["']?(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+["']?/gi, placeholder: 'Authorization: ***TOKEN***' },
  { category: 'SALESFORCE_URL', pattern: /https?:\/\/[a-z0-9.-]+\.(?:salesforce|force)\.com\b[^\s"']*/gi, placeholder: 'https://***.salesforce.com' },
  { category: 'EMAIL', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, placeholder: '***EMAIL***' },
  { category: 'IP_ADDRESS', pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, placeholder: '***IP_ADDRESS***' },
  { category: 'SALESFORCE_ID', pattern: /\b[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?\b/g, placeholder: '***RECORD_ID***' },
  { category: 'SECRET_ASSIGNMENT', pattern: /\b(password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*["'][^"'\r\n]+["']/gi, placeholder: '$1="***TOKEN***"' },
]

export function maskConfidentialContent(source: string): MaskingResult {
  let masked = source
  const categories: Record<string, number> = {}
  for (const rule of rules) {
    let matches = 0
    masked = masked.replace(rule.pattern, () => { matches += 1; return rule.placeholder })
    if (matches) categories[rule.category] = matches
  }
  return { masked, categories, replacementCount: Object.values(categories).reduce((sum, count) => sum + count, 0) }
}
