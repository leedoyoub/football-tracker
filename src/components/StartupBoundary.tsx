import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'

export function BootstrapShell({ message = 'Loading your tracker…' }: { message?: string }) {
  const [showRecovery, setShowRecovery] = useState(false)
  useEffect(() => {
    // This changes no auth or storage behavior; it only ensures a stuck
    // browser operation still gives the person a visible way out.
    const timer = window.setTimeout(() => setShowRecovery(true), 15000)
    return () => window.clearTimeout(timer)
  }, [])
  if (showRecovery) return <StartupRecovery />
  return <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 px-6 text-center text-sm text-zinc-400">{message}</div>
}

export class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Keep diagnostics deliberately token-free: OAuth callback values can be
    // present in browser-generated error text.
    if (import.meta.env.DEV) console.error('[Football Tracker boot] Render failed.')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <StartupRecovery />
  }
}

export function StartupRecovery({ onRetry }: { onRetry?: () => void }) {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 px-6 text-white"><div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-6 text-center"><h1 className="text-lg font-bold">Something went wrong while starting Football Tracker.</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Your local data has not been changed.</p>{onRetry && <button type="button" onClick={onRetry} className="mt-6 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-black">Retry startup</button>}<button type="button" onClick={() => window.location.reload()} className="mt-3 w-full rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-200">Reload app</button></div></div>
}
