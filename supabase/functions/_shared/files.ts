import { maskConfidentialContent } from './masking.ts'

const supportedExtensions = new Set([
  'cls', 'trigger', 'js', 'ts', 'html', 'css', 'cmp', 'app', 'evt', 'page', 'component',
  'xml', 'json', 'yaml', 'yml', 'md', 'object', 'field', 'flow', 'permissionset', 'profile',
])
const ignoredSegments = new Set(['.git', '.svn', 'node_modules', 'dist', 'build', 'coverage', '.sfdx', '.sf'])
const executableExtensions = new Set(['exe', 'dll', 'so', 'dylib', 'bat', 'cmd', 'com', 'msi', 'scr', 'ps1', 'sh'])

export function normalizeArchivePath(input: string): string {
  const normalized = input.replaceAll('\\', '/').replace(/^\.\//, '')
  const segments = normalized.split('/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || segments.some((segment) => segment === '..')) {
    throw new Error('ARCHIVE_PATH_TRAVERSAL')
  }
  return segments.filter((segment) => segment && segment !== '.').join('/')
}

export function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export function isIgnoredPath(path: string): boolean {
  return path.split('/').some((segment) => ignoredSegments.has(segment.toLowerCase()))
}

export function isExecutablePath(path: string): boolean {
  return executableExtensions.has(extensionOf(path))
}

export function isSupportedPath(path: string): boolean {
  const extension = extensionOf(path)
  return supportedExtensions.has(extension) || path.endsWith('sfdx-project.json')
}

export function metadataType(path: string): string | null {
  const extension = extensionOf(path)
  if (extension === 'cls') return 'ApexClass'
  if (extension === 'trigger') return 'ApexTrigger'
  if (path.includes('/lwc/')) return 'LightningWebComponent'
  if (path.includes('/aura/')) return 'AuraDefinitionBundle'
  if (extension === 'page' || extension === 'component') return 'Visualforce'
  if (extension === 'flow') return 'Flow'
  return extension === 'xml' ? 'MetadataXml' : null
}

export function maskPath(path: string): string {
  return maskConfidentialContent(path).masked.replaceAll('***EMAIL***', '***').replaceAll('***RECORD_ID***', '***')
}
