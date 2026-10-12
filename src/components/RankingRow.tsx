import { useEffect, useRef } from 'react'
import { PlayerIdentityAction, TeamIdentityAction } from './EntityActions'
import { RankDelta } from './SeasonUI'
import { playerFullName } from './ui'
import { ensureHorizontalTabVisible } from '../lib/horizontalTabScroll'
import type { Player, Team } from '../types'

export function RankingRow({ rank, player, team, value, movement = null, onClick, onPlayerNavigate, onTeamNavigate, compact = false, selected = false, positionLabel, detail, rankPrefix = '' }: { rank: number; player?: Player; team?: Team; value: string; movement?: number | null; onClick?: () => void; onPlayerNavigate?: (playerId: string) => void; onTeamNavigate?: (teamId: string) => void; compact?: boolean; selected?: boolean; positionLabel?: string; detail?: string; rankPrefix?: string }) {
  const playerNavigate: ((playerId: string) => void) | undefined = onPlayerNavigate ?? (onClick ? () => onClick() : undefined)
  const className = `flex w-full items-center gap-2 px-3 py-2 text-left ${compact ? 'min-h-11' : 'min-h-13'} ${selected ? 'bg-emerald-500/10' : ''}`
  const playerContent = <><b className="block truncate text-xs">{playerFullName(player)}</b><small className="block truncate text-[10px] text-zinc-500">{team?.shortName ?? team?.name ?? 'No team'} · {positionLabel ?? player?.position ?? '—'}{detail ? ` · ${detail}` : ''}</small></>
  return <div className={className}><b className="w-5 text-xs text-zinc-500">{rankPrefix}{rank}</b><RankDelta value={movement} /><PlayerIdentityAction player={player} onNavigate={playerNavigate} avatarClassName={compact ? 'h-7 w-7 text-[7px]' : 'h-9 w-9 text-[9px]'} /><TeamIdentityAction team={team} onNavigate={onTeamNavigate} iconClassName={compact ? 'h-5 w-5 text-[6px]' : 'h-6 w-6 text-[7px]'} />{playerNavigate && player ? <button type="button" aria-pressed={selected || undefined} onClick={() => playerNavigate(player.id)} className="min-w-0 flex-1 rounded-md active:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">{playerContent}</button> : <span className="min-w-0 flex-1">{playerContent}</span>}<b className="text-xs text-emerald-300">{value}</b></div>
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

export function RankingMetricTabs<T extends string>({ label, value, onChange, options, size = 'metric', pinnedOption }: { label: string; value: T; onChange: (value: T) => void; options: readonly { value: T; label: string }[]; size?: 'metric' | 'navigation' | 'award'; pinnedOption?: { value: T; label: string } }) {
  const container = useRef<HTMLDivElement | null>(null)
  const selected = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const viewport = container.current
    const item = selected.current
    if (viewport && item) ensureHorizontalTabVisible(viewport, item)
  }, [value])
  const sizing = size === 'award' ? 'px-2.5 py-1 text-[10px] font-black' : size === 'navigation' ? 'min-h-9 px-4 py-2 text-xs font-bold' : 'px-3 py-1.5 text-[10px] font-bold'
  const selectedTone = size === 'award' ? 'bg-emerald-400 text-black' : 'bg-emerald-500 text-black'
  const idleTone = size === 'award' ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-900 text-zinc-400'
  const button = (option: { value: T; label: string }, scrolls: boolean) => <button key={option.value} ref={scrolls && option.value === value ? selected : undefined} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)} className={`shrink-0 rounded-full ${sizing} ${option.value === value ? selectedTone : idleTone} focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300`}>{option.label}</button>
  const tabs = <div ref={container} role={pinnedOption ? undefined : 'group'} className={`no-scrollbar relative flex min-w-0 max-w-full gap-1 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x ${pinnedOption ? 'flex-1' : ''}`} aria-label={pinnedOption ? `${label} scrollable options` : label}>{options.map(option => button(option, true))}</div>
  return pinnedOption ? <div role="group" aria-label={label} className="flex min-w-0 max-w-full items-start gap-2">{tabs}{button(pinnedOption, false)}</div> : tabs
}
