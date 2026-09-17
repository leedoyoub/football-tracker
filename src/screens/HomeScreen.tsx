import { useMemo, useState, type ReactNode } from 'react'
import { APP_VERSION } from '../config'
import { TeamIcon } from '../components/TeamIcon'
import { SectionHeader, SegmentedControl } from '../components/SeasonUI'
import { RankingRow, useMetricSwipe } from '../components/RankingRow'
import { homeMilestoneNews } from '../engine/news'
import { buildGlobalRankingData, rankGlobalRankingRows, type LeaderboardMetric } from '../engine/stats'
import { championsCompetition, cupCompetition, leagueCompetition } from '../engine/competition'
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
  const recent = useMemo(() => derivedResults(matches, teams).slice(0, 5), [matches, teams])
  const news = useMemo(() => homeMilestoneNews(players, teams, matches, competitionStates).slice(0, 4), [players, teams, matches, competitionStates])
  const seasonMatches = useMemo(() => matches.filter(match => match.season === season), [matches, season])
  const rankingIndex = useMemo(() => buildGlobalRankingData(players, seasonMatches, { seasons: [season], teams: [], positions: [] }, 'rating'), [players, seasonMatches, season])
  const rankings = useMemo(() => new Map(LEADER_METRICS.map(item => [item.metric, rankGlobalRankingRows(rankingIndex, players, item.metric)])), [rankingIndex, players])
  const leaderRows = rankings.get(metric) ?? []; const leaderMetric = LEADER_METRICS.find(item => item.metric === metric) ?? LEADER_METRICS[0]
  const playerById = useMemo(() => Object.fromEntries(players.map(player => [player.id, player])) as Record<string, Player>, [players]); const teamById = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])) as Record<string, Team>, [teams])
  const league = useMemo(() => leagueCompetition(teams, matches, season, players), [teams, matches, season, players])
  const cup = useMemo(() => cupCompetition(teams, matches, season, players), [teams, matches, season, players])
  const champions = useMemo(() => championsCompetition(competitionStates.find(state => state.id === `champions:${season}`), matches, season, players), [competitionStates, matches, season, players])
  const selectMetric = (next: string) => { const selected = next as LeaderboardMetric; remembered.values.set(season, selected); setMetric(selected) }
  const leaderSwipe = useMetricSwipe(LEADER_METRICS.map(item => item.metric), metric, selectMetric)
  return <div className="px-4 pb-8 pt-6">
    <header className="mb-5 rounded-2xl border border-white/5 bg-zinc-900 p-3"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-400">Season dashboard</p><div className="mt-1 flex items-baseline justify-between gap-3"><h1 className="text-xl font-semibold">{season}</h1><span className="text-xs text-zinc-400">Competition progress</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><Snapshot label="League" value={league.complete ? 'Completed · 30/30' : `MD${league.matchdayProgress}/30`} /><Snapshot label="Cup" value={cup.championId ? 'Completed' : cup.stage === 'final' ? 'Final' : `Stage ${cup.stage.replace('stage', '')}`} /><Snapshot label="Champions" value={champions.championId ? 'Completed' : champions.drawn ? champions.currentStage.replace(/([A-Z])/g, ' $1') : 'Not started'} /></div></header>
    <section className="mb-6" data-home-section="recent-matches"><SectionHeader title="Recent Matches" action={matches.length > 5 ? <button type="button" onClick={() => onNavigate({ name: 'results' })} className="secondary-view-all">View All</button> : undefined} /><div className="mt-2 grid grid-cols-5 gap-1.5" aria-label="Latest five recent matches">{recent.length ? recent.map(result => { const competition = result.match.competitionType === 'champions' ? 'UCL' : result.match.competitionType === 'cup' ? 'CUP' : 'LGE'; const tone = result.outcome === 'W' ? 'border-emerald-400/30 bg-emerald-500/10' : result.outcome === 'L' ? 'border-red-400/30 bg-red-500/10' : 'border-white/10 bg-zinc-900'; return <button key={result.match.id} type="button" onClick={() => onNavigate({ name: 'match', id: result.match.id })} aria-label={`${competition}, ${result.outcome === 'W' ? 'win' : result.outcome === 'L' ? 'loss' : 'draw'}, ${result.goalsFor} to ${result.goalsAgainst}`} className={`flex min-h-20 min-w-0 flex-col items-center justify-between rounded-xl border px-1 py-2 text-center ${tone}`}><span className="text-[8px] font-black tracking-wide text-zinc-400">{competition}</span><TeamIcon team={teamById[result.teamId]} className="h-7 w-7 text-[7px]" /><b className="text-xs tabular-nums">{result.goalsFor}–{result.goalsAgainst}</b></button> }) : <div className="col-span-5"><Empty text="No completed matches yet." /></div>}</div></section>
    <section className="mb-6" data-home-section="news"><SectionHeader title="News" action={news.length ? <button type="button" onClick={() => onNavigate({ name: 'season-highlight', season, kind: 'news' })} className="secondary-view-all">View All News</button> : undefined} /><div className="mt-2 space-y-1.5">{news.map(item => <button key={item.id} type="button" disabled={!item.matchId} onClick={() => item.matchId && onNavigate({ name: 'match', id: item.matchId })} className="w-full rounded-xl bg-zinc-900 px-3 py-3 text-left disabled:opacity-70"><p className="text-[9px] font-black uppercase text-emerald-300">{item.emoji} {item.eyebrow}</p><p className="mt-1 text-xs font-bold">{item.title}</p><p className="mt-1 text-[10px] text-zinc-500">{item.context || item.detail}</p></button>)}{!news.length && <Empty text="News will appear as the season develops." />}</div></section>
    <section data-home-section="season-leaders"><SectionHeader title="Season Leaders" subtitle="All Competitions" action={<button type="button" onClick={() => onNavigate({ name: 'global-ranking', season, competitionType: 'all', rankingMetric: metric })} className="secondary-view-all">View All</button>} /><div className="mt-2"><SegmentedControl label="Season leader category" value={metric} onChange={selectMetric} options={LEADER_METRICS.map(item => ({ value: item.metric, label: item.label }))} /></div><div {...leaderSwipe} className="mt-2 overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe Season Leader metrics">{leaderRows.slice(0, 5).map((row, index) => { const player = playerById[row.playerId]; const team = teamById[row.historicalTeamId ?? row.teamId]; return <div key={row.playerId} className="border-b border-white/5 last:border-0"><RankingRow rank={index + 1} compact player={player} team={team} value={leaderMetric.value(row)} onClick={() => player && onNavigate({ name: 'player', id: player.id })} /></div>})}{!leaderRows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div></section>
    <footer className="mt-6 text-center text-[10px] text-zinc-600">Football Tracker · v{APP_VERSION} · <button type="button" onClick={() => onNavigate({ name: 'data-management' })} className="underline">Manage data</button></footer>
  </div>
}
function Snapshot({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) { return <div className="min-w-0 rounded-xl bg-black/20 px-2 py-2"><small className="block uppercase text-zinc-500">{label}</small><span className="mt-1 flex min-w-0 items-center gap-1 font-bold">{icon}<b className="truncate">{value}</b></span></div> }
function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">{text}</p> }
