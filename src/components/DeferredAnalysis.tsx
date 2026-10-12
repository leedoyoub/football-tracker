import { useEffect, useState, type ReactNode } from 'react'

/** Keep essential content synchronous; prepare each independent analysis after
 * the first paint. Server rendering retains the complete settled content. */
export function DeferredAnalysis({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [ready, setReady] = useState(() => typeof window === 'undefined')
  useEffect(() => {
    if (ready) return
    let cancelled = false
    let frame: number | undefined
    const show = () => { if (!cancelled) setReady(true) }
    const idle = window.requestIdleCallback?.(show, { timeout: 400 })
    if (idle === undefined) frame = window.requestAnimationFrame(() => { if (!cancelled) frame = window.requestAnimationFrame(show) })
    return () => {
      cancelled = true
      if (idle !== undefined) window.cancelIdleCallback?.(idle)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [ready])
  return ready ? children : fallback
}
