import { useEffect, useMemo, useState } from 'react'
import { recentMatches } from './recentMatches'
import { Pitch } from '../components/Pitch'
import { TeamIcon } from '../components/TeamIcon'
import { formatDate, SubstitutePlayerCard } from '../components/ui'
import { RankingMetricTabs, RankingRow, useMetricSwipe } from '../components/RankingRow'
import { RANKING_METRICS, formatRankingMetricValue } from '../lib/rankingMetrics'
import { matchScore } from '../engine/rating'
import { buildGlobalRankingData, rankGlobalRankingRows, playerSeasonStats, seasonsFromMatches, teamBestEleven, type LeaderboardMetric } from '../engine/stats'
import { matchCompetitionType, teamCompetitionOverview } from '../engine/competition'
import { assignmentSnapshotForMatch, formatCompactCompetitionContext } from '../engine/competitionContext'
import { buildSeasonAnalytics } from '../engine/seasonAnalytics'
import { RankDelta, SegmentedControl } from '../components/SeasonUI'
import { CompetitionScopeSelector } from '../components/CompetitionScopeSelector'
import { useStore } from '../store'
import { sortPlayersByPosition } from '../lib/positionOrder'
import type { CompetitionType, Team, View } from '../types'

const teamTabMemory = new Map<string, 'overview' | 'matches' | 'players' | 'stats'>()

