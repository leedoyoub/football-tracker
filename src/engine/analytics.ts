import { matchPositionSegments, matchScore, ratePlayerMatch } from './rating'
import type { Match, Player, Position } from '../types'

export type AnalyticsFilter = { season?: string; teamId?: string }
export type CombinationKind = 'duo' | 'attack' | 'midfield' | 'cb' | 'backFour'
export type CombinationStats = {
  key: string; kind: CombinationKind; playerIds: string[]; teamId: string
  togetherMinutes: number; matches: number; goalsFor: number; goalsAgainst: number
  goalDifference: number; combinedGoals: number; combinedAssists: number; combinedGA: number
  averageRating: number; wins: number; draws: number; losses: number; cleanSheets: number
  eligible: boolean
}
export type GoalPartnership = { key: string; assisterId: string; scorerId: string; teamId: string; assistedGoals: number; combinedGoals: number; eligible: boolean }
export type OnPitchStats = { playerId: string; teamId: string; minutes: number; goalsFor: number; goalsAgainst: number; plusMinus: number }
export type PositionSplit = { position: Position; matches: number; minutes: number; averageRating: number; goals: number; assists: number; combinedGA: number }
export type RoleSplit = { apps: number; minutes: number; averageRating: number; goals: number; assists: number; combinedGA: number; goalsPer90: number; assistsPer90: number; gaPer90: number }

type Interval = { start: number; end: number; position: Position }
type RoleCheck = (position: Position) => boolean
const attackers = new Set<Position>(['ST', 'LST', 'RST', 'SS', 'LW', 'RW'])
const midfielders = new Set<Position>(['CAM', 'LM', 'RM', 'CM', 'LCM', 'RCM', 'CDM', 'LDM', 'RDM'])
const centreBacks = new Set<Position>(['CB', 'LCB', 'RCB'])
const leftBacks = new Set<Position>(['LB', 'LWB'])
const rightBacks = new Set<Position>(['RB', 'RWB'])
const anyRole: RoleCheck = () => true
const roleFor = (kind: Exclude<CombinationKind, 'backFour'>): RoleCheck => kind === 'attack' ? position => attackers.has(position) : kind === 'midfield' ? position => midfielders.has(position) : kind === 'cb' ? position => centreBacks.has(position) : anyRole

function isScoped(match: Match, filter: AnalyticsFilter, teamId?: string) {
  if (filter.season && match.season !== filter.season) return false
  const selectedTeam = teamId ?? filter.teamId
  return !selectedTeam || match.appearances.some(appearance => appearance.teamId === selectedTeam)
}

function teamIntervals(match: Match, playerId: string, teamId: string): Interval[] {
  const appearance = match.appearances.find(item => item.playerId === playerId && item.teamId === teamId)
  return appearance ? matchPositionSegments(match, appearance).map(segment => ({ start: segment.enter, end: segment.exit, position: segment.position })) : []
}

function sharedIntervals(match: Match, playerIds: string[], teamId: string, roles: Record<string, RoleCheck> = {}): Interval[] {
  const intervals = playerIds.map(id => teamIntervals(match, id, teamId))
  if (intervals.some(items => !items.length)) return []
  const boundaries = [...new Set(intervals.flatMap(items => items.flatMap(item => [item.start, item.end])))].sort((a, b) => a - b)
  const shared: Interval[] = []
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index]; const end = boundaries[index + 1]; const middle = start + (end - start) / 2
    const positions = intervals.map(items => items.find(item => item.start <= middle && middle < item.end)?.position)
    if (positions.some(position => !position)) continue
    if (positions.some((position, itemIndex) => !roles[playerIds[itemIndex]]?.(position!) && roles[playerIds[itemIndex]] !== undefined)) continue
    shared.push({ start, end, position: positions[0]! })
  }
  return shared
}

function minutes(intervals: Interval[]) { return intervals.reduce((total, interval) => total + interval.end - interval.start, 0) }
function includesMinute(intervals: Interval[], minute: number) { return intervals.some(interval => minute >= interval.start && minute < interval.end) }
function scoringTeam(event: Extract<Match['events'][number], { type: 'goal' }>, match: Match) { return event.ownGoal ? (event.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId) : event.teamId }
function teamIds(match: Match) { return [...new Set(match.appearances.map(appearance => appearance.teamId))] }
function combinations<T>(items: T[], count: number): T[][] { if (count === 0) return [[]]; return items.flatMap((item, index) => combinations(items.slice(index + 1), count - 1).map(rest => [item, ...rest])) }
function eligible(matches: number, togetherMinutes: number) { return matches >= 3 || togetherMinutes >= 180 }

