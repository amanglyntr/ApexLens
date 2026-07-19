import { CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Brand } from '@/components/Brand'

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className="grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
    <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_30%,#16a98e_0,transparent_30%),radial-gradient(circle_at_90%_80%,#1e40af_0,transparent_28%)]" />
      <div className="relative"><Brand /><div className="mt-24 max-w-xl"><p className="mb-5 font-mono text-xs uppercase tracking-[.24em] text-accent-300">Secure static intelligence</p><h1 className="text-5xl font-semibold leading-tight tracking-tight">See the architecture.<br />Strengthen the code.</h1><p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">A security-first review workspace for complete Salesforce repositories.</p></div></div>
      <div className="relative grid max-w-2xl grid-cols-3 gap-4">{[['Private by design', LockKeyhole], ['Evidence based', ShieldCheck], ['Admin approved', CheckCircle2]].map(([label, Icon]) => { const C = Icon as typeof LockKeyhole; return <div key={label as string} className="rounded-xl border border-white/10 bg-white/5 p-4"><C className="mb-3 text-accent-300" size={20} /><span className="text-sm font-medium">{label as string}</span></div> })}</div>
    </section>
    <section className="flex items-center justify-center p-6"><div className="w-full max-w-md"><div className="mb-10 lg:hidden"><Brand /></div>{children}</div></section>
  </main>
}
