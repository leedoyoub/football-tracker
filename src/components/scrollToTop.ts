import type { ScreenState, ScreenStateByView, View } from '../types'
import { competitionMenu } from '../lib/competitionScreenState'

/** Existing ranking/race controls keep their original screen-owned behavior. */
export function hasPageScrollToTop(view: View, state: ScreenState): boolean {
  if (['player', 'records', 'records-leaderboard', 'results', 'players'].includes(view.name)) return true
  return view.name === 'competition' && state.name === 'competition' && competitionMenu(state) === 'matches'
}

export function pageScrollScopeKey(view: View, state: ScreenState): string {
  const competition = state.name === 'competition' ? `${state.competitionType}:${competitionMenu(state as ScreenStateByView['competition'])}` : ''
  return `${view.name}:${'id' in view ? view.id : ''}:${competition}`
}

type DistanceSurface = Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight' | 'addEventListener' | 'removeEventListener'>
/** One cheap comparison per native scroll; React updates only at visibility edges. */
export function observeScrollDistance(surface: DistanceSurface, threshold: number, onVisible: (visible: boolean) => void) {
  let previous: boolean | undefined
  const update = () => {
    const visible = surface.scrollHeight > surface.clientHeight && surface.scrollTop >= threshold
    if (visible !== previous) { previous = visible; onVisible(visible) }
  }
  update()
  surface.addEventListener('scroll', update, { passive: true })
  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
  resize?.observe(surface as HTMLElement)
  return () => { surface.removeEventListener('scroll', update); resize?.disconnect() }
}

type Observer = { observe: (target: Element) => void; disconnect: () => void }
type ObserverFactory = (callback: (entries: { isIntersecting: boolean }[]) => void) => Observer
type ScrollSurface = { scrollTo: (options: ScrollToOptions) => void }
type ScrollTarget = { scrollIntoView: (options: ScrollIntoViewOptions) => void }

/** Scroll the owning View All surface; window is only the browser fallback. */
export function scrollViewAllSurface(surface?: ScrollSurface) {
  const options: ScrollToOptions = { top: 0, behavior: 'smooth' }
  if (surface) return surface.scrollTo(options)
  window.scrollTo(options)
}

/** Return to the heading for the expanded list, without resetting unrelated page state. */
export function scrollViewAllSection(target: ScrollTarget) {
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Testable state core used by the observer hook. */
export function createScrollToTopController(factory: ObserverFactory, scroll: () => void) {
  let visible = false
  let observer: Observer | undefined
  return {
    get visible() { return visible },
    fixedClassName: 'fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-40',
    observe(target: Element) {
      observer?.disconnect()
      observer = factory(entries => { visible = !entries[0]?.isIntersecting })
      observer.observe(target)
    },
    disconnect() { observer?.disconnect() },
    scrollToTop() { scroll() },
  }
}
