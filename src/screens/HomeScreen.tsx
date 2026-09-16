import { useMemo, useState } from 'react'
import { APP_VERSION } from '../config'
import { PlayerIcon } from '../components/PlayerIcon'
import { TeamIcon } from '../components/TeamIcon'
import { ResultCard } from '../components/ResultCard'
import { Pitch } from '../components/Pitch'
import { SectionHeader } from '../components/SeasonUI'
import { playerFullName } from '../components/ui'
import { championsCompetition, cupCompetition, leagueCompetition } from '../engine/competition'
import { formatPlayStyleAverage, formatPlayStylePercentage, trackedStyleTeams, trackedTeamPlayStylePerformance } from '../engine/playStyleStats'
import { homeMilestoneNews } from '../engine/news'
import { buildGlobalRankingData, rankGlobalRankingRows, type LeaderboardMetric } from '../engine/stats'
import { buildSeasonAnalytics } from '../engine/seasonAnalytics'
import { currentStaticTeams } from '../data/teams'
import { derivedResults } from '../lib/results'
import { useStore } from '../store'
import type { CompetitionState, CompetitionType, Match, Player, Team, View } from '../types'

type HomeCompetitions = {
  league: ReturnType<typeof leagueCompetition>
  cup: ReturnType<typeof cupCompetition>
  champions: ReturnType<typeof championsCompetition>
}
const homeCompetitionCache = new WeakMap<Match[], WeakMap<Team[], WeakMap<Player[], WeakMap<CompetitionState[], Map<string, HomeCompetitions>>>>>()
const homePresentationMemory = new WeakMap<Match[], Map<string, { counts: Partial<Record<LeaderboardMetric, number>>; collapsed: Record<string, boolean> }>>()
function rememberedHome(matches: Match[], season: string) {
  let seasons = homePresentationMemory.get(matches)
  if (!seasons) { seasons = new Map(); homePresentationMemory.set(matches, seasons) }
  return { seasons, value: seasons.get(season) }
}
export const SEASON_LEADER_PAGE_SIZE = 10
const HOME_LEADERBOARDS: { metric: LeaderboardMetric; label: string; value: (row: ReturnType<typeof buildGlobalRankingData>[number]) => string }[] = [
  { metric: 'goals', label: 'Top Scorer', value: row => `${row.goals} G` },
  { metric: 'assists', label: 'Top Assists', value: row => `${row.assists} A` },
  { metric: 'rating', label: 'Best Rated', value: row => row.avgRating.toFixed(2) },
]

/** Store arrays are immutable snapshots, so this survives a Home remount without
 * serialising raw history and invalidates whenever a relevant snapshot changes. */
function homeCompetitions(teams: Team[], matches: Match[], players: Player[], states: CompetitionState[], season: string): HomeCompetitions {
  let byTeams = homeCompetitionCache.get(matches)
  if (!byTeams) { byTeams = new WeakMap(); homeCompetitionCache.set(matches, byTeams) }
  let byPlayers = byTeams.get(teams)
  if (!byPlayers) { byPlayers = new WeakMap(); byTeams.set(teams, byPlayers) }
  let byStates = byPlayers.get(players)
  if (!byStates) { byStates = new WeakMap(); byPlayers.set(players, byStates) }
  let bySeason = byStates.get(states)
  if (!bySeason) { bySeason = new Map(); byStates.set(states, bySeason) }
  const cached = bySeason.get(season)
  if (cached) return cached
  const draw = states.find(state => state.id === `champions:${season}`)
  const result = {
    league: leagueCompetition(teams, matches, season, players),
    cup: cupCompetition(currentStaticTeams(teams), matches, season, players),
    champions: championsCompetition(draw, matches, season, players),
  }
  bySeason.set(season, result)
  return result
}