function buildCombination(match: Match, playerIds: string[], teamId: string, roles: Record<string, RoleCheck>, playersById: Map<string, Player>): Omit<CombinationStats, 'key' | 'kind' | 'playerIds' | 'teamId' | 'eligible'> | null {
  const overlap = sharedIntervals(match, playerIds, teamId, roles)
  const togetherMinutes = minutes(overlap)
  if (!togetherMinutes) return null
  let goalsFor = 0; let goalsAgainst = 0; let combinedGoals = 0; let combinedAssists = 0
  for (const event of match.events) {
    if (event.type !== 'goal' || !includesMinute(overlap, event.minute)) continue
    if (scoringTeam(event, match) === teamId) goalsFor++; else goalsAgainst++
    if (!event.ownGoal && playerIds.includes(event.playerId ?? '')) combinedGoals++
    if (!event.ownGoal && playerIds.includes(event.assistPlayerId ?? '')) combinedAssists++
  }
  const score = matchScore(match); const ours = teamId === match.homeTeamId ? score.home : score.away; const theirs = teamId === match.homeTeamId ? score.away : score.home
  const ratings = playerIds.flatMap(playerId => { const player = playersById.get(playerId); const rating = player && ratePlayerMatch(match, player); return rating ? [rating.rating] : [] })
  return { togetherMinutes, matches: 1, goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst, combinedGoals, combinedAssists, combinedGA: combinedGoals + combinedAssists, averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0, wins: ours > theirs ? 1 : 0, draws: ours === theirs ? 1 : 0, losses: ours < theirs ? 1 : 0, cleanSheets: goalsAgainst === 0 ? 1 : 0 }
}

export function combinationStats(players: Player[], matches: Match[], filter: AnalyticsFilter, kind: CombinationKind): CombinationStats[] {
  const playersById = new Map(players.map(player => [player.id, player]))
  const totals = new Map<string, CombinationStats>()
  for (const match of matches.filter(match => isScoped(match, filter))) for (const teamId of teamIds(match)) {
    if (filter.teamId && teamId !== filter.teamId) continue
    const appearances = match.appearances.filter(appearance => appearance.teamId === teamId)
    const available = (check: RoleCheck) => appearances.filter(appearance => teamIntervals(match, appearance.playerId, teamId).some(interval => check(interval.position))).map(appearance => appearance.playerId)
    const add = (ids: string[], roles: Record<string, RoleCheck>) => {
      const unique = [...new Set(ids)]
      if (unique.length !== ids.length) return
      const entry = buildCombination(match, ids, teamId, roles, playersById)
      if (!entry) return
      const key = `${teamId}:${ids.slice().sort().join(':')}`; const previous = totals.get(key)
      if (!previous) { totals.set(key, { key, kind, playerIds: ids.slice().sort(), teamId, ...entry, eligible: false }); return }
      previous.togetherMinutes += entry.togetherMinutes; previous.matches += entry.matches; previous.goalsFor += entry.goalsFor; previous.goalsAgainst += entry.goalsAgainst; previous.goalDifference += entry.goalDifference; previous.combinedGoals += entry.combinedGoals; previous.combinedAssists += entry.combinedAssists; previous.combinedGA += entry.combinedGA; previous.averageRating = (previous.averageRating * (previous.matches - 1) + entry.averageRating) / previous.matches; previous.wins += entry.wins; previous.draws += entry.draws; previous.losses += entry.losses; previous.cleanSheets += entry.cleanSheets
    }
    if (kind === 'backFour') for (const left of available(position => leftBacks.has(position))) for (const centre of combinations(available(position => centreBacks.has(position)), 2)) for (const right of available(position => rightBacks.has(position))) add([left, ...centre, right], { [left]: position => leftBacks.has(position), [centre[0]]: position => centreBacks.has(position), [centre[1]]: position => centreBacks.has(position), [right]: position => rightBacks.has(position) })
    else { const count = kind === 'duo' || kind === 'cb' ? 2 : 3; const role = roleFor(kind); for (const ids of combinations(available(role), count)) add(ids, Object.fromEntries(ids.map(id => [id, role]))) }
  }
  return [...totals.values()].map(row => ({ ...row, eligible: eligible(row.matches, row.togetherMinutes) })).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.togetherMinutes - a.togetherMinutes || b.goalDifference - a.goalDifference)
}

export function goalPartnerships(players: Player[], matches: Match[], filter: AnalyticsFilter): GoalPartnership[] {
  const playerIds = new Set(players.map(player => player.id)); const totals = new Map<string, GoalPartnership>()
  for (const match of matches.filter(match => isScoped(match, filter))) for (const event of match.events) {
    if (event.type !== 'goal' || event.ownGoal || !event.playerId || !event.assistPlayerId || !playerIds.has(event.playerId) || !playerIds.has(event.assistPlayerId)) continue
    const teamId = event.teamId; if (filter.teamId && teamId !== filter.teamId) continue
    const scorerOn = teamIntervals(match, event.playerId, teamId); const assisterOn = teamIntervals(match, event.assistPlayerId, teamId)
    if (!includesMinute(scorerOn, event.minute) || !includesMinute(assisterOn, event.minute)) continue
    const key = `${teamId}:${event.assistPlayerId}:${event.playerId}`; const previous = totals.get(key)
    if (previous) { previous.assistedGoals++; previous.combinedGoals++ } else totals.set(key, { key, teamId, assisterId: event.assistPlayerId, scorerId: event.playerId, assistedGoals: 1, combinedGoals: 1, eligible: false })
  }
  return [...totals.values()].map(row => ({ ...row, eligible: row.assistedGoals >= 3 })).sort((a, b) => b.assistedGoals - a.assistedGoals)
}