export function TeamDetailScreen({ teamId, season, onNavigate, onBack }: { teamId: string; season: string; onNavigate: (view: View) => void; onBack: () => void }) {
  const { teams, players, matches, competitionStates = [] } = useStore()
  const [expandedContext, setExpandedContext] = useState<string | null>(null)
  const [bestSeason, setBestSeason] = useState(season)
  const [bestCompetition, setBestCompetition] = useState<CompetitionType | 'all'>('all')
  const [matchesCompetition, setMatchesCompetition] = useState<CompetitionType | 'all'>('all')
  const [tab, setTab] = useState<'overview' | 'matches' | 'players'>(() => { const saved = teamTabMemory.get(`${teamId}:${season}`); return saved === 'stats' ? 'overview' : saved ?? 'overview' })
  useEffect(() => { teamTabMemory.set(`${teamId}:${season}`, tab) }, [teamId, season, tab])
  const team = teams.find((item) => item.id === teamId)
  const seasons = seasonsFromMatches(matches)
  const activeSeason = seasons.includes(season) ? season : seasons[0] ?? season
  const selectedBestSeason = seasons.includes(bestSeason) ? bestSeason : activeSeason
  const overview = useMemo(() => teamCompetitionOverview(teamId, teams, matches, activeSeason, players, competitionStates), [teamId, teams, matches, activeSeason, players, competitionStates])
  const analytics = useMemo(() => buildSeasonAnalytics(teams, players, matches, activeSeason), [teams, players, matches, activeSeason])
  if (!team) return <div className="p-6 text-sm text-zinc-400">Team not found.</div>

  const best = teamBestEleven(players, matches, teamId, activeSeason)
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

  const recent = recentMatches(matches.filter((match) => match.season === activeSeason && (matchesCompetition === 'all' || matchCompetitionType(match) === matchesCompetition) && (match.homeTeamId === teamId || match.awayTeamId === teamId)))
  const context = JSON.stringify([teamId, activeSeason, matchesCompetition])
  const showAll = expandedContext === context
  const visibleMatches = showAll ? recent : recent.slice(0, 5)
  const starterIds = new Set(best.slots.flatMap(slot => slot.playerId ? [slot.playerId] : []))
  const allTeamPlayers = sortPlayersByPosition(players.filter((player) => (player.teamIds ?? [player.teamId]).includes(teamId)), [])
  const leagueRow = analytics.leagueSnapshots.get(analytics.currentMatchDay)?.standings.find(row => row.teamId === teamId)
  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button>
    <header className="mb-5 flex items-center gap-3">
      <TeamIcon team={team} className="h-12 w-12 text-sm font-black">{team.shortName}</TeamIcon>
      <div><h1 className="text-xl font-bold">{team.name}</h1><p className="text-[10px] uppercase tracking-widest text-zinc-500">{activeSeason} · Season stats</p></div>
      <div className="ml-auto"><button type="button" onClick={() => onNavigate({ name: 'new-match', teamId, season: activeSeason })} className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-bold text-black">Log match</button></div>
    </header>
    <SegmentedControl sticky label="Team detail section" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'matches', label: 'Matches' }, { value: 'players', label: 'Players' }]} />
    {tab === 'players' && <section aria-label="Roster management" className="mt-4 mb-5 rounded-xl border border-white/10 bg-zinc-900 p-3"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Roster management</h2><p className="mt-0.5 text-[11px] text-zinc-400">Import official squad and player photos</p></div><button type="button" onClick={() => onNavigate({ name: 'import-squad', teamId })} className="shrink-0 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">Import Squad</button></div></section>}
    {tab === 'overview' && <><div className="mt-4 mb-5 grid grid-cols-4 gap-2 text-center">
      {[['Rank', <span key="rank" className="flex items-center justify-center">{overview.league.rank ? `#${overview.league.rank}` : '—'} <RankDelta value={leagueRow?.movement ?? null} /></span>], ['W-D-L', `${overview.league.wins}-${overview.league.draws}-${overview.league.losses}`], ['GF-GA', `${overview.league.goalsFor}-${overview.league.goalsAgainst}`], ['Pts', overview.league.points]].map(([label, value]) => <div key={String(label)} className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{value}</div><div className="text-[9px] uppercase text-zinc-500">{label}</div></div>)}
    </div><div className="mb-2 grid grid-cols-4 gap-2 text-center"><div className="col-span-3 min-w-0 rounded-xl bg-zinc-900 px-2 py-2"><div className="truncate text-sm font-black">{overview.champions.status}</div><div className="text-[9px] uppercase text-zinc-500">Champions</div></div><div className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{overview.champions.goalsFor}-{overview.champions.goalsAgainst}</div><div className="text-[9px] uppercase text-zinc-500">GF-GA</div></div></div><div className="mb-5 grid grid-cols-4 gap-2 text-center"><div className="col-span-3 min-w-0 rounded-xl bg-zinc-900 px-2 py-2"><div className="truncate text-sm font-black">{overview.cup.status}</div><div className="text-[9px] uppercase text-zinc-500">Cup</div></div><div className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{overview.cup.goalsFor}-{overview.cup.goalsAgainst}</div><div className="text-[9px] uppercase text-zinc-500">GF-GA</div></div></div></>}
    {tab === 'overview' && <TeamBestPlayers team={team} teamId={teamId} selectedSeason={selectedBestSeason} competition={bestCompetition} seasons={seasons.length ? seasons : [activeSeason]} players={players} matches={matches} onSeason={setBestSeason} onCompetition={setBestCompetition} onPlayer={id => onNavigate({ name: 'player', id })} onViewAll={(metric) => onNavigate({ name: 'global-ranking', season: selectedBestSeason, competitionType: bestCompetition, rankingMetric: metric, teamId })} />}
    {tab === 'players' && <><section className="mt-6"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Latest XI</h2><p className="text-xs text-zinc-400">Kickoff XI · {best.formation ?? 'Saved formation unavailable'}</p></div></div>{best.match && best.slots.length ? <Pitch slots={best.slots} players={players} teams={teams} statsByPlayer={statsByPlayer} showPositionBadge={false} presentation="history" onSlotClick={(slot) => { if (slot.playerId) onNavigate({ name: 'player', id: slot.playerId }) }} /> : <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-500">No match data yet</div>}</section><section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold">Bench</h2><p className="mb-2 text-[10px] text-zinc-500">Not in Latest XI</p>
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
    </section></>}

    {tab === 'matches' && <section className="mt-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Matches</h2><CompetitionScopeSelector value={matchesCompetition} onChange={value => setMatchesCompetition(value)} /></div>{recent.length > 5 && <button type="button" aria-expanded={showAll} onClick={() => setExpandedContext(showAll ? null : context)} className="secondary-view-all mb-2">{showAll ? 'Show Less' : 'View All'}</button>}{visibleMatches.map((match) => { const score = matchScore(match); const home = teams.find((item) => item.id === match.homeTeamId); const away = teams.find((item) => item.id === match.awayTeamId); return <button key={match.id} type="button" onClick={() => onNavigate({ name: 'match', id: match.id })} className="mb-2 flex min-h-12 w-full items-center justify-between rounded-xl bg-zinc-900 px-3 py-3 text-left"><span className="text-[10px] text-zinc-500">{formatCompactCompetitionContext(assignmentSnapshotForMatch(match))}</span><span className="text-sm font-bold">{home?.shortName} {score.home}–{score.away} {away?.shortName}</span><span className="text-[10px] text-zinc-500">{formatDate(match.date)}</span></button> })}{!visibleMatches.length && <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No matches in this scope.</p>}</section>}
  </div>
}

function scopedTeamRanking(players: Parameters<typeof buildGlobalRankingData>[0], matches: Parameters<typeof buildGlobalRankingData>[1], teamId: string, season: string, competition: CompetitionType | 'all') { return buildGlobalRankingData(players, competition === 'all' ? matches : matches.filter(match => matchCompetitionType(match) === competition), { seasons: [season], teams: [teamId], positions: [] }, 'rating') }

function TeamBestPlayers({ team, teamId, selectedSeason, competition, seasons, players, matches, onSeason, onCompetition, onPlayer, onViewAll }: { team: Team; teamId: string; selectedSeason: string; competition: CompetitionType | 'all'; seasons: string[]; players: Parameters<typeof buildGlobalRankingData>[0]; matches: Parameters<typeof buildGlobalRankingData>[1]; onSeason: (season: string) => void; onCompetition: (competition: CompetitionType | 'all') => void; onPlayer: (id: string) => void; onViewAll: (metric: LeaderboardMetric) => void }) {
  const [metric, setMetric] = useState<LeaderboardMetric>('rating')
  const index = useMemo(() => scopedTeamRanking(players, matches, teamId, selectedSeason, competition), [players, matches, teamId, selectedSeason, competition])
  const byId = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const rows = rankGlobalRankingRows(index, players, metric).slice(0, 5)
  const swipe = useMetricSwipe(RANKING_METRICS.map(item => item.value), metric, setMetric)
  return <section className="mb-6"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Best Players</h2><CompetitionScopeSelector value={competition} onChange={onCompetition} /></div><div className="mb-3"><select aria-label="Best Players season" value={selectedSeason} onChange={event => onSeason(event.target.value)} className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold">{seasons.map(item => <option key={item}>{item}</option>)}</select></div><RankingMetricTabs label="Best Players category" value={metric} onChange={setMetric} options={RANKING_METRICS} /><div {...swipe} className="mt-2 overflow-hidden rounded-xl bg-zinc-900 touch-pan-y" aria-label="Swipe Team Best Player metrics">{rows.map((row, index) => { const player = byId.get(row.playerId); return <div key={row.playerId} className="border-b border-white/5 last:border-0"><RankingRow rank={index + 1} player={player} team={team} value={formatRankingMetricValue(metric, row.value)} onClick={() => player && onPlayer(player.id)} /></div> })}{!rows.length && <p className="p-3 text-xs text-zinc-500">No qualifying players yet.</p>}</div><button type="button" onClick={() => onViewAll(metric)} className="secondary-view-all mt-3 w-full">View All</button></section>
}
