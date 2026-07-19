import { normalizeArchivePath, isExecutablePath, isIgnoredPath, isSupportedPath } from './files.ts'
import { maskConfidentialContent } from './masking.ts'
import { calculateScores } from './scoring.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('archive paths reject traversal and executable content', () => {
  assert(normalizeArchivePath('force-app/main/default/classes/Service.cls') === 'force-app/main/default/classes/Service.cls', 'valid path changed')
  for (const unsafe of ['../secret.txt', '/absolute.cls', 'C:/windows/file.cls', 'a/../../b.cls']) {
    let rejected = false
    try { normalizeArchivePath(unsafe) } catch { rejected = true }
    assert(rejected, `unsafe path accepted: ${unsafe}`)
  }
  assert(isExecutablePath('payload.exe'), 'executable extension missed')
  assert(isIgnoredPath('repo/node_modules/pkg/index.js'), 'ignored directory missed')
  assert(isSupportedPath('force-app/main/default/classes/Test.cls'), 'Apex class not supported')
})

Deno.test('confidential values are masked before review', () => {
  const result = maskConfidentialContent("apiKey='real-secret'\nString email='admin@example.com';\nString id='001000000000001AAA';")
  assert(!result.masked.includes('real-secret'), 'secret was not masked')
  assert(!result.masked.includes('admin@example.com'), 'email was not masked')
  assert(!result.masked.includes('001000000000001AAA'), 'Salesforce ID was not masked')
  assert(result.replacementCount === 3, 'unexpected masking count')
})

Deno.test('scoring applies injection and credential grade caps', () => {
  const injection = calculateScores([{ category: 'SECURITY', severity: 'CRITICAL', validationStatus: 'VALIDATED', subcategory: 'SOQL_INJECTION', title: 'Exploitable injection' }])
  assert(injection.categoryScores.SECURITY <= 49, 'security injection cap missing')
  const credential = calculateScores([{ category: 'SECURITY', severity: 'CRITICAL', validationStatus: 'VALIDATED', subcategory: 'CREDENTIAL_EXPOSURE', title: 'Credential exposure' }])
  assert(credential.overallScore <= 69, 'credential overall cap missing')
})