export function onPitchStats(players: Player[], matches: Match[], filter: AnalyticsFilter): OnPitchStats[] {
  return players.flatMap(player => {
    const totals = new Map<string, OnPitchStats>()
    for (const match of matches.filter(match => isScoped(match, filter))) for (const teamId of teamIds(match)) {
      if (filter.teamId && teamId !== filter.teamId) continue
      const intervals = teamIntervals(match, player.id, teamId); if (!intervals.length) continue
      const row = totals.get(teamId) ?? { playerId: player.id, teamId, minutes: 0, goalsFor: 0, goalsAgainst: 0, plusMinus: 0 }; row.minutes += minutes(intervals)
      for (const event of match.events) if (event.type === 'goal' && includesMinute(intervals, event.minute)) {
        if (scoringTeam(event, match) === teamId) row.goalsFor++
        else row.goalsAgainst++
      }
      row.plusMinus = row.goalsFor - row.goalsAgainst; totals.set(teamId, row)
    }
    return [...totals.values()]
  })
}

export function positionSplits(player: Player, matches: Match[], filter: AnalyticsFilter): PositionSplit[] {
  const totals = new Map<Position, PositionSplit>()
  const seenMatches = new Map<Position, Set<string>>()
  const ratingMinutes = new Map<Position, number>()
  for (const match of matches.filter(match => isScoped(match, filter))) for (const appearance of match.appearances.filter(appearance => appearance.playerId === player.id && (!filter.teamId || appearance.teamId === filter.teamId))) {
    const segments = teamIntervals(match, player.id, appearance.teamId); const rating = ratePlayerMatch(match, player)
      for (const segment of segments) { const row = totals.get(segment.position) ?? { position: segment.position, matches: 0, minutes: 0, averageRating: 0, goals: 0, assists: 0, combinedGA: 0 }; const seen = seenMatches.get(segment.position) ?? new Set<string>(); if (!seen.has(match.id)) { row.matches++; seen.add(match.id); seenMatches.set(segment.position, seen) }; const segmentMinutes = segment.end - segment.start; row.minutes += segmentMinutes; ratingMinutes.set(segment.position, (ratingMinutes.get(segment.position) ?? 0) + (rating?.rating ?? 0) * segmentMinutes)
      for (const event of match.events) if (event.type === 'goal' && includesMinute([segment], event.minute) && !event.ownGoal) { if (event.playerId === player.id) row.goals++; if (event.assistPlayerId === player.id) row.assists++ }
      row.combinedGA = row.goals + row.assists; totals.set(segment.position, row)
    }
  }
  return [...totals.values()].map(row => ({ ...row, averageRating: row.minutes ? (ratingMinutes.get(row.position) ?? 0) / row.minutes : 0 })).sort((a, b) => b.minutes - a.minutes)
}

export function starterSubstituteSplits(player: Player, matches: Match[], filter: AnalyticsFilter): { starter: RoleSplit; substitute: RoleSplit } {
  const make = (): RoleSplit => ({ apps: 0, minutes: 0, averageRating: 0, goals: 0, assists: 0, combinedGA: 0, goalsPer90: 0, assistsPer90: 0, gaPer90: 0 })
  const result = { starter: make(), substitute: make() }
  for (const match of matches.filter(match => isScoped(match, filter))) for (const appearance of match.appearances.filter(appearance => appearance.playerId === player.id && (!filter.teamId || appearance.teamId === filter.teamId))) {
    const intervals = teamIntervals(match, player.id, appearance.teamId); const totalMinutes = minutes(intervals); if (!totalMinutes) continue
    const row = appearance.role === 'starter' ? result.starter : result.substitute; const rating = ratePlayerMatch(match, player); row.apps++; row.minutes += totalMinutes; row.averageRating += rating?.rating ?? 0
    for (const event of match.events) if (event.type === 'goal' && !event.ownGoal && includesMinute(intervals, event.minute)) { if (event.playerId === player.id) row.goals++; if (event.assistPlayerId === player.id) row.assists++ }
  }
  for (const row of Object.values(result)) { row.combinedGA = row.goals + row.assists; row.averageRating = row.apps ? row.averageRating / row.apps : 0; row.goalsPer90 = row.minutes ? row.goals / row.minutes * 90 : 0; row.assistsPer90 = row.minutes ? row.assists / row.minutes * 90 : 0; row.gaPer90 = row.minutes ? row.combinedGA / row.minutes * 90 : 0 }
  return result
}
