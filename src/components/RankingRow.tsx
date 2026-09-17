import { useEffect, useRef } from 'react'
import { PlayerAvatar } from './PlayerAvatar'
import { RankDelta } from './SeasonUI'
import { playerFullName } from './ui'
import type { Player, Team } from '../types'

export function RankingRow({ rank, player, team, value, movement = null, onClick, compact = false, selected = false }: { rank: number; player?: Player; team?: Team; value: string; movement?: number | null; onClick?: () => void; compact?: boolean; selected?: boolean }) {
  const content = <><b className="w-5 text-xs text-zinc-500">{rank}</b><RankDelta value={movement} /><PlayerAvatar photoUrl={player?.photoUrl || player?.image} number={player?.number} className={compact ? 'h-7 w-7 text-[7px]' : 'h-9 w-9 text-[9px]'} /><span className="min-w-0 flex-1"><b className="block truncate text-xs">{playerFullName(player)}</b><small className="block truncate text-[10px] text-zinc-500">{team?.shortName ?? team?.name ?? 'No team'} · {player?.position ?? '—'}</small></span><b className="text-xs text-emerald-300">{value}</b></>
  const className = `flex w-full items-center gap-2 px-3 py-2 text-left ${compact ? 'min-h-11' : 'min-h-13'} ${onClick ? 'active:bg-white/5' : ''}`
  return onClick ? <button type="button" disabled={!player} aria-pressed={selected || undefined} onClick={onClick} className={`${className} ${selected ? 'bg-emerald-500/10' : ''} disabled:opacity-50`}>{content}</button> : <div className={className}>{content}</div>
}

export function useMetricSwipe<T extends string>(values: readonly T[], value: T, onChange: (value: T) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (event: React.TouchEvent) => { const touch = event.touches[0]; if (touch) start.current = { x: touch.clientX, y: touch.clientY } },
    onTouchEnd: (event: React.TouchEvent) => {
      const point = start.current; const touch = event.changedTouches[0]; start.current = null
      if (!point || !touch) return
      const horizontal = touch.clientX - point.x; const vertical = touch.clientY - point.y
      if (Math.abs(horizontal) < 44 || Math.abs(horizontal) <= Math.abs(vertical)) return
      const current = values.indexOf(value); const next = horizontal < 0 ? current + 1 : current - 1
      if (next >= 0 && next < values.length) onChange(values[next])
    },
  }
}

export function RankingMetricTabs<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: readonly { value: T; label: string }[] }) {
  const selected = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { selected.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [value])
  return <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x" aria-label={label}>{options.map(option => <button key={option.value} ref={option.value === value ? selected : undefined} type="button" onClick={() => onChange(option.value)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${option.value === value ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400'}`}>{option.label}</button>)}</div>
}
