import { Pitch } from '../components/Pitch'
import { MatchTimeline } from '../components/MatchTimeline'
import { formatDate, SubstitutePlayerCard } from '../components/ui'
import { getMatchManOfTheMatch, matchScore, rateMatch } from '../engine/rating'
import { matchCompetitionType } from '../engine/competition'
import { matchStory } from '../engine/matchStory'
import { useStore } from '../store'
import type { Best11Slot, MatchEvent, Player, View } from '../types'

const positionOrder: Record<string, number> = { ST: 0, LST: 0, RST: 0, SS: 0, LW: 1, RW: 1, CAM: 2, LM: 3, RM: 3, LCM: 4, CM: 4, RCM: 4, LDM: 5, CDM: 5, RDM: 5, LB: 6, RB: 6, CB: 7, LCB: 7, RCB: 7, GK: 8 }
const statsFor = (events: MatchEvent[], id: string) => ({ goals: events.filter(e => e.type === 'goal' && !e.ownGoal && e.playerId === id).length, assists: events.filter(e => e.type === 'goal' && !e.ownGoal && e.assistPlayerId === id).length })

export function MatchDetailScreen({ matchId, onNavigate }: { matchId: string; onNavigate: (view: View) => void }) {
  const { teams, players, matches, deleteMatch } = useStore()
  const match = matches.find(item => item.id === matchId)
  if (!match) return <div className="p-6 text-sm text-zinc-400">Match not found.</div>
  const teamId = match.teamId ?? (teams.some(team => team.id === match.homeTeamId) ? match.homeTeamId : match.awayTeamId)
  const team = teams.find(item => item.id === teamId)
  const opponent = match.opponentName ?? teams.find(item => item.id === (match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId))?.shortName ?? 'OPP'
  const score = matchScore(match); const isHome = match.homeTeamId === teamId; const ours = isHome ? score.home : score.away; const theirs = isHome ? score.away : score.home
  const byId = Object.fromEntries(players.map(player => [player.id, player])) as Record<string, Player>
  const ratings = Object.fromEntries(rateMatch(match, players).map(rating => [rating.playerId, rating]))
  const story = matchStory(match, players)
  const starters = match.appearances.filter(appearance => appearance.teamId === teamId && appearance.role === 'starter')
  const bench = match.appearances.filter(appearance => appearance.teamId === teamId && appearance.role === 'bench').sort((a, b) => (positionOrder[a.position] ?? 99) - (positionOrder[b.position] ?? 99))
  const substitutions = match.events.filter((event): event is Extract<MatchEvent, { type: 'sub' }> => event.type === 'sub' && event.teamId === teamId)
  const outMinutesByPlayer = Object.fromEntries(substitutions.map(event => [event.playerOutId, event.minute]))
  const slots: Best11Slot[] = starters.map((appearance, index) => ({ slot: appearance.matchPosition ?? `slot-${index}`, position: appearance.position, matchPosition: appearance.matchPosition, playerId: appearance.playerId, teamId: appearance.teamId, avgRating: ratings[appearance.playerId]?.rating ?? 0, matches: ratings[appearance.playerId] ? 1 : 0 }))
  const card = (id: string, position: string) => {
    const player = byId[id]; if (!player) return null
    const on = substitutions.find(event => event.playerInId === id); const off = substitutions.find(event => event.playerOutId === id)
    return <SubstitutePlayerCard key={id} player={player} team={team} position={position} rating={on ? ratings[id]?.raw : undefined} stats={statsFor(match.events, id)} inMinute={on?.minute} outMinute={off?.minute} onClick={() => onNavigate({ name: 'player', id })} />
  }
  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={() => onNavigate({ name: 'home' })} className="mb-3 text-xs font-semibold text-emerald-400">Back</button>
    <p className="text-xs text-zinc-400">{match.season} · {matchCompetitionType(match).toUpperCase()} · {match.competitionStage ?? 'regular'} · MD {match.matchDay} · {formatDate(match.date)}</p>
    <h1 className="mb-4 text-2xl font-semibold">{team?.shortName} {ours}-{theirs} {opponent}</h1>
    <section className="mb-5"><h2 className="mb-2 text-sm font-semibold">Timeline</h2><MatchTimeline events={match.events} players={players} teamId={teamId} match={match} /></section>
    {(story.tags.length > 0 || story.scoreFlow.length > 1) && <section className="mb-5 rounded-2xl bg-zinc-900 p-3"><h2 className="text-sm font-semibold">Match Story</h2>{story.scoreFlow.length > 1 && <p className="mt-2 text-sm font-black text-zinc-200">{story.scoreFlow.map(item => `${item.home}-${item.away}`).join(' → ')}</p>}<div className="mt-2 flex flex-wrap gap-1.5">{story.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300">{tag}</span>)}</div>{story.superSubs.slice(0, 2).map(row => <p key={row.playerId} className="mt-2 text-xs text-zinc-300"><b>{byId[row.playerId]?.displayName ?? byId[row.playerId]?.name}</b> entered {row.entryMinute}' · Super Sub · {row.goals}G {row.assists}A · {row.scoreAtEntry.home}-{row.scoreAtEntry.away} → {row.finalScore.home}-{row.finalScore.away}</p>)}</section>}
    <h2 className="mb-2 text-sm font-semibold">Starting XI</h2>
    <Pitch slots={slots} players={players} teams={teams} statsByPlayer={Object.fromEntries(starters.map(appearance => [appearance.playerId, statsFor(match.events, appearance.playerId)]))} motmPlayerId={getMatchManOfTheMatch(match, players)} outMinutesByPlayer={outMinutesByPlayer} />
    <h2 className="mb-2 mt-6 text-sm font-semibold">Bench / Substitutes</h2><div className="grid grid-cols-4 gap-2">{bench.map(appearance => card(appearance.playerId, appearance.position))}</div>
    <button type="button" onClick={() => onNavigate({ name: 'team', id: teamId })} className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-xs font-black text-black">BACK TO TEAM</button>
    <button type="button" onClick={() => { deleteMatch(match.id); onNavigate({ name: 'home' }) }} className="mt-3 w-full rounded-xl border border-red-500/30 py-2 text-xs font-semibold text-red-400">Delete match</button>
  </div>
}
