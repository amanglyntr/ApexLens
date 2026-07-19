import { describe, expect, it } from 'vitest'
import { projectSchema, signInSchema, signUpSchema } from './schemas'

describe('projectSchema', () => {
  it('accepts a valid project intake', () => {
    expect(projectSchema.parse({ name: 'Revenue Core', description: 'DX source', retentionHours: 24 }).name).toBe('Revenue Core')
  })

  it('rejects retention beyond the supported window', () => {
    expect(projectSchema.safeParse({ name: 'Revenue Core', description: '', retentionHours: 500 }).success).toBe(false)
  })
})

describe('signInSchema', () => {
  it('rejects invalid credentials before a network call', () => {
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'short' }).success).toBe(false)
  })
})

describe('signUpSchema', () => {
  it('accepts a normalized access request shape', () => {
    expect(signUpSchema.safeParse({ displayName: 'Security Architect', email: 'architect@example.com', password: 'strong-password' }).success).toBe(true)
  })

  it('rejects missing identity details', () => {
    expect(signUpSchema.safeParse({ displayName: ' ', email: 'invalid', password: 'short' }).success).toBe(false)
  })
})
