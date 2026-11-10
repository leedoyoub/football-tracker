import { Fragment, useMemo } from 'react'
import type { Team } from '../types'
import type { CupDisplayRow, CupTableModel } from '../lib/cupTable'
import { projectStandings, standingAriaSort } from '../lib/standingSort'
import { useStandingSort } from '../lib/useStandingSort'
import { StandingSortButton } from './StandingSortButton'
import { TeamLink } from './TeamLink'

type TableModel = Pick<CupTableModel, 'rows' | 'selection' | 'complete' | 'provisional'>

function hasSurvivalLine(model: TableModel, row: CupDisplayRow, index: number) {
  if (model.selection === 'total') return false
  const previous = model.rows[index - 1]
  const ordinal = Number(model.selection.replace('stage', ''))
  return row.state === 'at-risk' && previous?.state !== 'at-risk'
    || model.complete && /^stage/.test(model.selection) && row.eliminatedStage === ordinal && previous?.eliminatedStage !== ordinal
}

export function CupStandingsTable({ model, teams, sortScope, onTeamNavigate }: { model: TableModel; teams: Team[]; sortScope: string; onTeamNavigate: (teamId: string) => void }) {
  const byId = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])), [teams])
  const { sort, onSort } = useStandingSort(sortScope)
  const rows = useMemo(() => projectStandings(model.rows, sort), [model.rows, sort])
  const boundaries = model.rows.filter((row, index) => hasSurvivalLine(model, row, index))
  const lineLabel = model.provisional ? 'Provisional Survival Line' : 'Survival Line'
  const header = (metric: Parameters<typeof onSort>[0], label: string) => <StandingSortButton metric={metric} label={label} sort={sort} onSort={onSort} />
  return <>{sort && boundaries.map(row => <p key={row.teamId} role="status" className="mb-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[10px] text-amber-200">{lineLabel} · Official boundary before #{row.rank} {byId[row.teamId]?.name ?? row.teamId}. Each team keeps its official status.</p>)}
    <div className="overflow-hidden rounded-xl bg-zinc-900">
      <table className="w-full table-fixed text-[11px] tabular-nums">
        <thead className="border-b border-white/10 text-zinc-500"><tr>
          <th className="w-6 py-2.5 text-center font-semibold">{header('rank', '#')}</th><th className="text-left font-semibold">Team</th>
          <th aria-sort={standingAriaSort(sort, 'played')} className="w-5 text-center font-semibold">{header('played', 'P')}</th>
          <th aria-label="W-D-L" aria-sort={standingAriaSort(sort, 'wins', 'draws', 'losses')} className="w-[42px] text-center font-semibold">{header('wins', 'W')}-{header('draws', 'D')}-{header('losses', 'L')}</th>
          <th aria-label="GF-GA" aria-sort={standingAriaSort(sort, 'goalsFor', 'goalsAgainst')} className="w-11 text-center font-semibold">{header('goalsFor', 'GF')}-{header('goalsAgainst', 'GA')}</th>
          <th aria-sort={standingAriaSort(sort, 'goalDifference')} className="w-[26px] text-center font-semibold">{header('goalDifference', 'GD')}</th><th aria-sort={standingAriaSort(sort, 'points')} className="w-[26px] pr-1 text-center font-semibold">{header('points', 'Pts')}</th>
        </tr></thead>
        <tbody>{rows.map((row, index) => <Fragment key={row.teamId}>
          {!sort && hasSurvivalLine(model, row, index) && <tr data-survival-line={true}><td colSpan={7}><div className="border-t border-dashed border-amber-400/70 px-2 py-1 text-center text-[8px] font-black uppercase tracking-[.18em] text-amber-300">{lineLabel}</div></td></tr>}
          <tr data-team-id={row.teamId} data-cup-state={row.state} className={'border-b border-white/[.06] last:border-0 ' + (row.state === 'at-risk' ? 'bg-orange-400/10 text-orange-100' : row.state === 'eliminated' ? 'bg-zinc-950/30 text-zinc-500 opacity-60' : '')}>
            <td data-official-rank={row.rank} className="py-2.5 text-center font-bold text-zinc-500">{row.rank}</td>
            <td className="min-w-0 py-2.5"><TeamLink team={byId[row.teamId]} compact onNavigate={onTeamNavigate} /><small className={'block break-words text-[9px] leading-tight ' + (row.state === 'at-risk' ? 'text-orange-300' : 'text-zinc-500')}>{row.status}</small></td>
            <td className="text-center text-zinc-300">{row.played}</td><td className="text-center text-zinc-300">{row.wins}-{row.draws}-{row.losses}</td><td className="text-center text-zinc-300">{row.goalsFor}-{row.goalsAgainst}</td>
            <td className={`text-center ${row.goalDifference > 0 ? 'text-emerald-400' : row.goalDifference < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td><td className="pr-1 text-center font-black text-white">{row.points}</td>
          </tr>
        </Fragment>)}</tbody>
      </table>
    </div>
  </>
}
