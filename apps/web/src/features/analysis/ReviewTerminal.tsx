import { Activity, Binary, ShieldCheck, Terminal } from 'lucide-react'
import type { AnalysisJob } from '@/types/domain'

function binaryStreams(seed: string): string[] {
  const bits = [...seed].map((character) => character.charCodeAt(0).toString(2).padStart(8, '0')).join('')
  return Array.from({ length: 5 }, (_, index) => {
    const offset = (index * 17) % bits.length
    return `${bits.slice(offset)}${bits.slice(0, offset)}`.match(/.{1,4}/g)?.join(' ') ?? bits
  })
}

export function ReviewTerminal({ job }: { job: AnalysisJob }) {
  const failed = job.status === 'FAILED'
  const complete = job.status === 'COMPLETED' || job.status === 'PARTIALLY_COMPLETED'
  const headline = failed ? 'PIPELINE HALTED' : complete ? 'REVIEW SEALED' : 'LIVE REVIEW STREAM'
  const streams = binaryStreams(`${job.id}${job.status}${job.progressPercentage}`)

  return <section className={`review-terminal ${failed ? 'review-terminal-failed' : ''}`} aria-live="polite">
    <div className="review-terminal-grid" aria-hidden="true">{streams.map((stream, index) => <span key={index} style={{ animationDelay: `${index * -1.1}s` }}>{stream}</span>)}</div>
    <div className="review-scan" aria-hidden="true" />
    <div className="relative z-10 grid gap-5 p-5 lg:grid-cols-[1.5fr_1fr] lg:p-6">
      <div>
        <div className={`flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.22em] ${failed ? 'text-rose-700 dark:text-rose-300' : 'text-accent-700 dark:text-emerald-300'}`}><Terminal size={14} /> APEX LENS / {headline}</div>
        <p className="mt-4 font-mono text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl"><span className={failed ? 'text-rose-600 dark:text-rose-400' : 'text-accent-600 dark:text-emerald-400'}>$</span> {job.currentStage}<span className={!failed && !complete ? 'terminal-cursor' : ''}>_</span></p>
        <p className={`mt-2 font-mono text-xs ${failed ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
          {failed ? `${job.errorCode ?? 'ANALYSIS_FAILED'} :: ${job.errorMessage ?? 'Processing stopped safely.'}` : complete ? 'Artifacts validated and report package committed.' : 'Masked source is moving through the secure review pipeline.'}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 self-end">
        <Telemetry icon={Binary} label="Progress" value={`${job.progressPercentage}%`} />
        <Telemetry icon={Activity} label="Review units" value={`${job.completedReviewUnits}/${job.totalReviewUnits}`} />
        <Telemetry icon={ShieldCheck} label="Files masked" value={String(job.includedFiles)} />
      </div>
    </div>
  </section>
}

function Telemetry({ icon: Icon, label, value }: { icon: typeof Binary; label: string; value: string }) {
  return <div className="rounded-lg border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-black/25 dark:shadow-none"><Icon className="text-accent-600 dark:text-emerald-400" size={14} /><p className="mt-2 font-mono text-base font-bold text-slate-900 dark:text-white">{value}</p><p className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500">{label}</p></div>
}
