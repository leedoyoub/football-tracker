declare const __FOOTBALL_TRACKER_DEV__: boolean | undefined

/** DEV-only timing hook. The callback is run exactly once, including async work. */
export function measureInDevelopment<T>(label: string, callback: () => T): T {
  if (typeof __FOOTBALL_TRACKER_DEV__ === 'undefined' || !__FOOTBALL_TRACKER_DEV__ || typeof performance === 'undefined') return callback()
  const started = performance.now()
  const report = () => console.debug(`[Football Tracker performance] ${label}: ${(performance.now() - started).toFixed(2)}ms`)
  try {
    const result = callback()
    if (result && typeof (result as T & { finally?: unknown }).finally === 'function') return (result as T & Promise<unknown>).finally(report) as T
    report()
    return result
  } catch (error) { report(); throw error }
}
