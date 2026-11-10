import { useMemo } from 'react'
import type { Team } from '../types'
import type { Standing } from '../engine/standings'
import { TeamIcon } from './TeamIcon'
import { TeamLink } from './TeamLink'
import { RankDelta } from './SeasonUI'
import { StandingSortButton } from './StandingSortButton'
import { projectStandings, standingAriaSort } from '../lib/standingSort'
import { useStandingSort } from '../lib/useStandingSort'

export function StandingsTable({ standings, teams, compact = false, sortScope = 'standings', onTeamNavigate }: { standings: Standing[]; teams: Team[]; compact?: boolean; sortScope?: string; onTeamNavigate?: (teamId: string) => void }) {
  const byId = useMemo(() => Object.fromEntries(teams.map((team) => [team.id, team])), [teams])
  const { sort, onSort } = useStandingSort(sortScope)
  const rows = useMemo(() => projectStandings(standings, sort), [standings, sort])
  const header = (metric: Parameters<typeof onSort>[0], label: string) => <StandingSortButton metric={metric} label={label} sort={sort} onSort={onSort} />
  return <div className="overflow-hidden rounded-xl bg-zinc-900">
    <table className="w-full table-fixed text-[11px] tabular-nums">
      <thead className="border-b border-white/10 text-zinc-500"><tr>
        <th className="w-6 py-2.5 text-center font-semibold">{header('rank', '#')}</th><th className="text-left font-semibold">Team</th>
        <th aria-sort={standingAriaSort(sort, 'played')} className="w-6 text-center font-semibold">{header('played', 'P')}</th><th aria-sort={standingAriaSort(sort, 'wins')} className="w-6 text-center font-semibold">{header('wins', 'W')}</th><th aria-sort={standingAriaSort(sort, 'draws')} className="w-6 text-center font-semibold">{header('draws', 'D')}</th><th aria-sort={standingAriaSort(sort, 'losses')} className="w-6 text-center font-semibold">{header('losses', 'L')}</th>
        <th aria-sort={standingAriaSort(sort, 'goalsFor', 'goalsAgainst')} className="w-11 text-center font-semibold">{header('goalsFor', 'GF')}-{header('goalsAgainst', 'GA')}</th><th aria-sort={standingAriaSort(sort, 'goalDifference')} className="w-8 text-center font-semibold">{header('goalDifference', 'GD')}</th><th aria-sort={standingAriaSort(sort, 'points')} className="w-8 pr-1 text-center font-semibold">{header('points', 'Pts')}</th>
      </tr></thead>
      <tbody>{rows.map((row) => { const team = byId[row.teamId]; return <tr key={row.teamId} data-team-id={row.teamId} className="border-b border-white/[.06] last:border-0">
        <td data-official-rank={row.rank} className="py-2.5 text-center font-bold text-zinc-500"><span className="block">{row.rank}</span>{'movement' in row && <RankDelta value={(row as Standing & { movement: number | null }).movement} />}</td>
        <td className="min-w-0 py-2.5">{onTeamNavigate ? <TeamLink team={team} compact={compact} onNavigate={onTeamNavigate} /> : <span className="flex min-w-0 items-center gap-1.5"><TeamIcon team={team} className="h-5 w-5 text-[7px]" /><span className="truncate font-semibold">{team?.name}</span></span>}</td>
        <td className="text-center text-zinc-300">{row.played}</td><td className="text-center text-zinc-300">{row.wins}</td><td className="text-center text-zinc-300">{row.draws}</td><td className="text-center text-zinc-300">{row.losses}</td>
        <td className="text-center text-zinc-300">{row.goalsFor}-{row.goalsAgainst}</td><td className={`text-center ${row.goalDifference > 0 ? 'text-emerald-400' : row.goalDifference < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td><td className="pr-1 text-center font-black text-white">{row.points}</td>
      </tr> })}</tbody>
    </table>
  </div>
}
