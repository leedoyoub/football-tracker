import type { View } from '../types'

const backViews = new Set<View['name']>(['player', 'match', 'team', 'global-ranking', 'award-race', 'records-leaderboard', 'results', 'latest-changes', 'season-recap', 'season-highlight', 'chemistry'])
/** Only routes whose rendered Back button uses App's Back callbacks. */
export const hasEdgeBack = (view: View) => backViews.has(view.name)

/** iOS browser owns its screen-edge gesture; standalone has no browser Back UI. */
export function usesNativeEdgeBack(userAgent: string, platform: string, maxTouchPoints: number, standalone: boolean) {
  return !standalone && (/iPhone|iPad|iPod/.test(userAgent) || platform === 'MacIntel' && maxTouchPoints > 1)
}

type Point = Pick<Touch, 'identifier' | 'clientX' | 'clientY'>
type Points = ArrayLike<Point>
export function createEdgeBackGesture(onBack: () => void) {
  let start: Point | null = null
  let furthestX = 0
  const cancel = () => { start = null }
  const move = (points: Points, blocked = false) => {
    if (!start) return false
    const point = points[0]
    if (blocked || points.length !== 1 || point.identifier !== start.identifier) { cancel(); return false }
    const dx = point.clientX - start.clientX, dy = Math.abs(point.clientY - start.clientY)
    if (dx < -8 || furthestX - point.clientX > 20 || dy >= 12 && dy * 1.4 > dx) { cancel(); return false }
    furthestX = Math.max(furthestX, point.clientX)
    return dx >= 12 && dx > dy * 1.6
  }
  return {
    cancel,
    start(points: Points, blocked = false) {
      cancel()
      const point = points[0]
      if (blocked || points.length !== 1 || point.clientX < 0 || point.clientX > 24) return
      start = { identifier: point.identifier, clientX: point.clientX, clientY: point.clientY }
      furthestX = point.clientX
    },
    move,
    end(changed: Points, remaining: Points, blocked = false) {
      const origin = start
      if (!origin || remaining.length || !move(changed, blocked)) { cancel(); return false }
      const point = changed[0]
      const complete = point.clientX - origin.clientX >= 72 && point.clientX - origin.clientX > Math.abs(point.clientY - origin.clientY) * 1.6
      cancel() // Consume before invoking navigation, even if it synchronously changes the route.
      if (complete) onBack()
      return complete
    },
  }
}

const overlaySelector = '[role="dialog"], [aria-modal="true"], dialog[open], [aria-haspopup]:not([aria-haspopup="false"])[aria-expanded="true"], [data-swipe-back-block]'
const inputSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-edge-swipe="ignore"], svg, canvas'
function overlayOpen(document: Document) {
  return [...document.querySelectorAll(overlaySelector)].some(element => element.getClientRects().length > 0)
}
function targetBlocked(target: EventTarget | null, container: HTMLElement) {
  if (!(target instanceof Element) || target.closest(inputSelector)) return true
  for (let element: Element | null = target; element && element !== container; element = element.parentElement) {
    const style = getComputedStyle(element)
    if (style.touchAction === 'none' || style.touchAction === 'pan-x' || ['auto', 'scroll'].includes(style.overflowX)) return true
  }
  return false
}

/** One listener group per active route; no React state changes while fingers move. */
export function attachEdgeSwipeBack(container: HTMLElement, onBack: () => void) {
  const document = container.ownerDocument
  const gesture = createEdgeBackGesture(onBack)
  let target: Element | null = null
  let popupAtPointerDown = false
  const observer = new MutationObserver(() => { if (overlayOpen(document)) cancel() })
  const cancel = () => { gesture.cancel(); target = null; observer.disconnect() }
  const blocked = () => !target?.isConnected || overlayOpen(document)
  const start = (event: TouchEvent) => {
    cancel()
    const wasBlocked = popupAtPointerDown
    popupAtPointerDown = false
    const point = event.touches[0]
    if (wasBlocked || event.touches.length !== 1 || point.clientX < 0 || point.clientX > 24 || targetBlocked(event.target, container) || overlayOpen(document)) return
    target = event.target as Element
    gesture.start(event.touches)
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-modal', 'open', 'data-swipe-back-block'] })
  }
  const move = (event: TouchEvent) => { if (target && gesture.move(event.touches, blocked()) && event.cancelable) event.preventDefault() }
  const end = (event: TouchEvent) => {
    if (target && gesture.end(event.changedTouches, event.touches, blocked()) && event.cancelable) event.preventDefault()
    cancel()
  }
  const visibility = () => { if (document.hidden) cancel() }
  const multiTouch = (event: TouchEvent) => { if (target && event.touches.length !== 1) cancel() }
  // Outside-pointer handlers may close a popup before touchstart reaches us.
  const pointerDown = (event: PointerEvent) => { popupAtPointerDown = event.pointerType === 'touch' && overlayOpen(document) }
  // A popup that opens then closes during a touch still invalidates that touch.
  container.addEventListener('touchstart', start, { passive: true })
  container.addEventListener('touchmove', move, { passive: false })
  container.addEventListener('touchend', end, { passive: false })
  container.addEventListener('touchcancel', cancel, { passive: true })
  document.addEventListener('visibilitychange', visibility)
  document.addEventListener('touchstart', multiTouch, { passive: true, capture: true })
  document.addEventListener('pointerdown', pointerDown, { passive: true, capture: true })
  window.addEventListener('pagehide', cancel)
  window.addEventListener('blur', cancel)
  return () => {
    cancel(); observer.disconnect()
    container.removeEventListener('touchstart', start)
    container.removeEventListener('touchmove', move)
    container.removeEventListener('touchend', end)
    container.removeEventListener('touchcancel', cancel)
    document.removeEventListener('visibilitychange', visibility)
    document.removeEventListener('touchstart', multiTouch, true)
    document.removeEventListener('pointerdown', pointerDown, true)
    window.removeEventListener('pagehide', cancel)
    window.removeEventListener('blur', cancel)
  }
}
