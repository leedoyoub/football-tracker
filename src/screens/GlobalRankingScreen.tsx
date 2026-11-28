import { useMemo } from 'react'
import { CompetitionScopeSelector, type CompetitionScope } from '../components/CompetitionScopeSelector'
import { RankingMetricTabs, RankingRow, useMetricSwipe } from '../components/RankingRow'
import { FloatingScrollToTop } from '../components/FloatingScrollToTop'
import { VirtualRankingList } from '../components/VirtualRankingList'
import { RANKING_METRICS, formatRankingMetricValue, rankingTitle } from '../lib/rankingMetrics'
import { matchCompetitionType } from '../engine/competition'
import { buildGlobalRankingData, rankGlobalRankingRows, type LeaderboardMetric } from '../engine/stats'
import { normalizePositionFilters, positionFilterFamilies } from '../engine/positionScope'
import { historicalRankingTeams, normalizeRankingTeamIds, playerInRankingTeams } from '../engine/rankingPresentation'
import { PositionFilter } from '../components/PositionFilter'
import { TeamFilter } from '../components/TeamFilter'
import { compactTrigger } from '../components/compactMenuStyles'
import { saveRankingRankMode } from '../lib/rankingRankMode'
import { currentPlayerRankingSnapshots, rankingMovement } from '../engine/seasonAnalytics'
import { useStore } from '../store'
import type { ScreenStateByView, View } from '../types'

export function GlobalRankingScreen({ season, screenState, onStateChange, onNavigate, onBack }: { season: string; screenState: ScreenStateByView['global-ranking']; onStateChange: (state: ScreenStateByView['global-ranking']) => void; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches } = useStore()
  const metric = screenState.metric as LeaderboardMetric
  const scope = screenState.scope as CompetitionScope
  const isOverall = screenState.rankMode === 'overall'
  const modeLabel = isOverall ? 'Overall' : 'Filtered'
  const teamIds = useMemo(() => normalizeRankingTeamIds(screenState.teamIds ?? screenState.teamId, teams.map(team => team.id)), [screenState.teamIds, screenState.teamId, teams])
  const positions = useMemo(() => normalizePositionFilters(screenState.positionFilters ?? screenState.positionFilter), [screenState.positionFilters, screenState.positionFilter])
  const setMetric = (next: LeaderboardMetric) => onStateChange({ ...screenState, metric: next })
  const setScope = (next: CompetitionScope) => onStateChange({ ...screenState, scope: next })
  const setTeamIds = (next: string[]) => onStateChange({ ...screenState, teamIds: next, teamId: next[0] ?? null })
  const toggleRankMode = () => {
    const rankMode = isOverall ? 'filtered' : 'overall'
    saveRankingRankMode(rankMode)
    onStateChange({ ...screenState, rankMode })
  }
  const scopedMatches = useMemo(() => matches.filter(match => match.season === season && (scope === 'all' || matchCompetitionType(match) === scope)), [matches, season, scope])
  const index = useMemo(() => buildGlobalRankingData(players, scopedMatches, { seasons: [season], teams: [], positions: [] }, 'rating'), [players, scopedMatches, season])
  const ranked = useMemo(() => rankGlobalRankingRows(index, players, metric).map((row, index) => ({ ...row, rank: index + 1 })), [index, players, metric])
  const hasTeamFilter = Boolean(teamIds.length)
  const membership = useMemo(() => hasTeamFilter ? historicalRankingTeams(scopedMatches, true) : new Map<string, ReadonlySet<string>>(), [scopedMatches, hasTeamFilter])
  const rows = useMemo(() => {
    if (!teamIds.length && !positions.length) return ranked
    const allowed = new Set(positionFilterFamilies(positions))
    const visible = ranked.filter(row => (!allowed.size || (row.scopedPositionFamily && allowed.has(row.scopedPositionFamily))) && playerInRankingTeams(row.playerId, teamIds, membership))
    return isOverall ? visible : visible.map((row, index) => ({ ...row, rank: index + 1 }))
  }, [isOverall, membership, positions, ranked, teamIds])
  const ranksMatchLeagueSnapshot = scope === 'league' && (isOverall || (!positions.length && !teamIds.length))
  const snapshots = useMemo(() => ranksMatchLeagueSnapshot ? currentPlayerRankingSnapshots(players, matches, season) : null, [ranksMatchLeagueSnapshot, players, matches, season])
  const visibleRowMovement = useMemo(() => snapshots ? rankingMovement(snapshots.current, snapshots.previous, metric) : new Map<string, number | null>(), [snapshots, metric])
  const swipe = useMetricSwipe(RANKING_METRICS.map(item => item.value), metric, setMetric)
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players]); const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const sectionId = 'global-ranking-leaderboard'
  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 min-h-9 px-1 text-xs font-semibold text-emerald-400">← Back</button>
    <div id={sectionId} className="mb-3 flex items-center justify-between gap-2">
      <div><h1 className="text-2xl font-semibold">{rankingTitle(scope, Boolean(teamIds.length))}</h1><p className="text-[10px] text-zinc-500">{season}</p></div>
      <CompetitionScopeSelector value={scope} onChange={setScope} />
    </div>
    <div className="mb-2 flex justify-end gap-2">
      <button type="button" className={`${compactTrigger(!isOverall)} mr-auto w-[4.5rem] shrink-0`} aria-label={`Ranking mode: ${modeLabel}`} onClick={toggleRankMode}>{modeLabel}</button>
      <PositionFilter values={positions} onChange={positionFilters => onStateChange({ ...screenState, positionFilters, positionFilter: positionFilters[0] ?? 'all' })} label="Global Ranking position" allLabel="Position" allAccessibilityLabel="All positions" />
      <TeamFilter values={teamIds} teams={teams} onChange={setTeamIds} label="Global Ranking team" />
    </div>
    <RankingMetricTabs label="Global ranking metric" value={metric} onChange={setMetric} options={RANKING_METRICS} />
    {rows.length > 10 && <FloatingScrollToTop sectionId={sectionId} />}
    <div {...swipe} className="mt-3 overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe ranking metrics">
      <VirtualRankingList rows={rows} renderRow={row => {
        const player = playerById.get(row.playerId); const team = teamById.get(row.historicalTeamId ?? row.teamId)
        return <RankingRow positionLabel={row.scopedPositionFamily} rank={row.rank} player={player} team={team} movement={visibleRowMovement.get(row.playerId) ?? null} value={formatRankingMetricValue(metric, row.value)} onPlayerNavigate={id => onNavigate({ name: 'player', id, season, competitionType: scope, ...(teamIds.length === 1 ? { teamId: teamIds[0] } : {}) })} onTeamNavigate={id => onNavigate({ name: 'team', id })} />
      }} />
      {!rows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}
    </div>
  </div>
}
