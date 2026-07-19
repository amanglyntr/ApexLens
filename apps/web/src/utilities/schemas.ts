import { z } from 'zod'

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
})

export const signUpSchema = signInSchema.extend({
  displayName: z.string().trim().min(2, 'Enter your name').max(80),
})

export const projectSchema = z.object({
  name: z.string().trim().min(2, 'Project name is required').max(80),
  description: z.string().trim().max(500),
  retentionHours: z.coerce.number().int().min(1).max(168),
})

export const uploadSchema = z.custom<FileList>().refine((files) => files?.length > 0, 'Choose at least one file').refine(
  (files) => Array.from(files ?? []).every((file) => file.size <= 50 * 1024 * 1024),
  'Each upload must be 50 MB or less',
)

export type ProjectInput = z.infer<typeof projectSchema>
