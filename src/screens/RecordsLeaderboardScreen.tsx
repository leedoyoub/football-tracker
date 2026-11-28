import { useMemo } from 'react'
import { CompetitionScopeSelector } from '../components/CompetitionScopeSelector'
import { PositionFilter } from '../components/PositionFilter'
import { RecordsSeasonFilter } from '../components/RecordsSeasonFilter'
import { TeamFilter } from '../components/TeamFilter'
import { RecordRow } from '../components/RecordRows'
import { VirtualRankingList } from '../components/VirtualRankingList'
import { compactTrigger } from '../components/compactMenuStyles'
import { normalizePositionFilters } from '../engine/positionScope'
import { seasonsFromMatches } from '../engine/stats'
import { useStore } from '../store'
import type { ScreenStateByView, View } from '../types'
import { EMPTY_COMPETITION_STATES, recordRowKey, recordsLeaderboardGroups, recordsLeaderboardSection } from './recordsLeaderboards'

type State = ScreenStateByView['records-leaderboard']
export function RecordsLeaderboardScreen({ screenState, onStateChange, onNavigate, onBack }: { screenState: State; onStateChange: (state: State) => void; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches, competitionStates = EMPTY_COMPETITION_STATES } = useStore()
  const { category, leaderboardId, competition, filterSeasonIds, filterTeamIds, positionFilter, positionFilters } = screenState
  const rankMode = screenState.rankMode ?? 'filtered'
  const patch = (next: Partial<State>) => onStateChange({ ...screenState, ...next })
  const scope = useMemo(() => ({ seasons: filterSeasonIds, teamIds: filterTeamIds, competition, positionFilter, positionFilters, rankMode }), [filterSeasonIds, filterTeamIds, competition, positionFilter, positionFilters, rankMode])
  const section = recordsLeaderboardSection(category, leaderboardId)
  const group = useMemo(() => recordsLeaderboardGroups({
    category, players, teams, matches, states: competitionStates, scope, section, selectedIds: [leaderboardId],
  })[0], [category, leaderboardId, section, players, teams, matches, competitionStates, scope])
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const matchById = useMemo(() => new Map(matches.map(match => [match.id, match])), [matches])
  const seasons = useMemo(() => [...new Set([...seasonsFromMatches(matches), ...competitionStates.map(state => state.season)])], [matches, competitionStates])
  const entries = useMemo(() => group?.rows.map(row => ({ id: recordRowKey(row), row })) ?? [], [group])
  const modeLabel = rankMode === 'overall' ? 'Overall' : 'Filtered'

  return <div className="px-4 pb-8 pt-5">
    <button type="button" onClick={onBack} className="min-h-9 text-xs font-semibold text-emerald-300">‹ Back to Records</button>
    <h1 className="mb-3 text-xl font-semibold">{group?.title ?? 'Records leaderboard'}</h1>
    {group ? <>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {category !== 'combination' && <button type="button" className={`${compactTrigger(rankMode === 'filtered')} mr-auto w-[4.5rem] shrink-0`} aria-label={`Records ranking mode: ${modeLabel}`} onClick={() => patch({ rankMode: rankMode === 'overall' ? 'filtered' : 'overall' })}>{modeLabel}</button>}
        <RecordsSeasonFilter value={scope.seasons} seasons={seasons} onChange={filterSeasonIds => patch({ filterSeasonIds })} label="Records leaderboard seasons" />
        {group.applicableFilters.position && <PositionFilter values={scope.positionFilters ?? normalizePositionFilters(scope.positionFilter)} onChange={positionFilters => patch({ positionFilters, positionFilter: positionFilters[0] ?? 'all' })} label="Records leaderboard position" />}
        {group.applicableFilters.team && <TeamFilter values={scope.teamIds} teams={teams} onChange={filterTeamIds => patch({ filterTeamIds })} label="Records leaderboard team" />}
      </div>
      <div className="mb-3"><CompetitionScopeSelector value={scope.competition} onChange={competition => patch({ competition })} /></div>
      {category === 'player' && section === 'awards' && normalizePositionFilters(scope.positionFilters ?? scope.positionFilter).length > 0 && <p className="mb-2 text-xs text-zinc-400">Counts use the positions recorded when each award was earned.</p>}
      {group.rows.some(row => row.comparisonGroup !== undefined) && <p className="mb-2 text-xs text-zinc-400">Ranks compare seasons with the same number of recorded matches.</p>}
      <div className="overflow-hidden rounded-xl bg-zinc-900"><VirtualRankingList rows={entries} renderRow={({ row }) => <RecordRow row={row} group={group} players={playerById} teams={teamById} matches={matchById} scope={scope} onNavigate={onNavigate} />} /></div>
      {!entries.length && <p className="py-5 text-center text-sm text-zinc-500">No qualifying records in this scope.</p>}
    </> : <p className="py-5 text-sm text-zinc-400">This leaderboard is unavailable in the current archive.</p>}
  </div>
}
