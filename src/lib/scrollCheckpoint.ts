import type { FrameCancel, FrameRequest } from './scrollRestoration'

const checkpoints = new Set<() => void>()
export function registerScrollCheckpoint(flush: () => void) {
  checkpoints.add(flush)
  return () => { checkpoints.delete(flush) }
}
/** Navigation calls this before changing the stack, so pending offsets belong
 * to the outgoing entry even when the next animation frame has not run. */
export function flushScrollCheckpoints() { for (const flush of checkpoints) flush() }

export function createScrollCheckpoint(commit: (left: number) => void, initial: number | null | undefined, requestFrame: FrameRequest, cancelFrame: FrameCancel) {
  let saved = initial
  let pending: number | undefined
  let frame: number | undefined
  let disposed = false
  let revision = 0
  const flush = () => {
    if (frame !== undefined) { cancelFrame(frame); frame = undefined }
    const left = pending; pending = undefined
    if (left !== undefined && left !== saved) { saved = left; commit(left); return left }
    return undefined
  }
  // A quiet frame is a lightweight scroll-end checkpoint. Continuous native
  // movement changes the DOM immediately without repainting the whole App.
  const schedule = () => {
    const observed = revision
    frame = requestFrame(() => {
      frame = undefined
      if (disposed || pending === undefined) return
      if (observed === revision) flush()
      else schedule()
    })
  }
  return {
    record(left: number) {
      if (disposed || !Number.isFinite(left)) return
      if (left === pending) return
      pending = left
      revision++
      if (left === saved && frame === undefined) { pending = undefined; return }
      if (frame === undefined) schedule()
    },
    flush,
    dispose() { flush(); disposed = true },
  }
}
