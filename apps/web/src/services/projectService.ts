import type { ProjectInput } from '@/utilities/schemas'
import type { JobStatus, Project } from '@/types/domain'
import { supabase } from './supabase'

export const projectService = {
  async list(): Promise<Project[]> {
    const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false })
    if (error) throw error
    const projectIds = data.map((project) => project.id)
    const jobs = projectIds.length ? await supabase.from('analysis_jobs').select('id,project_id,status,updated_at').in('project_id', projectIds).order('updated_at', { ascending: false }) : { data: [], error: null }
    if (jobs.error) throw jobs.error
    const latestByProject = new Map<string, { id: string; status: JobStatus; updatedAt: string }>()
    for (const job of jobs.data ?? []) if (!latestByProject.has(job.project_id)) latestByProject.set(job.project_id, { id: job.id, status: job.status as NonNullable<Project['latestAnalysis']>['status'], updatedAt: job.updated_at })
    return data.map((project) => ({ id: project.id, name: project.name, description: project.description ?? '', status: project.status as Project['status'], createdAt: project.created_at, lastAnalysisAt: project.last_analysis_at ?? undefined, latestAnalysis: latestByProject.get(project.id) }))
  },
  async create(input: ProjectInput): Promise<Project> {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) throw new Error('Authentication required')
    const { data, error } = await supabase.from('projects').insert({ owner_id: user.user.id, name: input.name, description: input.description }).select().single()
    if (error) throw error
    return { id: data.id, name: data.name, description: data.description ?? '', status: data.status as Project['status'], createdAt: data.created_at }
  },
}
