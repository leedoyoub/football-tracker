import type { ScreenState, View } from '../types'
import { competitionMenu } from '../lib/competitionScreenState'

/** Existing ranking/race controls keep their original screen-owned behavior. */
export function hasPageScrollToTop(view: View, state: ScreenState): boolean {
  if (['home', 'latest-changes', 'chemistry', 'player', 'records', 'records-leaderboard', 'results', 'players'].includes(view.name)) return true
  if (view.name === 'team' && state.name === 'team') return ['overview', 'matches', 'history'].includes(state.tab)
  if (view.name !== 'competition' || state.name !== 'competition') return false
  const menu = competitionMenu(state)
  return menu === 'matches' || menu === 'players' || state.competitionType === 'league' && menu === 'history'
}

export function pageScrollScopeKey(view: View, state: ScreenState): string {
  const competition = state.name === 'competition' ? `${state.competitionType}:${competitionMenu(state)}` : ''
  const team = state.name === 'team' ? [state.tab, state.matchesCompetition,
    'historyMenu' in state ? state.historyMenu : 'honors',
    'historyCompetition' in state ? state.historyCompetition : 'all',
  ].join(':') : ''
  return `${view.name}:${'id' in view ? view.id : ''}:${competition}:${team}`
}

type DistanceSurface = Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight' | 'addEventListener' | 'removeEventListener'> & Partial<Pick<HTMLElement, 'children'>>
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
  // The viewport stays fixed while filters, disclosures and loaded images change
  // its content height. Observe the route roots as well as the viewport itself.
  const observed = new Set<Element>()
  const refreshContent = () => {
    const children = new Set(Array.from(surface.children ?? []))
    for (const child of observed) if (!children.has(child)) { resize?.unobserve(child); observed.delete(child) }
    for (const child of children) if (!observed.has(child)) { resize?.observe(child); observed.add(child) }
    update()
  }
  refreshContent()
  const mutation = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(refreshContent)
  mutation?.observe(surface as HTMLElement, { childList: true, subtree: true, attributes: true, characterData: true })
  return () => { surface.removeEventListener('scroll', update); resize?.disconnect(); mutation?.disconnect() }
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
