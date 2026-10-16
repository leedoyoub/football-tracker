import { APP_SCROLL_TO_TOP } from './scrollMotion'

export type CardWindow = { start: number; end: number; top: number; bottom: number }
const OVERSCAN = 5

/** Fenwick offsets: measured height updates and visible-index queries are O(log n). */
export class MeasuredCardWindow {
  private tree: number[]
  private heights: number[]
  private indices: Map<string, number>
  readonly keys: readonly string[]
  readonly gap: number
  private estimate: number
  private measurements: Map<string, number>
  constructor(keys: readonly string[], estimate: number, gap: number, measurements = new Map<string, number>()) {
    this.keys = keys; this.gap = gap; this.estimate = estimate; this.measurements = measurements
    this.tree = Array(keys.length + 1).fill(0)
    this.heights = keys.map(key => measurements.get(key) ?? estimate)
    this.indices = new Map(keys.map((key, i) => [key, i]))
    this.heights.forEach((height, i) => this.add(i, height + (i + 1 < keys.length ? gap : 0)))
  }
  private add(index: number, delta: number) { for (let i = index + 1; i < this.tree.length; i += i & -i) this.tree[i] += delta }
  offset(index: number): number { let sum = 0; for (let i = Math.min(index, this.keys.length); i > 0; i -= i & -i) sum += this.tree[i]; return sum }
  get total() { return this.offset(this.keys.length) }
  measure(key: string, height: number): boolean {
    const i = this.indices.get(key)
    if (i === undefined || !Number.isFinite(height) || height <= 0 || Math.abs(this.heights[i] - height) < .25) return false
    this.measurements.set(key, height); this.add(i, height - this.heights[i]); this.heights[i] = height
    return true
  }
  indexAt(offset: number): number {
    let index = 0, sum = 0, bit = 1
    while (bit * 2 <= this.keys.length) bit *= 2
    for (; bit; bit >>= 1) { const next = index + bit; if (next <= this.keys.length && sum + this.tree[next] <= Math.max(0, offset)) { index = next; sum += this.tree[next] } }
    return Math.min(Math.max(0, this.keys.length - 1), index)
  }
  window(offset: number, height: number): CardWindow {
    if (!this.keys.length) return { start: 0, end: 0, top: 0, bottom: 0 }
    const start = Math.max(0, this.indexAt(offset) - OVERSCAN)
    const end = Math.min(this.keys.length, this.indexAt(Math.max(0, offset + height)) + 1 + OVERSCAN)
    return { start, end, top: this.offset(start), bottom: this.total - this.offset(end) }
  }
  reset(measurements: Map<string, number>) {
    this.measurements = measurements
    for (let i = 0; i < this.keys.length; i++) { const height = measurements.get(this.keys[i]) ?? this.estimate; this.add(i, height - this.heights[i]); this.heights[i] = height }
  }
}

const caches = new WeakMap<object, Map<string, Map<string, number>>>()
function measurementsFor(owner: object, width: number, estimate: number, gap: number) {
  let layouts = caches.get(owner); if (!layouts) { layouts = new Map(); caches.set(owner, layouts) }
  const key = `${Math.round(width)}:${estimate}:${gap}`
  let measurements = layouts.get(key)
  if (!measurements) { if (layouts.size >= 4) layouts.delete(layouts.keys().next().value!); measurements = new Map(); layouts.set(key, measurements) }
  return measurements
}

/** Same main scroll surface as rankingWindow; cards add per-ID height measurement. */
export function observeCardViewport(list: HTMLElement, keys: readonly string[], estimate: number, gap: number, owner: object, onWindow: (range: CardWindow) => void) {
  const viewport = list.closest<HTMLElement>('.app-content')
  if (!viewport) return { refresh() {}, dispose() {} }
  let width = list.clientWidth
  const model = new MeasuredCardWindow(keys, estimate, gap, measurementsFor(owner, width, estimate, gap))
  let frame: number | undefined, disposed = false, targetingTop = false
  const beginTop = () => { targetingTop = true }
  const endTop = () => { targetingTop = false }
  const observed = new Set<Element>()
  const offset = () => viewport.getBoundingClientRect().top + viewport.clientTop - list.getBoundingClientRect().top
  const read = () => {
    frame = undefined
    if (disposed) return
    if (viewport.scrollTop <= 0) targetingTop = false
    const before = offset(), anchor = model.indexAt(before), anchorTop = model.offset(anchor)
    if (list.clientWidth !== width) { width = list.clientWidth; model.reset(measurementsFor(owner, width, estimate, gap)) }
    const rows = list.querySelectorAll<HTMLElement>('[data-card-key]')
    const mounted = new Set<Element>(rows)
    for (const row of observed) if (!mounted.has(row)) { resize?.unobserve(row); observed.delete(row) }
    for (const row of rows) {
      if (!observed.has(row)) { resize?.observe(row); observed.add(row) }
      model.measure(row.dataset.cardKey!, row.getBoundingClientRect().height - (Number(row.dataset.cardIndex) + 1 < keys.length ? gap : 0))
    }
    const adjustment = !targetingTop && before > 0 ? model.offset(anchor) - anchorTop : 0
    if (adjustment) viewport.scrollTop += adjustment
    onWindow(model.window(before + adjustment, viewport.clientHeight))
  }
  const refresh = () => { if (!disposed && frame === undefined) frame = requestAnimationFrame(read) }
  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refresh)
  resize?.observe(viewport); resize?.observe(list)
  viewport.addEventListener(APP_SCROLL_TO_TOP, beginTop, { passive: true })
  const interruptions = ['scrollend', 'wheel', 'touchstart', 'pointerdown', 'keydown']
  for (const event of interruptions) viewport.addEventListener(event, endTop, { passive: true })
  viewport.addEventListener('scroll', refresh, { passive: true }); window.addEventListener('resize', refresh)
  read()
  return { refresh, dispose() { disposed = true; if (frame !== undefined) cancelAnimationFrame(frame); resize?.disconnect(); viewport.removeEventListener(APP_SCROLL_TO_TOP, beginTop); for (const event of interruptions) viewport.removeEventListener(event, endTop); viewport.removeEventListener('scroll', refresh); window.removeEventListener('resize', refresh) } }
}
