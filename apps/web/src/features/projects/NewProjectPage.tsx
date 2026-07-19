import { zodResolver } from '@hookform/resolvers/zod'
import { CloudUpload, FileArchive, Info, LockKeyhole, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/AuthProvider'
import { analysisService } from '@/services/analysisService'
import { projectService } from '@/services/projectService'
import { uploadService } from '@/services/uploadService'
import { projectSchema, type ProjectInput } from '@/utilities/schemas'

export function NewProjectPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<ProjectInput>({ resolver: zodResolver(projectSchema), defaultValues: { description: '', retentionHours: 24 } })
  const choose = (incoming: File[]) => { try { uploadService.validate(incoming); setFiles(incoming); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid upload') } }
  const submit = handleSubmit(async (values) => {
    if (!files.length) { setError('Choose a Salesforce DX ZIP file'); return }
    if (!user) return
    try { setUploading(true); setError(''); const project = await projectService.create(values); const upload = await uploadService.upload(user.id, project.id, files); const job = await analysisService.create(project.id, project.name, upload.path, values.retentionHours); await queryClient.invalidateQueries(); navigate(`/analysis/${job.id}`) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to start analysis') } finally { setUploading(false) }
  })
  return <div className="mx-auto max-w-5xl"><div className="mb-8"><p className="font-mono text-xs uppercase tracking-[.2em] text-accent-600">Secure intake</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Create a new evaluation</h2><p className="mt-2 text-sm text-slate-500">Upload a complete DX repository or a focused set of Salesforce source files.</p></div>
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <section className="surface space-y-5 p-6"><div><h3 className="font-semibold">Project details</h3><p className="mt-1 text-xs text-slate-500">Used to organize analyses and reports.</p></div><div><label className="label" htmlFor="name">Project name</label><input className="field" id="name" placeholder="e.g. Revenue Cloud Core" {...register('name')} />{errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}</div><div><label className="label" htmlFor="description">Description</label><textarea className="field min-h-28 resize-none" id="description" placeholder="Purpose, release, or review scope" {...register('description')} /></div><div><label className="label" htmlFor="retention">Upload retention</label><select className="field" id="retention" {...register('retentionHours')}><option value="24">Delete after 24 hours</option><option value="48">Delete after 48 hours</option><option value="168">Delete after 7 days</option></select></div><div className="flex gap-3 rounded-xl bg-accent-50 p-4 text-accent-800 dark:bg-accent-500/10 dark:text-accent-200"><LockKeyhole className="mt-0.5 shrink-0" size={18} /><p className="text-xs leading-relaxed"><strong>Private by default.</strong> Original source is uploaded directly to private Storage. Confidential content must be masked before any model processing.</p></div></section>
      <section className="surface p-6"><h3 className="font-semibold">Source upload</h3><p className="mt-1 text-xs text-slate-500">Maximum compressed ZIP size: 50 MB</p><label className={`mt-5 grid min-h-64 cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? 'border-accent-500 bg-accent-50 dark:bg-accent-500/10' : 'hover:border-accent-400'}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(Array.from(event.dataTransfer.files)) }}><input className="sr-only" type="file" accept=".zip" onChange={(event) => choose(Array.from(event.target.files ?? []))} /><span><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300"><CloudUpload /></span><strong className="mt-4 block text-sm">Drop your Salesforce DX ZIP here</strong><span className="mt-1 block text-xs text-slate-500">or browse for one ZIP file</span></span></label>
        {files.length > 0 && <div className="mt-4 space-y-2">{files.map((file) => <div key={`${file.name}-${file.size}`} className="flex items-center gap-3 rounded-xl border p-3"><FileArchive className="text-accent-600" size={18} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{file.name}</p><p className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div><button type="button" onClick={() => setFiles(files.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}><X size={16} /></button></div>)}</div>}
        <div className="mt-4 flex gap-2 text-xs text-slate-500"><Info size={15} className="shrink-0" /><p>Supported: Apex, LWC, Aura, Visualforce, Flow and common metadata formats. Binary and executable content is excluded.</p></div>{error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}<button className="btn-primary mt-6 w-full" disabled={uploading}>{uploading ? 'Uploading securely…' : 'Upload and start analysis'}</button>
      </section>
    </form>
  </div>
}
