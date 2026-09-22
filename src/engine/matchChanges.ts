import type { CompetitionState, Match, Player, Team } from '../types'
import { deriveFootballEvents } from './news'
import { oldestMatches } from './matchChronology'
import { buildPlayerRecordLeaderboards } from './playerRecords'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { buildGlobalRankingData, rankGlobalRankingRows, type LeaderboardMetric } from './stats'

export type GroupedMatchChange = { id: string; playerId?: string; title: string; detail: string; eventIds: string[] }

const EMPTY_STATES: CompetitionState[] = []
const cache = new WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], WeakMap<CompetitionState[], Map<string, GroupedMatchChange[]>>>>>()
const rankingCache = new WeakMap<Match[], WeakMap<Player[], { revision: number; events: RankingChange[] }>>()

type RankingChange = { id: string; matchId: string; playerId: string; label: string }
const CORE_METRICS: LeaderboardMetric[] = ['rating', 'goals', 'assists', 'g+a', 'mom']

function participants(match: Match) {
  return new Set(match.appearances.filter(appearance => appearance.role === 'starter' || match.events.some(event => event.type === 'sub' && event.playerInId === appearance.playerId)).map(appearance => appearance.playerId))
}

function ranks(rows: { playerId: string }[]) {
  return new Map(rows.map((row, index) => [row.playerId, index + 1]))
}

function transitionLabel(before: Map<string, number>, after: Map<string, number>, playerId: string, metric: string) {
  // A leaderboard cannot have a movement story until it has a prior snapshot.
  // In particular, the first recorded match is a baseline, not a #1 takeover.
  if (!before.size) return undefined
  const previous = before.get(playerId) ?? Number.POSITIVE_INFINITY
  const next = after.get(playerId) ?? Number.POSITIVE_INFINITY
  if (next > 10) return undefined
  const priorLeader = [...before.entries()].find(([, rank]) => rank === 1)?.[0]
  if (next === 1 && priorLeader && priorLeader !== playerId) return `takes #1 in ${metric}`
  if (previous > 10) return `enters the Top 10 in ${metric} at #${next}`
  if (next < previous) return `climbs ${previous - next} place${previous - next === 1 ? '' : 's'} to #${next} in ${metric}`
  return undefined
}

function addRankingChanges(target: RankingChange[], identity: string, matchId: string, participantIds: Set<string>, beforeRows: { playerId: string }[], afterRows: { playerId: string }[], label: string) {
  const before = ranks(beforeRows); const after = ranks(afterRows)
  for (const playerId of participantIds) {
    const change = transitionLabel(before, after, playerId, label)
    if (change) target.push({ id: `ranking:${identity}:${playerId}`, matchId, playerId, label: change })
  }
}

