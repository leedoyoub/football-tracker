import type { CompetitionState, Match, MatchChangePayload, Player, Team } from '../types'
import { deriveFootballEvents } from './news'
import { oldestMatches } from './matchChronology'
import { buildPlayerRecordLeaderboards } from './playerRecords'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { buildGlobalRankingData, rankGlobalRankingRows, type LeaderboardMetric } from './stats'
import { matchCompetitionType } from './competitionContext'

export type GroupedMatchChangeItem = { id: string; label: string; kind: MatchChangePayload['kind'] }
export type GroupedMatchChange = { id: string; playerId?: string; title: string; detail: string; eventIds: string[]; items: GroupedMatchChangeItem[] }

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

/** A rank movement is meaningful only inside the visible cutoff of its surface. */
export function rankingTransitionLabel(before: Map<string, number>, after: Map<string, number>, playerId: string, metric: string, topLimit: number, scope: string) {
  // A leaderboard cannot have a movement story until it has a prior snapshot.
  // In particular, the first recorded match is a baseline, not a #1 takeover.
  if (!before.size) return undefined
  const previous = before.get(playerId) ?? Number.POSITIVE_INFINITY
  const next = after.get(playerId) ?? Number.POSITIVE_INFINITY
  if (next > topLimit) return undefined
  const priorLeader = [...before.entries()].find(([, rank]) => rank === 1)?.[0]
  const context = ` · ${scope}`
  if (next === 1 && priorLeader && priorLeader !== playerId) return `takes #1 in ${metric}${context}`
  if (previous > topLimit) return `enters the Top ${topLimit} in ${metric} at #${next}${context}`
  if (next < previous) return `climbs ${previous - next} place${previous - next === 1 ? '' : 's'} to #${next} in ${metric}${context}`
  return undefined
}

function addRankingChanges(target: RankingChange[], identity: string, matchId: string, participantIds: Set<string>, beforeRows: { playerId: string }[], afterRows: { playerId: string }[], label: string, topLimit: number, scope: string) {
  const before = ranks(beforeRows); const after = ranks(afterRows)
  for (const playerId of participantIds) {
    const change = rankingTransitionLabel(before, after, playerId, label, topLimit, scope)
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
      const label = metric === 'g+a' ? 'G+A' : metric === 'mom' ? 'MOM' : metric === 'rating' ? 'Rating' : metric[0].toUpperCase() + metric.slice(1)
      addRankingChanges(result, `core:global:${metric}`, match.id, participantIds, before, after, label, 10, 'Global')

      // Competition tables are independent Top 10 surfaces. They must be
      // rebuilt from the same chronological prefix, never inferred from the
      // global table or the display matchDay.
      const type = matchCompetitionType(match)
      const competitionBefore = beforeMatches.filter(item => matchCompetitionType(item) === type)
      const competitionAfter = afterMatches.filter(item => matchCompetitionType(item) === type)
      const beforeCompetitionRows = rankGlobalRankingRows(buildGlobalRankingData(players, competitionBefore, { seasons: [], teams: [], positions: [] }, 'rating'), players, metric)
      const afterCompetitionRows = rankGlobalRankingRows(buildGlobalRankingData(players, competitionAfter, { seasons: [], teams: [], positions: [] }, 'rating'), players, metric)
      const competitionLabel = type === 'league' ? 'League' : type === 'cup' ? 'Cup' : 'Champions'
      addRankingChanges(result, `competition:${type}:${metric}`, match.id, participantIds, beforeCompetitionRows, afterCompetitionRows, label, 10, competitionLabel)
    }
    for (const teamId of new Set(match.appearances.filter(appearance => participantIds.has(appearance.playerId)).map(appearance => appearance.teamId))) {
      const teamParticipantIds = new Set(match.appearances
        .filter(appearance => appearance.teamId === teamId && participantIds.has(appearance.playerId))
        .map(appearance => appearance.playerId))
      for (const metric of CORE_METRICS) {
        const before = rankGlobalRankingRows(buildGlobalRankingData(players, beforeMatches, { seasons: [], teams: [teamId], positions: [] }, 'rating'), players, metric)
        const after = rankGlobalRankingRows(buildGlobalRankingData(players, afterMatches, { seasons: [], teams: [teamId], positions: [] }, 'rating'), players, metric)
        addRankingChanges(result, `core:team:${teamId}:${metric}`, match.id, teamParticipantIds, before, after, metric === 'g+a' ? 'G+A' : metric === 'mom' ? 'MOM' : metric === 'rating' ? 'Rating' : metric[0].toUpperCase() + metric.slice(1), 3, 'Team')
      }
    }
    const beforeRecords = new Map(buildPlayerRecordLeaderboards(players, beforeMatches).map(group => [group.id, group.rows]))
    for (const group of buildPlayerRecordLeaderboards(players, afterMatches)) {
      if (group.id === 'goals' || group.id === 'assists' || group.id === 'mom') continue
      addRankingChanges(result, `record:${group.id}`, match.id, participantIds, beforeRecords.get(group.id) ?? [], group.rows, group.title, 10, 'Record')
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
    const item = { id: event.id, label: event.matchChange?.label ?? event.title, kind: event.matchChange?.kind ?? 'milestone' as MatchChangePayload['kind'] }
    if (current) { current.detail = `${current.detail} · ${item.label}`; current.eventIds.push(item.id); current.items.push(item); continue }
    groups.set(key, { id: `match-change:${matchId}:${key}`, playerId: event.playerId, title: event.playerId ? `${players.find(player => player.id === event.playerId)?.displayName ?? players.find(player => player.id === event.playerId)?.name ?? 'Player'} · Changes` : event.eyebrow, detail: item.label, eventIds: [item.id], items: [item] })
  }
  for (const event of cachedRankingChanges(players, matches)) {
    if (event.matchId !== matchId) continue
    const key = `player:${event.playerId}`
    const current = groups.get(key)
    const item: GroupedMatchChangeItem = { id: event.id, label: event.label, kind: 'ranking' }
    if (current) { current.detail = `${current.detail} · ${item.label}`; current.eventIds.push(item.id); current.items.push(item); continue }
    const player = players.find(item => item.id === event.playerId)
    groups.set(key, { id: `match-change:${matchId}:${key}`, playerId: event.playerId, title: `${player?.displayName ?? player?.name ?? 'Player'} · Changes`, detail: item.label, eventIds: [item.id], items: [item] })
  }
  const result = [...groups.values()]
  byMatch.set(matchId, result)
  return result
}
