import { useMemo } from 'react'
import { APP_VERSION } from '../config'
import { PlayerIcon } from '../components/PlayerIcon'
import { ResultCard } from '../components/ResultCard'
import { playerFullName } from '../components/ui'
import { championsCompetition, cupCompetition, leagueCompetition } from '../engine/competition'
import { formatPlayStyleAverage, formatPlayStylePercentage, opponentPlayStylePerformance } from '../engine/playStyleStats'
import { homeMilestoneNews } from '../engine/news'
import { buildGlobalRankingData } from '../engine/stats'
import { currentStaticTeams } from '../data/teams'
import { derivedResults } from '../lib/results'
import { useStore } from '../store'
import type { CompetitionType, View } from '../types'

export function HomeScreen({ season, onNavigate }: { season: string; onSeason?: (season: string) => void; onNavigate: (view: View) => void }) {
  const { players, teams, matches, competitionStates = [] } = useStore()
  const tournamentTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const draw = competitionStates.find(state => state.id === `champions:${season}`)
  const league = useMemo(() => leagueCompetition(teams, matches, season), [teams, matches, season])
  const cup = useMemo(() => cupCompetition(tournamentTeams, matches, season, players), [tournamentTeams, matches, season, players])
  const champions = useMemo(() => championsCompetition(draw, matches, season, players), [draw, matches, season, players])
  const recent = useMemo(() => derivedResults(matches, teams).slice(0, 5), [matches, teams])
  const news = useMemo(() => homeMilestoneNews(players, teams, matches, competitionStates), [players, teams, matches, competitionStates])
  const playStylePerformance = useMemo(() => opponentPlayStylePerformance(matches, teams), [matches, teams])
  const seasonStats = useMemo(() => buildGlobalRankingData(players, matches.filter(match => match.season === season), { seasons: [season], teams: [], positions: [] }, 'rating'), [players, matches, season])
  const leaders = useMemo(() => {
    const eligible = seasonStats.filter(row => row.matches > 0)
    return [
      { label: 'Top Scorer', rows: eligible.slice().sort((a, b) => b.goals - a.goals || b.avgRating - a.avgRating).slice(0, 5), value: (row: typeof eligible[number]) => `${row.goals} G` },
      { label: 'Top Assists', rows: eligible.slice().sort((a, b) => b.assists - a.assists || b.avgRating - a.avgRating).slice(0, 5), value: (row: typeof eligible[number]) => `${row.assists} A` },
      { label: 'Best Rated', rows: eligible.slice().sort((a, b) => b.avgRating - a.avgRating || b.matches - a.matches).slice(0, 5), value: (row: typeof eligible[number]) => row.avgRating.toFixed(2) },
    ]
  }, [seasonStats])
  const playerById = Object.fromEntries(players.map(player => [player.id, player]))
  const teamById = Object.fromEntries(teams.map(team => [team.id, team]))
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

    <section className="mb-6" data-home-section="season-leaders"><h2 className="mb-2 text-lg font-semibold">Season Leaders</h2><div className="grid grid-cols-3 gap-2">{leaders.map(item => { const row = item.rows[0]; const player = row ? playerById[row.playerId] : undefined; const team = row ? teamById[row.historicalTeamId ?? row.teamId] : undefined; return <button key={item.label} type="button" disabled={!player} onClick={() => player && onNavigate({ name: 'player', id: player.id })} className="rounded-xl bg-zinc-900 p-2 text-center disabled:opacity-50"><PlayerIcon player={player} team={team} className="mx-auto h-10 w-10 text-[8px]" /><small className="mt-1 block text-[9px] uppercase text-zinc-500">{item.label}</small><b className="mt-1 block truncate text-[10px]">{player ? playerFullName(player) : '—'}</b><span className="text-xs font-black text-emerald-300">{row ? item.value(row) : '—'}</span>{item.rows.slice(1).map((next, index) => <span key={next.playerId} className="mt-1 flex justify-between text-[8px] text-zinc-400"><b>{index + 2}</b><span className="truncate px-1">{playerFullName(playerById[next.playerId])}</span><b>{item.value(next)}</b></span>)}</button> })}</div></section>

    <section data-home-section="play-style-performance" className="mt-6"><h2 className="mb-2 text-lg font-semibold">Performance by Play Style</h2><div className="space-y-2">{playStylePerformance.map(row => <article key={row.style} className="rounded-xl bg-zinc-900 p-3 text-xs"><b className="block truncate text-sm">{row.label}</b><div className="mt-3 grid grid-cols-3 gap-2 text-center"><span className="text-emerald-400"><b className="block text-sm">W {formatPlayStylePercentage(row.winPercentage)}</b><small className="text-emerald-400/75">Wins</small></span><span className="text-yellow-300"><b className="block text-sm">D {formatPlayStylePercentage(row.drawPercentage)}</b><small className="text-yellow-300/75">Draws</small></span><span className="text-red-400"><b className="block text-sm">L {formatPlayStylePercentage(row.lossPercentage)}</b><small className="text-red-400/75">Losses</small></span></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-center text-zinc-400"><span><b className="block text-sm text-zinc-100">GF {formatPlayStyleAverage(row.averageGoalsFor)}</b><small>Goals / Match</small></span><span><b className="block text-sm text-zinc-100">GA {formatPlayStyleAverage(row.averageGoalsAgainst)}</b><small>Conceded / Match</small></span></div></article>)}</div></section>
    <section data-home-section="account" className="mt-6 rounded-2xl border border-white/5 bg-zinc-900 p-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Account</h2><p className="text-[10px] text-zinc-500">Session, backup and data management</p></div><button type="button" onClick={() => onNavigate({ name: 'data-management' })} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-emerald-300">Manage</button></div><footer className="mt-4 border-t border-white/5 pt-3 text-center text-[10px] text-zinc-600">Football Tracker · v{APP_VERSION}</footer></section>
  </div>
}

function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">{text}</p> }
