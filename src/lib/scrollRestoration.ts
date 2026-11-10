import { APP_SCROLL_TO_TOP } from './scrollMotion'

export type ScrollContainer = { scrollTop: number; scrollHeight: number; clientHeight: number }
export type FrameRequest = (callback: FrameRequestCallback) => number
export type FrameCancel = (handle: number) => void
type RestorationOptions = {
  onSettled?: () => void
  cancelOnUserInput?: boolean
}
type InteractiveScrollContainer = ScrollContainer & Partial<Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>>

/** Restore after back-navigation and retry only while a settling layout clamps the target. */
export function restoreScrollWhenReachable(container: InteractiveScrollContainer, target: number, requestFrame: FrameRequest = requestAnimationFrame, cancelFrame: FrameCancel = cancelAnimationFrame, maxFrames = 240, options: RestorationOptions = {}) {
  let frame: number | undefined
  let cancelled = false
  let attempts = 0
  const inputEvents = ['wheel', 'touchmove', 'keydown', APP_SCROLL_TO_TOP]
  const dispose = () => {
    cancelled = true
    if (frame !== undefined) cancelFrame(frame)
    for (const type of inputEvents) container.removeEventListener?.(type, onInput)
  }
  const settle = () => { if (cancelled) return; dispose(); options.onSettled?.() }
  const onInput = (event: Event) => {
    if (event.defaultPrevented) return
    if (event.type === 'wheel' && !(event as WheelEvent).deltaY) return
    if (event.type === 'keydown') {
      const target = event.target as HTMLElement | null
      const key = (event as KeyboardEvent).key
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')) return
      if (key === ' ' && /^(BUTTON|SUMMARY)$/.test(target?.tagName ?? '')) return
      if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(key)) return
    }
    settle()
  }
  if (options.cancelOnUserInput) for (const type of inputEvents) container.addEventListener?.(type, onInput, { passive: true })
  const restore = () => {
    if (cancelled) return
    attempts++
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
    container.scrollTop = Math.min(target, maxScroll)
    if (target > maxScroll && attempts < maxFrames) frame = requestFrame(restore)
    else settle()
  }
  frame = requestFrame(restore)
  return dispose
}
