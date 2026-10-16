export type RankingWindow = { start: number; end: number; top: number; bottom: number; rowHeight: number }

export const RANKING_ROW_ESTIMATE = 53
const OVERSCAN = 6

/** Indexes remain indexes in the complete canonical ranking, never a truncated result. */
export function rankingWindow(count: number, rowHeight: number, offset: number, viewportHeight: number): RankingWindow {
  if (!count) return { start: 0, end: 0, top: 0, bottom: 0, rowHeight }
  const height = Math.max(1, rowHeight)
  const first = Math.min(count - 1, Math.max(0, Math.floor(offset / height)))
  const start = Math.max(0, first - OVERSCAN)
  const end = Math.min(count, Math.max(first + 1, Math.ceil((offset + viewportHeight) / height)) + OVERSCAN)
  return { start, end, top: start * height, bottom: (count - end) * height, rowHeight: height }
}

/** Observe the existing app scroll surface; there is no nested scroll container. */
export function observeRankingViewport(list: HTMLElement, count: number, onWindow: (range: RankingWindow) => void) {
  const viewport = list.closest<HTMLElement>('.app-content')
  if (!viewport) return () => {}
  let frame: number | undefined
  let rowHeight = RANKING_ROW_ESTIMATE
  const read = () => {
    frame = undefined
    const offset = viewport.getBoundingClientRect().top + viewport.clientTop - list.getBoundingClientRect().top
    onWindow(rankingWindow(count, rowHeight, offset, viewport.clientHeight))
  }
  const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(read) }
  const measure = () => {
    const row = list.querySelector<HTMLElement>('[data-virtual-row]')
    const measured = row?.getBoundingClientRect().height
    if (measured && measured > 0) rowHeight = measured
    schedule()
  }
  const row = list.querySelector<HTMLElement>('[data-virtual-row]')
  const measured = row?.getBoundingClientRect().height
  if (measured && measured > 0) rowHeight = measured
  read()
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
  observer?.observe(viewport)
  observer?.observe(list)
  if (row) observer?.observe(row)
  viewport.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', measure)
  return () => {
    observer?.disconnect()
    viewport.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', measure)
    if (frame !== undefined) cancelAnimationFrame(frame)
  }
}
