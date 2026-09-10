import { useMemo, useState } from 'react'
import { combinationStats, sortCombinationsByOnPitch, type CombinationKind, type CombinationOnPitchMetric, type CombinationStats } from '../engine/analytics'
import { playerFullName } from './ui'
import type { Match, Player } from '../types'

type Section = 'attack' | 'midfield' | 'defensive'
type StartingMetric = 'teamGoals' | 'combinedGA' | 'involvement' | 'gd' | 'gf' | 'ga' | 'sot' | 'cleanSheets' | 'ppg' | 'winRate'
type Sort = StartingMetric | CombinationOnPitchMetric

const sectionKinds: Record<Section, CombinationKind> = { attack: 'attack', midfield: 'midfield', defensive: 'cb' }
const defensiveKinds: [CombinationKind, string][] = [['cb', 'CB Pair'], ['fullback', 'Fullback Pair'], ['backFour', 'Back Four']]
const labels: Record<Section, string> = { attack: 'ATTACKING', midfield: 'MIDFIELD', defensive: 'DEFENSIVE' }
const startingOptions: Record<Section, { id: StartingMetric; label: string }[]> = {
  attack: [{ id: 'teamGoals', label: 'Team Goals / Match' }, { id: 'combinedGA', label: 'Combined G+A / Match' }, { id: 'involvement', label: 'Goal Involvement %' }, { id: 'ppg', label: 'PPG' }, { id: 'winRate', label: 'Win Rate' }],
  midfield: [{ id: 'gd', label: 'GD / Match' }, { id: 'gf', label: 'GF / Match' }, { id: 'ga', label: 'GA / Match' }, { id: 'ppg', label: 'PPG' }, { id: 'winRate', label: 'Win Rate' }],
  defensive: [{ id: 'ga', label: 'GA / Match' }, { id: 'sot', label: 'SOT Allowed / Match' }, { id: 'cleanSheets', label: 'Clean Sheet Rate' }, { id: 'ppg', label: 'PPG' }, { id: 'gd', label: 'GD / Match' }],
}
const onPitchOptions: { id: CombinationOnPitchMetric; label: string }[] = [{ id: 'onPitchGF90', label: 'On-Pitch GF / 90' }, { id: 'onPitchGA90', label: 'On-Pitch GA / 90' }, { id: 'onPitchGD90', label: 'On-Pitch GD / 90' }]

function startingValue(row: CombinationStats, metric: StartingMetric) {
  const games = row.startsTogether
  if (!games) return null
  if (metric === 'teamGoals' || metric === 'gf') return row.startingGoalsFor / games
  if (metric === 'combinedGA') return row.startingCombinedGA / games
  if (metric === 'involvement') return row.startingGoalsFor ? row.startingGoalInvolvements / row.startingGoalsFor * 100 : null
  if (metric === 'gd') return (row.startingGoalsFor - row.startingGoalsAgainst) / games
  if (metric === 'ga') return row.startingGoalsAgainst / games
  if (metric === 'sot') return row.startingOpponentSot / games
  if (metric === 'cleanSheets') return row.startingCleanSheets / games * 100
  if (metric === 'ppg') return (row.startingWins * 3 + row.startingDraws) / games
  return row.startingWins / games * 100
}

function display(value: number | null, metric: StartingMetric | CombinationOnPitchMetric) {
  if (value === null || !Number.isFinite(value)) return '—'
  return metric === 'involvement' || metric === 'cleanSheets' || metric === 'winRate' ? `${value.toFixed(1)}%` : value.toFixed(2)
}

