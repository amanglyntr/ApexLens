import { Download, RefreshCw, Share, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function standaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [installed, setInstalled] = useState(standaloneMode)
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => {
      if (registration) {
        void registration.update()
        window.setInterval(() => void registration.update(), 60 * 60 * 1000)
      }
    },
    onRegisterError: (error) => console.error('PWA registration failed', error.name),
  })

  useEffect(() => {
    const onlineHandler = () => setOnline(true)
    const offlineHandler = () => setOnline(false)
    const installHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    const installedHandler = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    window.addEventListener('beforeinstallprompt', installHandler)
    window.addEventListener('appinstalled', installedHandler)
    return () => {
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
      window.removeEventListener('beforeinstallprompt', installHandler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === 'accepted') setInstalled(true)
      setInstallPrompt(null)
    } else if (isIos) setShowIosHelp(true)
  }

  return <>
    <div className="flex items-center gap-2">
      {!online && <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"><WifiOff size={15} /><span className="hidden sm:inline">Offline</span></span>}
      {!installed && (installPrompt || isIos) && <button className="btn-secondary !p-2.5 sm:!px-3" onClick={() => void install()} title="Install Apex Lens"><Download size={17} /><span className="hidden sm:inline">Install app</span></button>}
    </div>

    {(needRefresh || offlineReady) && <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border bg-white p-4 shadow-2xl dark:bg-slate-900 sm:left-auto sm:mx-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">{needRefresh ? <RefreshCw size={17} /> : <Download size={17} />}</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{needRefresh ? 'Update available' : 'Ready for offline use'}</p><p className="text-xs text-slate-500">{needRefresh ? 'Reload to use the newest version.' : 'The application shell is stored on this device.'}</p></div>
      {needRefresh && <button className="btn-primary !p-2" onClick={() => void updateServiceWorker(true)} aria-label="Install update"><RefreshCw size={16} /></button>}
      <button onClick={() => { setNeedRefresh(false); setOfflineReady(false) }} aria-label="Dismiss"><X size={17} /></button>
    </div>}

    {showIosHelp && <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/55 p-4 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="ios-install-title" onClick={() => setShowIosHelp(false)}>
      <div className="surface w-full max-w-sm p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-500/10"><Share size={19} /></span><button onClick={() => setShowIosHelp(false)} aria-label="Close"><X size={19} /></button></div><h2 id="ios-install-title" className="mt-5 text-lg font-semibold">Install on iPhone or iPad</h2><p className="mt-2 text-sm leading-6 text-slate-500">Open this site in Safari, tap the Share button, then choose <strong className="text-slate-800 dark:text-slate-200">Add to Home Screen</strong>.</p></div>
    </div>}
  </>
}
