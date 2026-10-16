import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { MeasuredCardWindow, observeCardViewport, type CardWindow } from '../lib/cardWindow'

/** Small lists retain normal flow. Large lists measure the unchanged card renderer. */
export function VirtualCardList<T>({ rows, itemKey, renderRow, estimate, measurementOwner, gap = 8 }: { rows: readonly T[]; itemKey: (row: T) => string; renderRow: (row: T, index: number) => ReactNode; estimate: number; measurementOwner?: object; gap?: number }) {
  const list = useRef<HTMLDivElement>(null)
  const controller = useRef<ReturnType<typeof observeCardViewport> | null>(null)
  const [range, setRange] = useState<CardWindow>(() => new MeasuredCardWindow(rows.map(itemKey), estimate, gap).window(0, 640))
  const virtual = rows.length > 40
  useLayoutEffect(() => {
    if (!virtual || !list.current) return
    const observer = observeCardViewport(list.current, rows.map(itemKey), estimate, gap, measurementOwner ?? rows, next => setRange(previous => previous.start === next.start && previous.end === next.end && previous.top === next.top && previous.bottom === next.bottom ? previous : next))
    controller.current = observer
    return () => { observer.dispose(); controller.current = null }
  }, [rows, itemKey, estimate, gap, measurementOwner, virtual])
  useLayoutEffect(() => { controller.current?.refresh() })
  if (!virtual) return <div className="space-y-2">{rows.map((row, index) => <div key={itemKey(row)}>{renderRow(row, index)}</div>)}</div>
  const start = Math.min(range.start, Math.max(0, rows.length - 1)), end = Math.min(rows.length, Math.max(start + 1, range.end))
  return <div ref={list} style={{ overflowAnchor: 'none' }}>
    <div aria-hidden="true" style={{ height: range.top }} />
    {rows.slice(start, end).map((row, i) => <div key={itemKey(row)} data-card-key={itemKey(row)} data-card-index={start + i} style={{ paddingBottom: start + i + 1 < rows.length ? gap : 0 }}>{renderRow(row, start + i)}</div>)}
    <div aria-hidden="true" style={{ height: range.bottom }} />
  </div>
}