export function HomeScreen({ season, onNavigate }: { season: string; onSeason?: (season: string) => void; onNavigate: (view: View) => void }) {
  const { players, teams, matches, competitionStates = [] } = useStore()
  const memory = rememberedHome(matches, season)
  const remembered = memory.value
  const [leaderPresentation, setLeaderPresentation] = useState<{ season: string; counts: Partial<Record<LeaderboardMetric, number>> }>({ season, counts: remembered?.counts ?? {} })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(remembered?.collapsed ?? {})
  const { league, cup, champions } = useMemo(() => homeCompetitions(teams, matches, players, competitionStates, season), [teams, matches, players, competitionStates, season])
  const recent = useMemo(() => derivedResults(matches, teams).slice(0, 5), [matches, teams])
  const news = useMemo(() => homeMilestoneNews(players, teams, matches, competitionStates), [players, teams, matches, competitionStates])
  const playStylePerformance = useMemo(() => trackedTeamPlayStylePerformance(matches, teams), [matches, teams])
  // Keep the Store-owned matches identity so the engine-level ranking cache
  // survives Home remounts; the selector already applies the season scope.
  const seasonStats = useMemo(() => buildGlobalRankingData(players, matches, { seasons: [season], teams: [], positions: [] }, 'rating'), [players, matches, season])
  // Build and order complete canonical lists only when football-data inputs
  // change. Presentation state below merely slices these stable rows.
  const leaders = useMemo(() => HOME_LEADERBOARDS.map(item => ({ ...item, rows: rankGlobalRankingRows(seasonStats, players, item.metric) })), [seasonStats, players])
  const playerById = useMemo(() => Object.fromEntries(players.map(player => [player.id, player])) as Record<string, Player>, [players])
  const teamById = useMemo(() => Object.fromEntries(teams.map(team => [team.id, team])) as Record<string, Team>, [teams])
  const analytics = useMemo(() => buildSeasonAnalytics(teams, players, matches, season), [teams, players, matches, season])
  const toggle = (section: string) => setCollapsed(current => {
    const next = { ...current, [section]: !current[section] }
    memory.seasons.set(season, { counts: leaderPresentation.season === season ? leaderPresentation.counts : {}, collapsed: next })
    return next
  })
  const stageName = (stage: string) => ({ roundOf16: 'Round of 16', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals', final: 'Final', finalReplay: 'Final Replay' } as Record<string, string>)[stage] ?? stage
  const progress: { type: CompetitionType; emoji: string; label: string; value: string }[] = [
    { type: 'league', emoji: '👑', label: 'League', value: league.complete ? 'Completed' : `Matchday ${league.matchdayProgress}` },
    { type: 'cup', emoji: '🥇', label: 'Cup', value: cup.championId ? 'Completed' : `${cup.stage.startsWith('stage') ? `Stage ${cup.stage.replace('stage', '')}` : stageName(cup.stage)} · ${cup.activeTeamIds.length} Teams Remaining` },
    { type: 'champions', emoji: '🏆', label: 'Champions', value: champions.championId ? 'Completed' : champions.drawn ? stageName(champions.currentStage) : champions.drawCount ? `Draw ${champions.drawCount} / 16` : 'Not Started' },
  ]

  return <div className="px-4 pb-8 pt-6">
    <header className="mb-5"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-400">Current-season dashboard</p><h1 className="text-2xl font-semibold">{season}</h1></header>

    <section className="mb-6" data-home-section="competition-progress"><h2 className="mb-2 text-lg font-semibold">Competition Progress</h2><div className="grid grid-cols-3 gap-2">{progress.map(item => <button key={item.type} type="button" onClick={() => onNavigate({ name: 'competition', season, competitionType: item.type })} className="min-h-20 rounded-xl border border-white/5 bg-zinc-900 p-2.5 text-left"><b className="block text-xs"><span aria-hidden="true">{item.emoji}</span> {item.label}</b><span className="mt-2 block text-[10px] leading-tight text-zinc-400">{item.value}</span></button>)}</div></section>

    <section className="mb-6" data-home-section="recent-matches"><div className="mb-2 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Recent Matches</h2><p className="text-xs text-zinc-500">All teams and competitions</p></div>{matches.length > 5 && <button type="button" onClick={() => onNavigate({ name: 'results' })} className="secondary-view-all">View All</button>}</div><div className="space-y-2">{recent.length ? recent.map(result => <ResultCard key={result.match.id} result={result} teams={teams} showCompetition onClick={() => onNavigate({ name: 'match', id: result.match.id })} />) : <Empty text="No completed matches yet." />}</div></section>

    <section className="mb-6" data-home-section="news"><div className="mb-2"><h2 className="text-lg font-semibold">News</h2><p className="text-xs text-zinc-500">Milestones generated from saved football data</p></div><div className="space-y-2">{news.length ? news.map(item => <button key={item.id} type="button" onClick={() => item.matchId && onNavigate({ name: 'match', id: item.matchId })} className="w-full rounded-xl border border-white/5 bg-zinc-900 p-3 text-left"><p className="text-[9px] font-black uppercase tracking-wide text-emerald-400">{item.emoji} {item.eyebrow}</p><p className="mt-1 text-sm font-bold">{item.title}</p><p className="mt-1 text-[10px] text-zinc-500">{item.context}</p></button>) : <Empty text="Milestone news will appear here." />}</div></section>

    <section className="mb-6" data-home-section="monthly-awards"><SectionHeader title="Monthly XI" subtitle="Latest completed three-Matchday League block" />{analytics.latestMonthlyAwards ? <details className="rounded-xl bg-zinc-900 p-3"><summary className="min-h-10 cursor-pointer text-sm font-black">Month {analytics.latestMonthlyAwards.block.id} · MD{analytics.latestMonthlyAwards.block.startMatchDay}–{analytics.latestMonthlyAwards.block.endMatchDay}<span className="mt-1 block text-xs font-normal text-emerald-300">Player of the Month: {playerFullName(playerById[analytics.latestMonthlyAwards.playerOfMonth?.playerId ?? ''])}</span></summary><div className="mt-3"><Pitch slots={analytics.latestMonthlyAwards.bestXI} players={players} teams={teams} statsByPlayer={analytics.latestMonthlyAwards.statsByPlayer} layout="free" showPositionBadge={false} onSlotClick={slot => slot.playerId && onNavigate({ name: 'player', id: slot.playerId })} /></div></details> : <Empty text="No completed Monthly Awards yet." />}</section>

    <section className="mb-6" data-home-section="matchday-review"><SectionHeader title={analytics.latestReview ? `MD${analytics.latestReview.matchDay} Review` : 'Matchday Review'} subtitle="Finalized only after every League team completes the Matchday" />{analytics.latestReview ? <details className="rounded-xl bg-zinc-900 p-3"><summary className="min-h-10 cursor-pointer text-xs font-black text-emerald-300">See what changed</summary><div className="mt-2 grid gap-2 text-xs">{analytics.latestReview.highestRated && <p><span className="text-zinc-500">Highest rated</span> · <b>{playerFullName(playerById[analytics.latestReview.highestRated.playerId])}</b></p>}{analytics.latestReview.biggestWin && <button type="button" onClick={() => onNavigate({ name: 'match', id: analytics.latestReview!.biggestWin!.matchId })} className="text-left"><span className="text-zinc-500">Biggest win</span> · <b>{analytics.latestReview.biggestWin.margin}-goal margin</b></button>}{analytics.latestReview.biggestMover && <p><span className="text-zinc-500">Biggest mover</span> · <b>{teamById[analytics.latestReview.biggestMover.teamId]?.name} ↑{analytics.latestReview.biggestMover.movement}</b></p>}</div></details> : <Empty text="Complete a League Matchday to unlock its review." />}</section>

    <section className="mb-6" data-home-section="season-leaders"><SectionHeader title="Season Leaders" action={<button type="button" aria-expanded={!collapsed.leaders} aria-label={`${collapsed.leaders ? 'Expand' : 'Collapse'} Season Leaders`} onClick={() => toggle('leaders')} className="min-h-11 min-w-11 text-zinc-400">{collapsed.leaders ? '⌄' : '⌃'}</button>} />{!collapsed.leaders && <div className="grid gap-2 sm:grid-cols-3">{leaders.map(item => {
      const visibleCount = leaderPresentation.season === season ? leaderPresentation.counts[item.metric] ?? SEASON_LEADER_PAGE_SIZE : SEASON_LEADER_PAGE_SIZE
      const visibleRows = item.rows.slice(0, visibleCount)
      const showMore = visibleRows.length < item.rows.length
      const showNext = () => setLeaderPresentation(current => {
        const counts = current.season === season ? current.counts : {}
        const next = { season, counts: { ...counts, [item.metric]: Math.min((counts[item.metric] ?? SEASON_LEADER_PAGE_SIZE) + SEASON_LEADER_PAGE_SIZE, item.rows.length) } }
        memory.seasons.set(season, { counts: next.counts, collapsed })
        return next
      })
      return <article key={item.metric} className="rounded-xl bg-zinc-900 p-2"><small className="block text-center text-[9px] uppercase text-zinc-500">{item.label}</small><div className="mt-2 divide-y divide-white/5">{visibleRows.map((row, index) => {
        const player = playerById[row.playerId]; const team = teamById[row.historicalTeamId ?? row.teamId]
        return <button key={row.playerId} type="button" disabled={!player} onClick={() => player && onNavigate({ name: 'player', id: player.id })} className="flex w-full items-center gap-2 py-2 text-left first:pt-0 last:pb-0 disabled:opacity-50"><b className="w-4 text-xs text-zinc-500">{index + 1}</b><PlayerIcon player={player} team={team} className="h-7 w-7 shrink-0 text-[7px]" /><span className="min-w-0 flex-1"><b className="block truncate text-[10px]">{player ? playerFullName(player) : '—'}</b><small className="block truncate text-[9px] text-zinc-500">{team?.shortName ?? team?.name}</small></span><b className="text-xs text-emerald-300">{item.value(row)}</b></button>
      })}{!visibleRows.length && <p className="py-3 text-center text-xs text-zinc-500">No qualifying players yet.</p>}</div>{showMore && <button type="button" onClick={showNext} className="secondary-view-all mt-2 w-full">Show More</button>}</article>
    })}</div>}</section>

    <section data-home-section="play-style-performance" className="mt-6"><SectionHeader title="Performance by Play Style" action={<button type="button" aria-expanded={!collapsed.styles} aria-label={`${collapsed.styles ? 'Expand' : 'Collapse'} Play Style`} onClick={() => toggle('styles')} className="min-h-11 min-w-11 text-zinc-400">{collapsed.styles ? '⌄' : '⌃'}</button>} />{!collapsed.styles && <div className="space-y-2">{playStylePerformance.map(row => <button key={row.style} type="button" onClick={() => onNavigate({ name: 'play-style', style: row.style })} className="w-full rounded-xl bg-zinc-900 p-3 text-left text-xs"><b className="block truncate text-sm">{row.label}</b><div className="mt-2 flex flex-wrap gap-1.5">{trackedStyleTeams(teams, row.style).map(team => <span key={team.id} title={team.name}><TeamIcon team={team} className="h-7 w-7 text-[7px]" /></span>)}</div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><span className="text-emerald-400"><b className="block text-sm">W {formatPlayStylePercentage(row.winPercentage)}</b><small className="text-emerald-400/75">Wins</small></span><span className="text-yellow-300"><b className="block text-sm">D {formatPlayStylePercentage(row.drawPercentage)}</b><small className="text-yellow-300/75">Draws</small></span><span className="text-red-400"><b className="block text-sm">L {formatPlayStylePercentage(row.lossPercentage)}</b><small className="text-red-400/75">Losses</small></span></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-center text-zinc-400"><span><b className="block text-sm text-zinc-100">GF {formatPlayStyleAverage(row.averageGoalsFor)}</b><small>Goals / Match</small></span><span><b className="block text-sm text-zinc-100">GA {formatPlayStyleAverage(row.averageGoalsAgainst)}</b><small>Conceded / Match</small></span></div></button>)}</div>}</section>
    <section data-home-section="account" className="mt-6 rounded-2xl border border-white/5 bg-zinc-900 p-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Account</h2><p className="text-[10px] text-zinc-500">Session, backup and data management</p></div><button type="button" onClick={() => onNavigate({ name: 'data-management' })} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-emerald-300">Manage</button></div><footer className="mt-4 border-t border-white/5 pt-3 text-center text-[10px] text-zinc-600">Football Tracker · v{APP_VERSION}</footer></section>
  </div>
}

function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">{text}</p> }
