import { useMemo, useState, type ReactNode } from 'react'
import { APP_VERSION } from '../config'
import { PlayerIcon } from '../components/PlayerIcon'
import { TeamIcon } from '../components/TeamIcon'
import { RankDelta, SectionHeader, SegmentedControl } from '../components/SeasonUI'
import { playerFullName } from '../components/ui'
import { homeMilestoneNews } from '../engine/news'
import { buildGlobalRankingData, rankGlobalRankingRows, type LeaderboardMetric } from '../engine/stats'
import { buildSeasonAnalytics } from '../engine/seasonAnalytics'
import { derivedResults } from '../lib/results'
import { useStore } from '../store'
import type { Match, Player, Team, View } from '../types'

const homeLeaderMemory = new WeakMap<Match[], Map<string, LeaderboardMetric>>()
const LEADER_METRICS: { metric: LeaderboardMetric; label: string; value: (row: ReturnType<typeof buildGlobalRankingData>[number]) => string }[] = [
  { metric: 'rating', label: 'Rating', value: row => row.avgRating.toFixed(2) },
  { metric: 'goals', label: 'Goals', value: row => String(row.goals) },
  { metric: 'assists', label: 'Assists', value: row => String(row.assists) },
  { metric: 'mom', label: 'MOM', value: row => String(row.mom) },
]
function rememberedMetric(matches: Match[], season: string) { let values = homeLeaderMemory.get(matches); if (!values) { values = new Map(); homeLeaderMemory.set(matches, values) }; return { values, metric: values.get(season) ?? 'rating' } }

