import { useMemo, useState } from 'react'
import { CompetitionScopeSelector, type CompetitionScope } from '../components/CompetitionScopeSelector'
import { RankingMetricTabs, RankingRow, useMetricSwipe } from '../components/RankingRow'
import { RANKING_METRICS, formatRankingMetricValue } from '../lib/rankingMetrics'
import { matchCompetitionType } from '../engine/competition'
import { buildGlobalRankingData, rankGlobalRankingRows, type LeaderboardMetric } from '../engine/stats'
import { buildSeasonAnalytics, rankingMovement } from '../engine/seasonAnalytics'
import { useStore } from '../store'
import type { View } from '../types'

export function GlobalRankingScreen({ season, initialMetric = 'rating', initialScope = 'all', teamId, onNavigate, onBack }: { season: string; initialMetric?: LeaderboardMetric; initialScope?: CompetitionScope; teamId?: string; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches } = useStore()
  const [metric, setMetric] = useState<LeaderboardMetric>(initialMetric)
  const [scope, setScope] = useState<CompetitionScope>(initialScope)
  const scopedMatches = useMemo(() => matches.filter(match => match.season === season && (scope === 'all' || matchCompetitionType(match) === scope)), [matches, season, scope])
  const index = useMemo(() => buildGlobalRankingData(players, scopedMatches, { seasons: [season], teams: teamId ? [teamId] : [], positions: [] }, 'rating'), [players, scopedMatches, season, teamId])
  const rows = useMemo(() => rankGlobalRankingRows(index, players, metric), [index, players, metric])
  const analytics = useMemo(() => scope === 'league' ? buildSeasonAnalytics(teams, players, matches, season) : null, [scope, teams, players, matches, season])
  const movement = useMemo(() => analytics ? rankingMovement(analytics.playerSnapshots.get(analytics.currentMatchDay), analytics.playerSnapshots.get(analytics.currentMatchDay - 1), metric) : new Map<string, number | null>(), [analytics, metric])
  const swipe = useMetricSwipe(RANKING_METRICS.map(item => item.value), metric, setMetric)
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players]); const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  return <div className="px-4 pb-8 pt-6"><button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button><div className="mb-3 flex items-center justify-between gap-2"><div><h1 className="text-2xl font-semibold">{teamId ? 'Team Player Ranking' : 'Global Ranking'}</h1><p className="text-[10px] text-zinc-500">{season}</p></div><CompetitionScopeSelector value={scope} onChange={setScope} /></div><RankingMetricTabs label="Global ranking metric" value={metric} onChange={setMetric} options={RANKING_METRICS} /><div {...swipe} className="mt-3 overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe ranking metrics">{rows.map((row, index) => { const player = playerById.get(row.playerId); const team = teamById.get(row.historicalTeamId ?? row.teamId); return <div key={row.playerId} className="border-b border-white/5 last:border-0"><RankingRow rank={index + 1} player={player} team={team} movement={movement.get(row.playerId) ?? null} value={formatRankingMetricValue(metric, row.value)} onClick={() => onNavigate({ name: 'player', id: row.playerId })} /></div>})}{!rows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div></div>
}