export function CombinationRecords({ players, matches }: { players: Player[]; matches: Match[] }) {
  const [section, setSection] = useState<Section>('attack')
  const [defensiveKind, setDefensiveKind] = useState<CombinationKind>('cb')
  const [sort, setSort] = useState<Sort>('teamGoals')
  const kind = section === 'defensive' ? defensiveKind : sectionKinds[section]
  const options = startingOptions[section]
  const activeStarting = options.some(option => option.id === sort) ? sort as StartingMetric : options[0].id
  const rows = useMemo(() => {
    const data = combinationStats(players, matches, {}, kind)
    if (sort === 'onPitchGF90' || sort === 'onPitchGA90' || sort === 'onPitchGD90') return sortCombinationsByOnPitch(data, sort)
    return data.slice().sort((left, right) => {
      const leftValue = startingValue(left, sort); const rightValue = startingValue(right, sort)
      const reverse = sort === 'ga' || sort === 'sot'
      const a = leftValue ?? (reverse ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      const b = rightValue ?? (reverse ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      return (reverse ? a - b : b - a) || right.startsTogether - left.startsTogether || right.togetherMinutes - left.togetherMinutes || left.key.localeCompare(right.key)
    })
  }, [players, matches, kind, sort])
  const changeSection = (next: Section) => { setSection(next); setSort(startingOptions[next][0].id) }
  const changeDefensiveKind = (next: CombinationKind) => { setDefensiveKind(next); setSort(startingOptions.defensive[0].id) }
  const startingLabel = options.find(option => option.id === activeStarting)?.label ?? 'Starting metric'
  return <section aria-label="Combination records"><h2 className="mb-2 text-sm font-semibold">Combination Records</h2><p className="mb-3 text-[10px] text-zinc-500">Starting-match outcomes and exact shared on-pitch intervals are kept separate.</p>
    <div className="no-scrollbar mb-2 flex gap-1 overflow-x-auto rounded-xl bg-zinc-900 p-1">{(Object.keys(labels) as Section[]).map(item => <button key={item} type="button" onClick={() => changeSection(item)} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-black ${section === item ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}>{labels[item]}</button>)}</div>
    {section === 'defensive' && <div className="no-scrollbar mb-2 flex gap-1 overflow-x-auto">{defensiveKinds.map(([item, label]) => <button key={item} type="button" onClick={() => changeDefensiveKind(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${kind === item ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400'}`}>{label}</button>)}</div>}
    <label className="mb-2 block text-[10px] font-bold text-zinc-500">Starting-match sort<select aria-label="Combination starting metric" value={activeStarting} onChange={event => setSort(event.target.value as StartingMetric)} className="mt-1 w-full rounded-lg bg-zinc-900 px-2 py-2 text-xs text-white">{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto">{onPitchOptions.map(option => <button key={option.id} type="button" onClick={() => setSort(option.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${sort === option.id ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400'}`}>{option.label}</button>)}</div>
    <div className="space-y-2">{rows.slice(0, 30).map(row => <article key={row.key} className="rounded-xl bg-zinc-900 p-3"><b className="block truncate text-sm">{row.playerIds.map(id => playerFullName(players.find(player => player.id === id))).join(' · ')}</b><div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs"><Metric label="Starts Together" value={String(row.startsTogether)} /><Metric label="Matches Together" value={String(row.matches)} /><Metric label="Minutes Together" value={`${row.togetherMinutes}'`} /></div><details className="mt-3 border-t border-white/5 pt-2 text-xs"><summary className="cursor-pointer font-bold text-zinc-300">Performance</summary><div className="mt-2 grid grid-cols-2 gap-2"><div><p className="text-[9px] font-black uppercase text-zinc-500">Starting matches</p><p>{startingLabel}: {display(startingValue(row, activeStarting), activeStarting)}</p><p>W-D-L {row.startingWins}-{row.startingDraws}-{row.startingLosses} · GF {row.startingGoalsFor} · GA {row.startingGoalsAgainst}</p><p className="text-zinc-500">SOT Allowed is full-match only.</p></div><div><p className="text-[9px] font-black uppercase text-emerald-400">Exact on-pitch overlap</p><p>GF {row.onPitchGoalsFor} · GA {row.onPitchGoalsAgainst} · GD {row.onPitchGoalDifference > 0 ? '+' : ''}{row.onPitchGoalDifference}</p><p>GF/90 {display(row.onPitchGoalsForPer90, 'onPitchGF90')} · GA/90 {display(row.onPitchGoalsAgainstPer90, 'onPitchGA90')}</p><p>GD/90 {row.onPitchGoalDifferencePer90 > 0 ? '+' : ''}{display(row.onPitchGoalDifferencePer90, 'onPitchGD90')}</p></div></div></details></article>)}{!rows.length && <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No combinations have shared position-aware minutes in this scope.</p>}</div>
  </section>
}

function Metric({ label, value }: { label: string; value: string }) { return <span className="rounded-lg bg-black/20 px-1 py-1.5"><b className="block">{value}</b><small className="block text-[8px] uppercase text-zinc-500">{label}</small></span> }
