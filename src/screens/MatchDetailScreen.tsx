import { Pitch } from '../components/Pitch'
import { formatDate, playerDisplayName, SubstitutePlayerCard } from '../components/ui'
import { getMatchManOfTheMatch, matchScore, rateMatch } from '../engine/rating'
import { useStore } from '../store'
import type { Best11Slot, MatchEvent, Player, View } from '../types'

const positionOrder: Record<string, number> = { ST: 0, LST: 0, RST: 0, SS: 0, LW: 1, RW: 1, CAM: 2, LM: 3, RM: 3, LCM: 4, CM: 4, RCM: 4, LDM: 5, CDM: 5, RDM: 5, LB: 6, RB: 6, CB: 7, LCB: 7, RCB: 7, GK: 8 }
const statsFor = (events: MatchEvent[], id: string) => ({ goals: events.filter((e) => e.type === 'goal' && !e.ownGoal && e.playerId === id).length, assists: events.filter((e) => e.type === 'goal' && !e.ownGoal && e.assistPlayerId === id).length })

export function MatchDetailScreen({ matchId, onNavigate }: { matchId: string; onNavigate: (view: View) => void }) {
  const { teams, players, matches, deleteMatch } = useStore(); const match = matches.find((m) => m.id === matchId)
  if (!match) return <div className="p-6 text-sm text-zinc-400">Match not found.</div>
  const motmPlayerId = getMatchManOfTheMatch(match, players)

  const teamId = match.teamId ?? (teams.some((t) => t.id === match.homeTeamId) ? match.homeTeamId : match.awayTeamId)
  const team = teams.find((t) => t.id === teamId); const opponent = match.opponentName ?? teams.find((t) => t.id === (match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId))?.shortName ?? 'OPP'
  const score = matchScore(match); const home = match.homeTeamId === teamId; const ourScore = home ? score.home : score.away; const theirScore = home ? score.away : score.home
  const byId = Object.fromEntries(players.map((p) => [p.id, p])) as Record<string, Player>; const ratings = Object.fromEntries(rateMatch(match, players).map((r) => [r.playerId, r]))
  const starters = match.appearances.filter((a) => a.teamId === teamId && a.role === 'starter'); const bench = match.appearances.filter((a) => a.teamId === teamId && a.role === 'bench').sort((a, b) => { const aOn = match.events.find((e) => e.type === 'sub' && e.playerInId === a.playerId); const bOn = match.events.find((e) => e.type === 'sub' && e.playerInId === b.playerId); return aOn && bOn ? (aOn.minute ?? 0) - (bOn.minute ?? 0) || a.playerId.localeCompare(b.playerId) : aOn ? -1 : bOn ? 1 : (positionOrder[a.position] ?? 99) - (positionOrder[b.position] ?? 99) || a.playerId.localeCompare(b.playerId) })
  const slots: Best11Slot[] = starters.map((a, i) => ({ slot: a.matchPosition ?? `slot-${i}`, position: a.position, matchPosition: a.matchPosition, playerId: a.playerId, teamId: a.teamId, avgRating: ratings[a.playerId]?.rating ?? 0, matches: ratings[a.playerId] ? 1 : 0 }))
  const goals = match.events.filter((e): e is Extract<MatchEvent, { type: 'goal' }> => e.type === 'goal'); const ours = goals.filter((e) => (e.teamId === teamId) !== Boolean(e.ownGoal)); const conceded = goals.filter((e) => !ours.includes(e))
  const event = (e: Extract<MatchEvent, { type: 'goal' }>, oursGoal: boolean) => <div key={e.id} className="mb-2 text-[11px]"><b>{e.minute}' {oursGoal ? `Goal: ${e.playerId ? playerDisplayName(byId[e.playerId]) : 'Opponent own goal'}` : 'Goal conceded'}</b>{oursGoal && e.assistPlayerId && <div className="text-zinc-400">Assist: {playerDisplayName(byId[e.assistPlayerId])}</div>}</div>
  const substitutions = match.events.filter((e): e is Extract<MatchEvent, { type: 'sub' }> => e.type === 'sub' && e.teamId === teamId)
  const outMinutesByPlayer = Object.fromEntries(substitutions.map((e) => [e.playerOutId, e.minute]))
  const card = (id: string, position: string) => {
    const player = byId[id]
    if (!player) return null
    const on = substitutions.find((e) => e.playerInId === id)
    const off = substitutions.find((e) => e.playerOutId === id)
    return <SubstitutePlayerCard key={id} player={player} team={team} position={position} rating={on ? ratings[id]?.raw : undefined} stats={statsFor(match.events, id)} inMinute={on?.minute} outMinute={off?.minute} onClick={() => onNavigate({ name: 'player', id })} />
  }
  return <div className="px-4 pb-8 pt-6"><button type="button" onClick={() => onNavigate({ name: 'home' })} className="mb-3 text-xs font-semibold text-emerald-400">Back</button><p className="text-xs text-zinc-400">{match.season} · MD {match.matchDay} · {formatDate(match.date)}</p><h1 className="mb-4 text-2xl font-semibold">{team?.shortName} {ourScore}–{theirScore} {opponent}</h1><section className="mb-5 rounded-2xl bg-zinc-900 p-3"><h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Match events</h2><div className="grid grid-cols-2 gap-3"><div>{(home ? ours : conceded).map((e) => event(e, home))}</div><div className="text-right">{(home ? conceded : ours).map((e) => event(e, !home))}</div></div></section><h2 className="mb-2 text-sm font-semibold">Starting XI</h2><Pitch slots={slots} players={players} teams={teams} statsByPlayer={Object.fromEntries(starters.map((a) => [a.playerId, statsFor(match.events, a.playerId)]))} motmPlayerId={motmPlayerId} outMinutesByPlayer={outMinutesByPlayer} /><h2 className="mb-2 mt-6 text-sm font-semibold">Bench / Substitutes</h2><div className="grid grid-cols-4 gap-2">{bench.map((a) => card(a.playerId, a.position))}</div><button type="button" onClick={() => onNavigate({ name: 'team', id: teamId })} className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-xs font-black text-black">BACK TO TEAM</button><button type="button" onClick={() => { deleteMatch(match.id); onNavigate({ name: 'home' }) }} className="mt-3 w-full rounded-xl border border-red-500/30 py-2 text-xs font-semibold text-red-400">Delete match</button></div>
}
