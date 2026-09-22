export type ScrollContainer = { scrollTop: number; scrollHeight: number; clientHeight: number }
export type FrameRequest = (callback: FrameRequestCallback) => number
export type FrameCancel = (handle: number) => void

/** Restore after back-navigation and retry only while a settling layout clamps the target. */
export function restoreScrollWhenReachable(container: ScrollContainer, target: number, requestFrame: FrameRequest = requestAnimationFrame, cancelFrame: FrameCancel = cancelAnimationFrame, maxFrames = 240) {
  let frame: number | undefined
  let cancelled = false
  let attempts = 0
  const restore = () => {
    if (cancelled) return
    attempts++
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
    container.scrollTop = Math.min(target, maxScroll)
    if (target > maxScroll && attempts < maxFrames) frame = requestFrame(restore)
  }
  frame = requestFrame(restore)
  return () => { cancelled = true; if (frame !== undefined) cancelFrame(frame) }
}
