import { supabase } from './supabase'

const MAX_BYTES = 50 * 1024 * 1024

export const uploadService = {
  validate(files: File[]): void {
    if (files.length !== 1) throw new Error('Choose one Salesforce DX ZIP file')
    for (const file of files) {
      if (file.size > MAX_BYTES) throw new Error(`${file.name} exceeds the 50 MB upload limit`)
      if (!file.name.toLowerCase().endsWith('.zip')) throw new Error(`${file.name} must be a Salesforce DX ZIP file`)
    }
  },
  async upload(userId: string, projectId: string, files: File[]): Promise<{ path: string; size: number }> {
    this.validate(files)
    const path = `${userId}/${projectId}/${crypto.randomUUID()}/${files[0].name}`
    const { error } = await supabase.storage.from('project-uploads').upload(path, files[0], { upsert: false })
    if (error) throw error
    return { path, size: files.reduce((sum, file) => sum + file.size, 0) }
  },
}
