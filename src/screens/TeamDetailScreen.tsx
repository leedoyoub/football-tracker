import { useMemo, useState } from 'react'
import { recentMatches } from './recentMatches'
import { Pitch } from '../components/Pitch'
import { TeamIcon } from '../components/TeamIcon'
import { formatDate, playerFullName, playerFullName as playerDisplayName, SubstitutePlayerCard } from '../components/ui'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { matchScore } from '../engine/rating'
import { buildGlobalRankingData, rankGlobalRankingRows, playerSeasonStats, seasonsFromMatches, teamBestEleven, type LeaderboardMetric } from '../engine/stats'
import { standingForTeam } from '../engine/standings'
import { leagueCompetition, matchCompetitionType } from '../engine/competition'
import { useStore } from '../store'
import { sortPlayersByPosition } from '../lib/positionOrder'
import type { CompetitionType, View } from '../types'

export function TeamDetailScreen({ teamId, season, onNavigate, onBack }: { teamId: string; season: string; onNavigate: (view: View) => void; onBack: () => void }) {
  const { teams, players, matches } = useStore()
  const [expandedContext, setExpandedContext] = useState<string | null>(null)
  const [bestSeason, setBestSeason] = useState(season)
  const [bestCompetition, setBestCompetition] = useState<CompetitionType | 'all'>('all')
  const team = teams.find((item) => item.id === teamId)
  const seasons = seasonsFromMatches(matches)
  const activeSeason = seasons.includes(season) ? season : seasons[0] ?? season
  const selectedBestSeason = seasons.includes(bestSeason) ? bestSeason : activeSeason
  if (!team) return <div className="p-6 text-sm text-zinc-400">Team not found.</div>

  const best = teamBestEleven(players, matches, teamId, activeSeason)
  const standing = standingForTeam(leagueCompetition(teams, matches, activeSeason, players).standings, teamId)
  const statsByPlayer = Object.fromEntries(players.filter((player) => (player.teamIds ?? [player.teamId]).includes(teamId)).map((player) => {
    const stats = playerSeasonStats(player, players, matches, activeSeason, teamId)
    return [player.id, { goals: stats.goals, assists: stats.assists, avgRating: stats.avgRating, matches: stats.matches }]
  }))
  
  best.slots.forEach(slot => {
    if (slot.playerId) {
      const stats = statsByPlayer[slot.playerId]
      if (stats) { slot.avgRating = stats.avgRating; slot.matches = stats.matches }
    }
  })

  const recent = recentMatches(matches.filter((match) => match.season === activeSeason && (match.homeTeamId === teamId || match.awayTeamId === teamId)))
  const context = JSON.stringify([teamId, activeSeason])
  const showAll = expandedContext === context
  const visibleMatches = showAll ? recent : recent.slice(0, 5)
  const starterIds = new Set(best.slots.flatMap(slot => slot.playerId ? [slot.playerId] : []))
  const allTeamPlayers = sortPlayersByPosition(players.filter((player) => (player.teamIds ?? [player.teamId]).includes(teamId)), [])
  const record = recent.reduce((acc, match) => {
    const score = matchScore(match)
    const won = match.homeTeamId === teamId ? score.home > score.away : score.away > score.home
    const drawn = score.home === score.away
    if (won) acc.wins += 1
    else if (drawn) acc.draws += 1
    else acc.losses += 1
    acc.for += match.homeTeamId === teamId ? score.home : score.away
    acc.against += match.homeTeamId === teamId ? score.away : score.home
    return acc
  }, { wins: 0, draws: 0, losses: 0, for: 0, against: 0 })

  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button>
    <header className="mb-5 flex items-center gap-3">
      <TeamIcon team={team} className="h-12 w-12 text-sm font-black">{team.shortName}</TeamIcon>
      <div><h1 className="text-xl font-bold">{team.name}</h1><p className="text-[10px] uppercase tracking-widest text-zinc-500">{activeSeason} · Season stats</p></div>
      <div className="ml-auto"><button type="button" onClick={() => onNavigate({ name: 'new-match', teamId, season: activeSeason })} className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-bold text-black">Log match</button></div>
    </header>
    <section aria-label="Roster management" className="mb-5 rounded-xl border border-white/10 bg-zinc-900 p-3"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Roster management</h2><p className="mt-0.5 text-[11px] text-zinc-400">Import official squad and player photos</p></div><button type="button" onClick={() => onNavigate({ name: 'import-squad', teamId })} className="shrink-0 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">Import Squad</button></div></section>
    <div className="mb-5 grid grid-cols-4 gap-2 text-center">
      {[['Position', standing ? `${standing.rank}${standing.rank === 1 ? 'st' : standing.rank === 2 ? 'nd' : standing.rank === 3 ? 'rd' : 'th'}` : '—'], ['Matches', recent.length], ['W-D-L', `${record.wins}-${record.draws}-${record.losses}`], ['Pts', standing?.points ?? 0]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{value}</div><div className="text-[9px] uppercase text-zinc-500">{label}</div></div>)}
    </div>
    <TeamBestPlayers teamId={teamId} selectedSeason={selectedBestSeason} competition={bestCompetition} seasons={seasons.length ? seasons : [activeSeason]} players={players} matches={matches} onSeason={setBestSeason} onCompetition={setBestCompetition} onPlayer={id => onNavigate({ name: 'player', id })} />
    <div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Starting XI</h2><p className="text-xs text-zinc-400">Latest match kickoff XI · {best.formation ?? 'Saved formation unavailable'}</p></div><span className="text-[10px] text-zinc-500">Season Avg</span></div>
    {best.match && best.slots.length ? <Pitch slots={best.slots} players={players} teams={teams} statsByPlayer={statsByPlayer} showPositionBadge={false} onSlotClick={(slot) => { if (slot.playerId) onNavigate({ name: 'player', id: slot.playerId }) }} /> : <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-500">No match data yet</div>}
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">Roster</h2>
      {allTeamPlayers.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {allTeamPlayers.filter(player => !starterIds.has(player.id)).map((player) => {
            const stats = statsByPlayer[player.id]
            return (
              <SubstitutePlayerCard
                key={player.id}
                player={player}
                team={team}
                rating={stats?.matches === 0 ? undefined : stats?.avgRating}
                position={player.position}
                stats={{ goals: stats?.goals ?? 0, assists: stats?.assists ?? 0 }}
                onClick={() => onNavigate({ name: 'player', id: player.id })}
              />
            )
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No players in squad.</p>
      )}
    </section>

    <section className="mt-6"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Recent matches</h2>{recent.length > 5 && <button type="button" aria-expanded={showAll} onClick={() => setExpandedContext(showAll ? null : context)} className="secondary-view-all">{showAll ? 'Show Less' : 'View All'}</button>}</div>{visibleMatches.map((match) => { const score = matchScore(match); const home = teams.find((item) => item.id === match.homeTeamId); const away = teams.find((item) => item.id === match.awayTeamId); return <button key={match.id} type="button" onClick={() => onNavigate({ name: 'match', id: match.id })} className="mb-2 flex w-full items-center justify-between rounded-xl bg-zinc-900 px-3 py-3 text-left"><span className="text-[10px] text-zinc-500">MD{match.matchDay}</span><span className="text-sm font-bold">{home?.shortName} {score.home}–{score.away} {away?.shortName}</span><span className="text-[10px] text-zinc-500">{formatDate(match.date)}</span></button> })}</section>
  </div>
}

const BEST_METRICS: { id: LeaderboardMetric; title: string }[] = [
  { id: 'rating', title: 'Avg Rating' }, { id: 'goals', title: 'Goals' }, { id: 'assists', title: 'Assists' }, { id: 'g+a', title: 'G+A' }, { id: 'minutes', title: 'Minutes' }, { id: 'mom', title: 'MOM' }, { id: 'cleanSheets', title: 'Clean Sheets' }, { id: 'saves', title: 'Saves' }, { id: 'sotAllowed', title: 'SOT Allowed' }, { id: 'savePercentage', title: 'Save %' },
]
const competitionLabel = (value: CompetitionType | 'all') => value === 'all' ? 'All Competitions' : value === 'league' ? 'League' : value === 'cup' ? 'Cup' : 'Champions'
const metricValue = (metric: LeaderboardMetric, value: number) => `${value.toFixed(metric === 'rating' || metric === 'sotAllowed' ? 2 : metric === 'savePercentage' ? 1 : 0)}${metric === 'savePercentage' ? '%' : ''}`
function scopedTeamRanking(players: Parameters<typeof buildGlobalRankingData>[0], matches: Parameters<typeof buildGlobalRankingData>[1], teamId: string, season: string, competition: CompetitionType | 'all') { return buildGlobalRankingData(players, competition === 'all' ? matches : matches.filter(match => matchCompetitionType(match) === competition), { seasons: [season], teams: [teamId], positions: [] }, 'rating') }

function TeamBestPlayers({ teamId, selectedSeason, competition, seasons, players, matches, onSeason, onCompetition, onPlayer }: { teamId: string; selectedSeason: string; competition: CompetitionType | 'all'; seasons: string[]; players: Parameters<typeof buildGlobalRankingData>[0]; matches: Parameters<typeof buildGlobalRankingData>[1]; onSeason: (season: string) => void; onCompetition: (competition: CompetitionType | 'all') => void; onPlayer: (id: string) => void }) {
  const index = useMemo(() => scopedTeamRanking(players, matches, teamId, selectedSeason, competition), [players, matches, teamId, selectedSeason, competition])
  const byId = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const [allMetric, setAllMetric] = useState<LeaderboardMetric | null>(null)
  const allRows = allMetric ? rankGlobalRankingRows(index, players, allMetric) : []
  const title = BEST_METRICS.find(metric => metric.id === allMetric)?.title
  return <><section className="mb-6"><h2 className="mb-3 text-lg font-semibold">Best Players</h2><div className="mb-3 grid grid-cols-2 gap-2"><select aria-label="Best Players season" value={selectedSeason} onChange={event => onSeason(event.target.value)} className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold">{seasons.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Best Players competition" value={competition} onChange={event => onCompetition(event.target.value as CompetitionType | 'all')} className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold">{(['all', 'league', 'cup', 'champions'] as const).map(item => <option key={item} value={item}>{competitionLabel(item)}</option>)}</select></div><div className="no-scrollbar -mr-4 flex snap-x gap-3 overflow-x-auto pb-1 pr-4">{BEST_METRICS.map(metric => <BestPlayerCard key={metric.id} metric={metric} rows={rankGlobalRankingRows(index, players, metric.id).slice(0, 3)} byId={byId} onPlayer={onPlayer} onViewAll={setAllMetric} />)}</div></section>{allMetric && <div role="dialog" aria-modal="true" aria-label={`${title} ranking`} className="fixed inset-0 z-50 flex items-end bg-black/80"><div className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-zinc-900 p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold">{title}</h2><p className="text-xs text-zinc-400">{selectedSeason} · {competitionLabel(competition)}</p></div><button type="button" onClick={() => setAllMetric(null)} className="text-xs text-emerald-300">Close</button></div>{allRows.length ? allRows.map((row, index) => { const player = byId.get(row.playerId); return player ? <button key={row.playerId} type="button" onClick={() => onPlayer(player.id)} className="flex w-full items-center gap-3 border-t border-white/10 py-3 text-left"><span className="w-5 text-xs text-zinc-500">{index + 1}</span><PlayerAvatar photoUrl={player.photoUrl || player.image} number={player.number} className="h-9 w-9 text-[10px]" /><span className="min-w-0 flex-1 truncate text-sm">{playerDisplayName(player)}</span><b>{metricValue(allMetric, row.value)}</b></button> : null }) : <p className="py-8 text-center text-sm text-zinc-500">No qualifying players.</p>}</div></div>}</>
}

function BestPlayerCard({ metric, rows, byId, onPlayer, onViewAll }: { metric: { id: LeaderboardMetric; title: string }; rows: ReturnType<typeof rankGlobalRankingRows>; byId: Map<string, Parameters<typeof buildGlobalRankingData>[0][number]>; onPlayer: (id: string) => void; onViewAll: (metric: LeaderboardMetric) => void }) { const first = rows[0] && byId.get(rows[0].playerId); return <article className="w-[82%] shrink-0 snap-start rounded-2xl border border-white/10 bg-zinc-900 p-3"><h3 className="text-xs font-black uppercase tracking-wide text-zinc-400">{metric.title}</h3>{first && rows[0] ? <><button type="button" onClick={() => onPlayer(first.id)} className="mt-3 flex w-full items-center gap-3 text-left"><PlayerAvatar photoUrl={first.photoUrl || first.image} number={first.number} className="h-12 w-12 text-xs" /><span className="min-w-0 flex-1"><b className="block truncate text-sm">{playerFullName(first)}</b><strong className="text-2xl text-emerald-300">{metricValue(metric.id, rows[0].value)}</strong></span></button><div className="mt-3 divide-y divide-white/5">{rows.slice(1).map((row, index) => { const player = byId.get(row.playerId); return player ? <button key={row.playerId} type="button" onClick={() => onPlayer(player.id)} className="flex w-full items-center gap-2 py-2 text-left text-xs"><span className="w-4 text-zinc-500">{index + 2}</span><span className="min-w-0 flex-1 truncate">{playerFullName(player)}</span><b>{metricValue(metric.id, row.value)}</b></button> : null })}</div><button type="button" onClick={() => onViewAll(metric.id)} className="secondary-view-all mt-3 w-full">View All</button></> : <p className="py-8 text-center text-xs text-zinc-500">No qualifying players.</p>}</article> }
