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