/** Build deterministic before/after transition rows once from canonical chronology. */
function rankingChanges(players: Player[], matches: Match[]): RankingChange[] {
  const chronological = oldestMatches(matches)
  const result: RankingChange[] = []
  for (let index = 0; index < chronological.length; index++) {
    const match = chronological[index]
    const beforeMatches = chronological.slice(0, index)
    const afterMatches = chronological.slice(0, index + 1)
    const participantIds = participants(match)
    for (const metric of CORE_METRICS) {
      const before = rankGlobalRankingRows(buildGlobalRankingData(players, beforeMatches, { seasons: [], teams: [], positions: [] }, 'rating'), players, metric)
      const after = rankGlobalRankingRows(buildGlobalRankingData(players, afterMatches, { seasons: [], teams: [], positions: [] }, 'rating'), players, metric)
      addRankingChanges(result, `core:global:${metric}`, match.id, participantIds, before, after, metric === 'g+a' ? 'G+A' : metric === 'mom' ? 'MOM' : metric === 'rating' ? 'Rating' : metric[0].toUpperCase() + metric.slice(1))
    }
    for (const teamId of new Set(match.appearances.filter(appearance => participantIds.has(appearance.playerId)).map(appearance => appearance.teamId))) {
      const teamParticipantIds = new Set(match.appearances
        .filter(appearance => appearance.teamId === teamId && participantIds.has(appearance.playerId))
        .map(appearance => appearance.playerId))
      for (const metric of CORE_METRICS) {
        const before = rankGlobalRankingRows(buildGlobalRankingData(players, beforeMatches, { seasons: [], teams: [teamId], positions: [] }, 'rating'), players, metric)
        const after = rankGlobalRankingRows(buildGlobalRankingData(players, afterMatches, { seasons: [], teams: [teamId], positions: [] }, 'rating'), players, metric)
        addRankingChanges(result, `core:team:${teamId}:${metric}`, match.id, teamParticipantIds, before, after, metric === 'g+a' ? 'Team G+A' : `Team ${metric === 'mom' ? 'MOM' : metric[0].toUpperCase() + metric.slice(1)}`)
      }
    }
    const beforeRecords = new Map(buildPlayerRecordLeaderboards(players, beforeMatches).map(group => [group.id, group.rows]))
    for (const group of buildPlayerRecordLeaderboards(players, afterMatches)) {
      if (group.id === 'goals' || group.id === 'assists' || group.id === 'mom') continue
      addRankingChanges(result, `record:${group.id}`, match.id, participantIds, beforeRecords.get(group.id) ?? [], group.rows, group.title)
    }
  }
  return result
}

function cachedRankingChanges(players: Player[], matches: Match[]) {
  let byPlayers = rankingCache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); rankingCache.set(matches, byPlayers) }
  const cached = byPlayers.get(players)
  if (cached?.revision === RATING_ENGINE_REVISION) return cached.events
  const events = rankingChanges(players, matches)
  byPlayers.set(players, { revision: RATING_ENGINE_REVISION, events })
  return events
}

/** Groups the canonical detailed event projection once per match and collection identity. */
export function matchChangesForMatch(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[] = EMPTY_STATES, matchId: string): GroupedMatchChange[] {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byTeams = byPlayers.get(players); if (!byTeams) { byTeams = new WeakMap(); byPlayers.set(players, byTeams) }
  let byStates = byTeams.get(teams); if (!byStates) { byStates = new WeakMap(); byTeams.set(teams, byStates) }
  let byMatch = byStates.get(states); if (!byMatch) { byMatch = new Map(); byStates.set(states, byMatch) }
  const cached = byMatch.get(matchId); if (cached) return cached
  const groups = new Map<string, GroupedMatchChange>()
  for (const event of deriveFootballEvents(players, teams, matches, states)) {
    if (event.matchId !== matchId || (event.surface !== 'match-change' && event.surface !== 'both')) continue
    const key = event.playerId ? `player:${event.playerId}` : `event:${event.id}`
    const current = groups.get(key)
    if (current) { current.detail = `${current.detail} · ${event.matchChange?.label ?? event.title}`; current.eventIds.push(event.id); continue }
    groups.set(key, { id: `match-change:${matchId}:${key}`, playerId: event.playerId, title: event.playerId ? `${players.find(player => player.id === event.playerId)?.displayName ?? players.find(player => player.id === event.playerId)?.name ?? 'Player'} · Changes` : event.eyebrow, detail: event.matchChange?.label ?? event.title, eventIds: [event.id] })
  }
  for (const event of cachedRankingChanges(players, matches)) {
    if (event.matchId !== matchId) continue
    const key = `player:${event.playerId}`
    const current = groups.get(key)
    if (current) { current.detail = `${current.detail} · ${event.label}`; current.eventIds.push(event.id); continue }
    const player = players.find(item => item.id === event.playerId)
    groups.set(key, { id: `match-change:${matchId}:${key}`, playerId: event.playerId, title: `${player?.displayName ?? player?.name ?? 'Player'} · Changes`, detail: event.label, eventIds: [event.id] })
  }
  const result = [...groups.values()]
  byMatch.set(matchId, result)
  return result
}
