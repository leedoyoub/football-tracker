import { useMemo } from 'react'
import { CompetitionScopeSelector, type CompetitionScope } from '../components/CompetitionScopeSelector'
import { RankingMetricTabs, RankingRow, useMetricSwipe } from '../components/RankingRow'
import { FloatingScrollToTop } from '../components/FloatingScrollToTop'
import { RANKING_METRICS, formatRankingMetricValue, rankingTitle } from '../lib/rankingMetrics'
import { matchCompetitionType } from '../engine/competition'
import { buildGlobalRankingData, rankGlobalRankingRows, type LeaderboardMetric } from '../engine/stats'
import { positionFilterFamilies } from '../engine/positionScope'
import { PositionFilter } from '../components/PositionFilter'
import { TeamFilter } from '../components/TeamFilter'
import { buildSeasonAnalytics, rankingMovement } from '../engine/seasonAnalytics'
import { useStore } from '../store'
import type { ScreenStateByView, View } from '../types'

export function GlobalRankingScreen({ season, screenState, onStateChange, onNavigate, onBack }: { season: string; screenState: ScreenStateByView['global-ranking']; onStateChange: (state: ScreenStateByView['global-ranking']) => void; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches } = useStore()
  const metric = screenState.metric as LeaderboardMetric
  const scope = screenState.scope as CompetitionScope
  const teamId = screenState.teamId
  const setMetric = (next: LeaderboardMetric) => onStateChange({ ...screenState, metric: next })
  const setScope = (next: CompetitionScope) => onStateChange({ ...screenState, scope: next })
  const setTeamId = (next: string | null) => onStateChange({ ...screenState, teamId: next })
  const scopedMatches = useMemo(() => matches.filter(match => match.season === season && (scope === 'all' || matchCompetitionType(match) === scope)), [matches, season, scope])
  const index = useMemo(() => buildGlobalRankingData(players, scopedMatches, { seasons: [season], teams: teamId ? [teamId] : [], positions: positionFilterFamilies(screenState.positionFilter) }, 'rating'), [players, scopedMatches, season, teamId, screenState.positionFilter])
  const rows = useMemo(() => rankGlobalRankingRows(index, players, metric), [index, players, metric])
  const analytics = useMemo(() => scope === 'league' && !teamId ? buildSeasonAnalytics(teams, players, matches, season) : null, [scope, teamId, teams, players, matches, season])
  const movement = useMemo(() => analytics && !teamId ? rankingMovement(analytics.playerSnapshots.get(analytics.currentMatchDay), analytics.playerSnapshots.get(analytics.currentMatchDay - 1), metric) : new Map<string, number | null>(), [analytics, teamId, metric])
  const rowMovement = teamId ? new Map<string, number | null>() : movement
  // League snapshots are unfiltered; do not attach their movement to a scoped rank.
  const visibleRowMovement = screenState.positionFilter !== 'all' ? new Map<string, number | null>() : rowMovement
  const swipe = useMetricSwipe(RANKING_METRICS.map(item => item.value), metric, setMetric)
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players]); const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  const sectionId = 'global-ranking-leaderboard'
  return <div className="px-4 pb-8 pt-6"><button type="button" onClick={onBack} className="mb-3 min-h-9 px-1 text-xs font-semibold text-emerald-400">← Back</button><div id={sectionId} className="mb-3 flex items-center justify-between gap-2"><div><h1 className="text-2xl font-semibold">{rankingTitle(scope, Boolean(teamId))}</h1><p className="text-[10px] text-zinc-500">{season}</p></div><CompetitionScopeSelector value={scope} onChange={setScope} /></div><div className="mb-2 flex flex-wrap justify-end gap-2"><PositionFilter value={screenState.positionFilter} onChange={positionFilter => onStateChange({ ...screenState, positionFilter })} label="Global Ranking position" allLabel="Position" allAccessibilityLabel="All positions" /><TeamFilter value={teamId} teams={teams} onChange={setTeamId} label="Global Ranking team" /></div><RankingMetricTabs label="Global ranking metric" value={metric} onChange={setMetric} options={RANKING_METRICS} />{rows.length > 10 && <FloatingScrollToTop sectionId={sectionId} />}<div {...swipe} className="mt-3 overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe ranking metrics">{rows.map((row, index) => { const player = playerById.get(row.playerId); const team = teamById.get(row.historicalTeamId ?? row.teamId); return <div key={row.playerId} className="border-b border-white/5 last:border-0"><RankingRow rank={index + 1} player={player} team={team} movement={visibleRowMovement.get(row.playerId) ?? null} value={formatRankingMetricValue(metric, row.value)} onClick={() => onNavigate({ name: 'player', id: row.playerId })} /></div>})}{!rows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div></div>
}
