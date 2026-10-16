import { useCallback, useEffect, useRef, useState } from 'react'
import { createScrollToTopController, observeScrollDistance, scrollViewAllSection, scrollViewAllSurface } from './scrollToTop'
import { APP_SCROLL_TO_TOP } from '../lib/scrollMotion'

function useScrollToTopVisibility(active: boolean, sectionId?: string, distance?: number) {
  const sentinelRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const scrollToTop = useCallback(() => {
    const target = sectionId ? document.getElementById(sectionId) : null
    if (target) return scrollViewAllSection(target)
    const surface = sentinelRef.current?.closest<HTMLElement>('.app-content')
    if (distance !== undefined) surface?.dispatchEvent(new Event(APP_SCROLL_TO_TOP))
    scrollViewAllSurface(surface ?? undefined)
  }, [sectionId, distance])
  useEffect(() => {
    if (!active) { setVisible(false); return }
    const sentinel = sentinelRef.current
    if (!sentinel) return
    if (distance !== undefined) {
      const surface = sentinel.closest<HTMLElement>('.app-content')
      return surface ? observeScrollDistance(surface, distance, setVisible) : undefined
    }
    const controller = createScrollToTopController(
      callback => new IntersectionObserver(entries => { callback(entries) ; setVisible(!entries[0]?.isIntersecting) }, { threshold: 0.01 }),
      scrollToTop,
    )
    controller.observe(sentinel)
    return () => controller.disconnect()
  }, [active, sectionId, distance, scrollToTop])
  return { sentinelRef, visible, scrollToTop }
}

/** A fixed, safe-area-aware control for one active expanded section. */
export function FloatingScrollToTop({ active = true, sectionId, distance }: { active?: boolean; sectionId?: string; distance?: number }) {
  const { sentinelRef, visible, scrollToTop } = useScrollToTopVisibility(active, sectionId, distance)
  if (!active) return null
  return <><span ref={sentinelRef} aria-hidden="true" className={distance === undefined ? 'block h-px' : 'absolute h-0 w-0'} />{visible && <button type="button" aria-label="Scroll to top" onClick={scrollToTop} className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-lg font-black text-black shadow-lg shadow-black/40" title="Scroll to top">↑</button>}</>
}
