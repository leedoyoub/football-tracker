import { useEffect, useRef, useState } from 'react'
import { createScrollToTopController, scrollViewAllSection, scrollViewAllSurface } from './scrollToTop'

function useScrollToTopVisibility(active: boolean, sectionId?: string) {
  const sentinelRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const scrollToTop = () => {
    const target = sectionId ? document.getElementById(sectionId) : null
    if (target) return scrollViewAllSection(target)
    scrollViewAllSurface(sentinelRef.current?.closest('.app-content') as HTMLElement | null ?? undefined)
  }
  useEffect(() => {
    if (!active) { setVisible(false); return }
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const controller = createScrollToTopController(
      callback => new IntersectionObserver(entries => { callback(entries) ; setVisible(!entries[0]?.isIntersecting) }, { threshold: 0.01 }),
      scrollToTop,
    )
    controller.observe(sentinel)
    return () => controller.disconnect()
  }, [active, sectionId])
  return { sentinelRef, visible, scrollToTop }
}

/** A fixed, safe-area-aware control for one active expanded section. */
export function FloatingScrollToTop({ active = true, sectionId }: { active?: boolean; sectionId?: string }) {
  const { sentinelRef, visible, scrollToTop } = useScrollToTopVisibility(active, sectionId)
  if (!active) return null
  return <><span ref={sentinelRef} aria-hidden="true" className="block h-px" />{visible && <button type="button" aria-label="Scroll to top" onClick={scrollToTop} className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-lg font-black text-black shadow-lg shadow-black/40" title="Scroll to top">↑</button>}</>
}
