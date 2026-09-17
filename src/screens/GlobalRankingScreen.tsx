import { useMemo, useState } from 'react'
import { CompetitionScopeSelector, type CompetitionScope } from '../components/CompetitionScopeSelector'
import { PlayerIcon } from '../components/PlayerIcon'
import { SegmentedControl } from '../components/SeasonUI'
import { playerFullName } from '../components/ui'
import { matchCompetitionType } from '../engine/competition'
import { buildGlobalRankingData, rankGlobalRankingRows, type LeaderboardMetric } from '../engine/stats'
import { useStore } from '../store'
import type { View } from '../types'

const metrics: { value: LeaderboardMetric; label: string }[] = [{ value: 'rating', label: 'Rating' }, { value: 'goals', label: 'Goals' }, { value: 'assists', label: 'Assists' }, { value: 'g+a', label: 'G+A' }, { value: 'minutes', label: 'Minutes' }, { value: 'mom', label: 'MOM' }, { value: 'goals/90', label: 'Goals/90' }, { value: 'assists/90', label: 'Assists/90' }, { value: 'g+a/90', label: 'G+A/90' }, { value: 'cleanSheets', label: 'Clean Sheets' }, { value: 'saves', label: 'Saves' }, { value: 'savePercentage', label: 'Save %' }]

export function GlobalRankingScreen({ season, initialMetric = 'rating', initialScope = 'all', teamId, onNavigate, onBack }: { season: string; initialMetric?: LeaderboardMetric; initialScope?: CompetitionScope; teamId?: string; onNavigate: (view: View) => void; onBack: () => void }) {
  const { players, teams, matches } = useStore()
  const [metric, setMetric] = useState<LeaderboardMetric>(initialMetric)
  const [scope, setScope] = useState<CompetitionScope>(initialScope)
  const scopedMatches = useMemo(() => matches.filter(match => match.season === season && (scope === 'all' || matchCompetitionType(match) === scope)), [matches, season, scope])
  const index = useMemo(() => buildGlobalRankingData(players, scopedMatches, { seasons: [season], teams: teamId ? [teamId] : [], positions: [] }, 'rating'), [players, scopedMatches, season, teamId])
  const rows = useMemo(() => rankGlobalRankingRows(index, players, metric), [index, players, metric])
  const playerById = useMemo(() => new Map(players.map(player => [player.id, player])), [players]); const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams])
  return <div className="px-4 pb-8 pt-6"><button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button><div className="mb-3 flex items-center justify-between gap-2"><div><h1 className="text-2xl font-semibold">{teamId ? 'Team Player Ranking' : 'Global Ranking'}</h1><p className="text-[10px] text-zinc-500">{season}</p></div><CompetitionScopeSelector value={scope} onChange={setScope} /></div><SegmentedControl label="Global ranking metric" value={metric} onChange={value => setMetric(value as LeaderboardMetric)} options={metrics.map(item => ({ value: item.value, label: item.label }))} /><div className="mt-3 overflow-hidden rounded-xl bg-zinc-900">{rows.map((row, index) => { const player = playerById.get(row.playerId); const team = teamById.get(row.historicalTeamId ?? row.teamId); return <button key={row.playerId} type="button" onClick={() => onNavigate({ name: 'player', id: row.playerId })} className="flex min-h-12 w-full items-center gap-2 border-b border-white/5 px-3 text-left last:border-0"><b className="w-5 text-xs text-zinc-500">{index + 1}</b><PlayerIcon player={player} team={team} className="h-8 w-8 text-[8px]" /><span className="min-w-0 flex-1 truncate text-xs font-bold">{playerFullName(player)}</span><b className="text-xs text-emerald-300">{row.value.toFixed(metric === 'rating' || metric.includes('/') ? 2 : 0)}{metric === 'savePercentage' ? '%' : ''}</b></button>})}{!rows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div></div>
}
