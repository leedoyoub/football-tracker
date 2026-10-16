import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { observeRankingViewport, rankingWindow, RANKING_ROW_ESTIMATE } from '../lib/rankingWindow'

/** Uniform, single-line RankingRows retain their natural height, measured after mount. */
export function VirtualRankingList<T extends { playerId: string } | { id: string }>({ rows, renderRow }: { rows: readonly T[]; renderRow: (row: T, index: number) => ReactNode }) {
  const list = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState(() => rankingWindow(rows.length, RANKING_ROW_ESTIMATE, 0, 640))
  useLayoutEffect(() => {
    if (!list.current) return
    return observeRankingViewport(list.current, rows.length, next => setRange(previous => previous.start === next.start && previous.end === next.end && previous.top === next.top && previous.bottom === next.bottom && previous.rowHeight === next.rowHeight ? previous : next))
  }, [rows])
  // Clamp synchronously when a filter shrinks the list, before the layout observer runs.
  const start = Math.min(range.start, Math.max(0, rows.length - 1))
  const end = Math.min(rows.length, Math.max(start + 1, range.end))
  const rowHeight = range.rowHeight
  return <div ref={list} role="list" aria-label="Player rankings" style={{ overflowAnchor: 'none' }}>
    <div aria-hidden="true" style={{ height: start * rowHeight }} />
    {rows.slice(start, end).map((row, index) => { const id = 'playerId' in row ? row.playerId : row.id; return <div key={id} data-virtual-row={id} role="listitem" aria-posinset={start + index + 1} aria-setsize={rows.length} className={start + index + 1 < rows.length ? 'border-b border-white/5' : ''}>{renderRow(row, start + index)}</div> })}
    <div aria-hidden="true" style={{ height: (rows.length - end) * rowHeight }} />
  </div>
}
