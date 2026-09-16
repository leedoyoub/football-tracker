import { useEffect, useMemo, useState } from 'react'
import { recentMatches } from './recentMatches'
import { Pitch } from '../components/Pitch'
import { TeamIcon } from '../components/TeamIcon'
import { formatDate, playerFullName, SubstitutePlayerCard } from '../components/ui'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { matchScore } from '../engine/rating'
import { buildGlobalRankingData, rankGlobalRankingRows, playerSeasonStats, seasonsFromMatches, teamBestEleven } from '../engine/stats'
import { matchCompetitionType, teamCompetitionOverview } from '../engine/competition'
import { buildSeasonAnalytics } from '../engine/seasonAnalytics'
import { RankDelta, SegmentedControl } from '../components/SeasonUI'
import { useStore } from '../store'
import { sortPlayersByPosition } from '../lib/positionOrder'
import type { CompetitionType, View } from '../types'

const teamTabMemory = new Map<string, 'overview' | 'matches' | 'players' | 'stats'>()

export function TeamDetailScreen({ teamId, season, onNavigate, onBack }: { teamId: string; season: string; onNavigate: (view: View) => void; onBack: () => void }) {
  const { teams, players, matches, competitionStates = [] } = useStore()
  const [expandedContext, setExpandedContext] = useState<string | null>(null)
  const [bestSeason, setBestSeason] = useState(season)
  const [bestCompetition, setBestCompetition] = useState<CompetitionType | 'all'>('all')
  const [tab, setTab] = useState<'overview' | 'matches' | 'players' | 'stats'>(() => teamTabMemory.get(`${teamId}:${season}`) ?? 'overview')
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

  const recent = recentMatches(matches.filter((match) => match.season === activeSeason && (match.homeTeamId === teamId || match.awayTeamId === teamId)))
  const context = JSON.stringify([teamId, activeSeason])
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
    <SegmentedControl sticky label="Team detail section" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'matches', label: 'Matches' }, { value: 'players', label: 'Players' }, { value: 'stats', label: 'Stats' }]} />
    {tab === 'overview' && <section aria-label="Roster management" className="mt-4 mb-4 flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2"><div><h2 className="text-xs font-semibold">Roster management</h2><p className="text-[9px] text-zinc-500">Squad and photos</p></div><button type="button" onClick={() => onNavigate({ name: 'import-squad', teamId })} className="min-h-10 rounded-lg bg-zinc-800 px-3 text-xs font-bold text-emerald-300">Import Squad</button></section>}
    {tab === 'players' && <section aria-label="Roster management" className="mt-4 mb-5 rounded-xl border border-white/10 bg-zinc-900 p-3"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Roster management</h2><p className="mt-0.5 text-[11px] text-zinc-400">Import official squad and player photos</p></div><button type="button" onClick={() => onNavigate({ name: 'import-squad', teamId })} className="shrink-0 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">Import Squad</button></div></section>}
    {(tab === 'overview' || tab === 'stats') && <><div className="mt-4 mb-5 grid grid-cols-4 gap-2 text-center">
      {[['Rank', <span key="rank" className="flex items-center justify-center">{overview.league.rank ? `#${overview.league.rank}` : '—'} <RankDelta value={leagueRow?.movement ?? null} /></span>], ['W-D-L', `${overview.league.wins}-${overview.league.draws}-${overview.league.losses}`], ['GF-GA', `${overview.league.goalsFor}-${overview.league.goalsAgainst}`], ['Pts', overview.league.points]].map(([label, value]) => <div key={String(label)} className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{value}</div><div className="text-[9px] uppercase text-zinc-500">{label}</div></div>)}
    </div><div className="mb-2 grid grid-cols-4 gap-2 text-center"><div className="col-span-3 min-w-0 rounded-xl bg-zinc-900 px-2 py-2"><div className="truncate text-sm font-black">{overview.champions.status}</div><div className="text-[9px] uppercase text-zinc-500">Champions</div></div><div className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{overview.champions.goalsFor}-{overview.champions.goalsAgainst}</div><div className="text-[9px] uppercase text-zinc-500">GF-GA</div></div></div><div className="mb-5 grid grid-cols-4 gap-2 text-center"><div className="col-span-3 min-w-0 rounded-xl bg-zinc-900 px-2 py-2"><div className="truncate text-sm font-black">{overview.cup.status}</div><div className="text-[9px] uppercase text-zinc-500">Cup</div></div><div className="min-w-0 rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{overview.cup.goalsFor}-{overview.cup.goalsAgainst}</div><div className="text-[9px] uppercase text-zinc-500">GF-GA</div></div></div></>}
    {tab === 'overview' && <><TeamBestPlayers teamId={teamId} selectedSeason={selectedBestSeason} competition={bestCompetition} seasons={seasons.length ? seasons : [activeSeason]} players={players} matches={matches} onSeason={setBestSeason} onCompetition={setBestCompetition} onPlayer={id => onNavigate({ name: 'player', id })} /><div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Latest Lineup</h2><p className="text-xs text-zinc-400">Kickoff XI · {best.formation ?? 'Saved formation unavailable'}</p></div><span className="text-[10px] text-zinc-500">Season Avg</span></div>{best.match && best.slots.length ? <Pitch slots={best.slots} players={players} teams={teams} statsByPlayer={statsByPlayer} showPositionBadge={false} presentation="history" onSlotClick={(slot) => { if (slot.playerId) onNavigate({ name: 'player', id: slot.playerId }) }} /> : <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-500">No match data yet</div>}</>}
    {tab === 'players' && <section className="mt-6">
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
    </section>}

    {(tab === 'overview' || tab === 'matches') && <section className="mt-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Recent matches</h2>{recent.length > 5 && <button type="button" aria-expanded={showAll} onClick={() => tab === 'overview' ? setTab('matches') : setExpandedContext(showAll ? null : context)} className="secondary-view-all">{tab === 'overview' ? 'View All' : showAll ? 'Show Less' : 'View All'}</button>}</div>{(tab === 'overview' ? recent.slice(0, 5) : visibleMatches).map((match) => { const score = matchScore(match); const home = teams.find((item) => item.id === match.homeTeamId); const away = teams.find((item) => item.id === match.awayTeamId); return <button key={match.id} type="button" onClick={() => onNavigate({ name: 'match', id: match.id })} className="mb-2 flex min-h-12 w-full items-center justify-between rounded-xl bg-zinc-900 px-3 py-3 text-left"><span className="text-[10px] text-zinc-500">MD{match.matchDay}</span><span className="text-sm font-bold">{home?.shortName} {score.home}–{score.away} {away?.shortName}</span><span className="text-[10px] text-zinc-500">{formatDate(match.date)}</span></button> })}{!visibleMatches.length && <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No matches in this scope.</p>}</section>}
  </div>
}

const competitionLabel = (value: CompetitionType | 'all') => value === 'all' ? 'All Competitions' : value === 'league' ? 'League' : value === 'cup' ? 'Cup' : 'Champions'
function scopedTeamRanking(players: Parameters<typeof buildGlobalRankingData>[0], matches: Parameters<typeof buildGlobalRankingData>[1], teamId: string, season: string, competition: CompetitionType | 'all') { return buildGlobalRankingData(players, competition === 'all' ? matches : matches.filter(match => matchCompetitionType(match) === competition), { seasons: [season], teams: [teamId], positions: [] }, 'rating') }

function TeamBestPlayers({ teamId, selectedSeason, competition, seasons, players, matches, onSeason, onCompetition, onPlayer }: { teamId: string; selectedSeason: string; competition: CompetitionType | 'all'; seasons: string[]; players: Parameters<typeof buildGlobalRankingData>[0]; matches: Parameters<typeof buildGlobalRankingData>[1]; onSeason: (season: string) => void; onCompetition: (competition: CompetitionType | 'all') => void; onPlayer: (id: string) => void }) {
  const index = useMemo(() => scopedTeamRanking(players, matches, teamId, selectedSeason, competition), [players, matches, teamId, selectedSeason, competition])
  const byId = useMemo(() => new Map(players.map(player => [player.id, player])), [players])
  const rated = rankGlobalRankingRows(index, players, 'rating').slice(0, 3)
  const scorer = rankGlobalRankingRows(index, players, 'goals')[0]
  const assister = rankGlobalRankingRows(index, players, 'assists')[0]
  const card = (label: string, row: typeof scorer, value: string, rank?: number) => { const player = row && byId.get(row.playerId); return <button key={`${label}:${rank ?? 0}`} type="button" disabled={!player} onClick={() => player && onPlayer(player.id)} className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-left disabled:opacity-50"><span className="w-7 text-[9px] font-black uppercase text-zinc-500">{rank ? `#${rank}` : label}</span><PlayerAvatar photoUrl={player?.photoUrl || player?.image} number={player?.number} className="h-9 w-9 text-[9px]" /><span className="min-w-0 flex-1"><small className="block text-[8px] font-black uppercase text-zinc-500">{rank ? 'Top Rated' : label}</small><b className="block truncate text-xs">{player ? playerFullName(player) : 'No qualifying player'}</b></span><strong className="text-sm text-emerald-300">{value}</strong></button> }
  return <section className="mb-6"><h2 className="mb-3 text-lg font-semibold">Best Players</h2><div className="mb-3 grid grid-cols-2 gap-2"><select aria-label="Best Players season" value={selectedSeason} onChange={event => onSeason(event.target.value)} className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold">{seasons.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Best Players competition" value={competition} onChange={event => onCompetition(event.target.value as CompetitionType | 'all')} className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold">{(['all', 'league', 'cup', 'champions'] as const).map(item => <option key={item} value={item}>{competitionLabel(item)}</option>)}</select></div><div className="space-y-2">{rated.map((row, index) => card('Top Rated', row, row.avgRating.toFixed(2), index + 1))}{card('Top Scorer', scorer, scorer ? `${scorer.goals} G` : '—')}{card('Top Assister', assister, assister ? `${assister.assists} A` : '—')}</div></section>
}