export function HomeScreen({ season, onNavigate }: { season: string; onSeason?: (season: string) => void; onNavigate: (view: View) => void }) {
  const { players, teams, matches, competitionStates = [] } = useStore()
  const remembered = rememberedMetric(matches, season); const [metric, setMetric] = useState<LeaderboardMetric>(remembered.metric)
  const analytics = useMemo(() => buildSeasonAnalytics(teams, players, matches, season), [teams, players, matches, season])
  const recent = useMemo(() => derivedResults(matches, teams).slice(0, 5), [matches, teams])
  const news = useMemo(() => homeMilestoneNews(players, teams, matches, competitionStates).slice(0, 4), [players, teams, matches, competitionStates])
  const seasonMatches = useMemo(() => matches.filter(match => match.season === season), [matches, season])
  const rankingIndex = useMemo(() => buildGlobalRankingData(players, seasonMatches, { seasons: [season], teams: [], positions: [] }, 'rating'), [players, seasonMatches, season])
  const rankings = useMemo(() => new Map(LEADER_METRICS.map(item => [item.metric, rankGlobalRankingRows(rankingIndex, players, item.metric)])), [rankingIndex, players])
  const leaderRows = rankings.get(metric) ?? []; const leaderMetric = LEADER_METRICS.find(item => item.metric === metric) ?? LEADER_METRICS[0]
  const playerById = useMemo(() => Object.fromEntries(players.map(player => [player.id, player])) as Record<string, Player>, [players]); const teamById = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])) as Record<string, Team>, [teams])
  const leader = analytics.leagueSnapshots.get(analytics.currentMatchDay)?.standings[0]
  const selectMetric = (next: string) => { const selected = next as LeaderboardMetric; remembered.values.set(season, selected); setMetric(selected) }
  return <div className="px-4 pb-8 pt-6">
    <header className="mb-5 rounded-2xl border border-white/5 bg-zinc-900 p-3"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-400">Season dashboard</p><div className="mt-1 flex items-baseline justify-between gap-3"><h1 className="text-xl font-semibold">{season}</h1><span className="text-xs text-zinc-400">League MD{analytics.currentMatchDay}/30</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><Snapshot label="Leader" value={leader ? teamById[leader.teamId]?.shortName ?? teamById[leader.teamId]?.name ?? '—' : 'No table yet'} icon={leader ? <TeamIcon team={teamById[leader.teamId]} className="h-5 w-5 text-[7px]" /> : undefined} /><Snapshot label="Rating" value={rankings.get('rating')?.[0] ? playerFullName(playerById[rankings.get('rating')![0].playerId]) : 'No rating yet'} /><Snapshot label="Goals" value={rankings.get('goals')?.[0] ? `${playerFullName(playerById[rankings.get('goals')![0].playerId])} ${rankings.get('goals')![0].goals}` : 'No scorer yet'} /></div></header>
    <section className="mb-6" data-home-section="recent-matches"><SectionHeader title="Recent Matches" action={matches.length > 5 ? <button type="button" onClick={() => onNavigate({ name: 'results' })} className="secondary-view-all">View All</button> : undefined} /><div className="mt-2 space-y-1.5">{recent.length ? recent.map(result => <button key={result.match.id} type="button" onClick={() => onNavigate({ name: 'match', id: result.match.id })} className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-zinc-900 px-3 text-left"><span className={`w-5 text-center text-xs font-black ${result.outcome === 'W' ? 'text-emerald-400' : result.outcome === 'L' ? 'text-red-400' : 'text-yellow-300'}`}>{result.outcome}</span><TeamIcon team={teamById[result.teamId]} className="h-6 w-6 shrink-0 text-[7px]" /><span className="min-w-0 flex-1 truncate text-xs font-bold">{teamById[result.teamId]?.shortName ?? result.teamName} <b className="tabular-nums">{result.goalsFor}–{result.goalsAgainst}</b> {teamById[result.opponentId ?? '']?.shortName ?? result.opponentName}</span><span className="text-[9px] text-zinc-500">{result.match.competitionType === 'champions' ? `Champions · ${result.match.competitionStage ?? ''}` : result.match.competitionType === 'cup' ? `Cup · ${result.match.competitionStage ?? ''}` : `League · MD${result.match.matchDay}`}</span></button>) : <Empty text="No completed matches yet." />}</div></section>
    <section className="mb-6" data-home-section="news"><SectionHeader title="News" action={news.length ? <button type="button" onClick={() => onNavigate({ name: 'season-highlight', season, kind: 'news' })} className="secondary-view-all">View All News</button> : undefined} /><div className="mt-2 space-y-1.5">{news.map(item => <button key={item.id} type="button" disabled={!item.matchId} onClick={() => item.matchId && onNavigate({ name: 'match', id: item.matchId })} className="w-full rounded-xl bg-zinc-900 px-3 py-3 text-left disabled:opacity-70"><p className="text-[9px] font-black uppercase text-emerald-300">{item.emoji} {item.eyebrow}</p><p className="mt-1 text-xs font-bold">{item.title}</p><p className="mt-1 text-[10px] text-zinc-500">{item.context || item.detail}</p></button>)}{!news.length && <Empty text="News will appear as the season develops." />}</div></section>
    <section data-home-section="season-leaders"><SectionHeader title="Season Leaders" subtitle="All Competitions" action={<button type="button" onClick={() => onNavigate({ name: 'competition', season, competitionType: 'league', rankingMetric: metric as 'rating' | 'goals' | 'assists' | 'mom' })} className="secondary-view-all">View All</button>} /><div className="mt-2"><SegmentedControl label="Season leader category" value={metric} onChange={selectMetric} options={LEADER_METRICS.map(item => ({ value: item.metric, label: item.label }))} /></div><div className="mt-2 overflow-hidden rounded-xl bg-zinc-900">{leaderRows.slice(0, 5).map((row, index) => { const player = playerById[row.playerId]; const team = teamById[row.historicalTeamId ?? row.teamId]; return <button key={row.playerId} type="button" disabled={!player} onClick={() => player && onNavigate({ name: 'player', id: player.id })} className="flex min-h-11 w-full items-center gap-2 border-b border-white/5 px-3 py-2 text-left last:border-0 disabled:opacity-50"><b className="w-4 text-xs text-zinc-500">{index + 1}</b><RankDelta value={null} /><PlayerIcon player={player} team={team} className="h-7 w-7 shrink-0 text-[7px]" /><span className="min-w-0 flex-1 truncate text-xs font-bold">{player ? playerFullName(player) : 'Unknown player'}</span><b className="text-xs text-emerald-300">{leaderMetric.value(row)}</b></button>})}{!leaderRows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div></section>
    <footer className="mt-6 text-center text-[10px] text-zinc-600">Football Tracker · v{APP_VERSION} · <button type="button" onClick={() => onNavigate({ name: 'data-management' })} className="underline">Manage data</button></footer>
  </div>
}
function Snapshot({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) { return <div className="min-w-0 rounded-xl bg-black/20 px-2 py-2"><small className="block uppercase text-zinc-500">{label}</small><span className="mt-1 flex min-w-0 items-center gap-1 font-bold">{icon}<b className="truncate">{value}</b></span></div> }
function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">{text}</p> }
