import type { Match, Player, Position, PositionFilterKey } from '../types'
import { creditedPositionSegments, normalizePositionFamily } from './timeline'
import { awardPositionFamily, type AwardPositionFamily } from './awardRules'
import { RATING_ENGINE_REVISION } from './ratingRevision'

export type PositionFamily = 'ST' | 'SS' | 'LW' | 'RW' | 'CAM' | 'LM' | 'RM' | 'CM' | 'CDM' | 'LB' | 'CB' | 'RB' | 'GK'
export type TeamHistoryPositionGroup = 'GK' | 'DEF' | 'MID' | 'FW'
export type { PositionFilterKey } from '../types'
export type PositionScope = { seasons?: string[]; teams?: string[]; fallback?: 'career' | 'none' }

const FAMILY_ORDER: PositionFamily[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'LM', 'RM', 'CAM', 'LW', 'RW', 'SS', 'ST']
const AWARD_ORDER: AwardPositionFamily[] = ['GK', 'LB', 'CB', 'RB', 'MID', 'ATT']
type MinuteCacheEntry = { matches: Match[]; inputs: { events: Match['events']; appearances: Match['appearances']; duration: number }[]; players: Player[]; byPlayers: WeakMap<Player[], Map<string, Map<string, Map<Position, number>>>> }
const minuteCache = new WeakMap<Match[], MinuteCacheEntry>()

export function positionFamily(position?: string): PositionFamily | undefined {
  const value = normalizePositionFamily(position)
  if (!value) return undefined
  if (value === 'LWB') return 'LB'
  if (value === 'RWB') return 'RB'
  return value as PositionFamily
}

export function positionFilterFamilies(key: PositionFilterKey): PositionFamily[] {
  if (key === 'all') return []
  if (key === 'st-ss') return ['ST', 'SS']
  if (key === 'lw-rw') return ['LW', 'RW']
  if (key === 'lm-rm') return ['LM', 'RM']
  if (key === 'lb-rb' || key === 'fb') return ['LB', 'RB']
  return [key.toUpperCase() as PositionFamily]
}

function inScope(match: Match, scope: PositionScope) {
  return (!scope.seasons?.length || scope.seasons.includes(match.season))
}

function dominant<T extends string>(minutes: Map<T, number>, order: readonly T[]): T | undefined {
  return [...minutes].sort((left, right) => right[1] - left[1] || order.indexOf(left[0]) - order.indexOf(right[0]) || left[0].localeCompare(right[0]))[0]?.[0]
}

export function dominantPositionFamily(minutes: Map<PositionFamily, number>): PositionFamily | undefined {
  return dominant(minutes, FAMILY_ORDER)
}

function positionMinutesByPlayer(players: Player[], matches: Match[], scope: PositionScope) {
  let entry = minuteCache.get(matches)
  // Legacy callers can replace/delete items in the same collection. Preserve
  // that behavior while avoiding a second traversal of appearance timelines.
  if (!entry || entry.matches.length !== matches.length || entry.matches.some((match, index) => match !== matches[index] || match.events !== entry!.inputs[index].events || match.appearances !== entry!.inputs[index].appearances || match.duration !== entry!.inputs[index].duration) || entry.players.length !== players.length || entry.players.some((player, index) => player !== players[index])) {
    entry = { matches: matches.slice(), inputs: matches.map(({ events, appearances, duration }) => ({ events, appearances, duration })), players: players.slice(), byPlayers: new WeakMap() }
    minuteCache.set(matches, entry)
  }
  const byPlayers = entry.byPlayers
  let byScope = byPlayers.get(players)
  if (!byScope) { byScope = new Map(); byPlayers.set(players, byScope) }
  const key = JSON.stringify([RATING_ENGINE_REVISION, (scope.seasons ?? []).slice().sort(), (scope.teams ?? []).slice().sort()])
  const cached = byScope.get(key)
  if (cached) return cached
  const known = new Set(players.map(player => player.id))
  const rows = new Map<string, Map<Position, number>>()
  for (const match of matches) {
    if (!inScope(match, scope)) continue
    for (const appearance of match.appearances) {
      if (!known.has(appearance.playerId) || (scope.teams?.length && !scope.teams.includes(appearance.teamId))) continue
      const minutes = rows.get(appearance.playerId) ?? new Map<Position, number>()
      for (const segment of creditedPositionSegments(match, appearance)) minutes.set(segment.position, (minutes.get(segment.position) ?? 0) + segment.exit - segment.enter)
      rows.set(appearance.playerId, minutes)
    }
  }
  if (byScope.size >= 64) byScope.delete(byScope.keys().next().value!)
  byScope.set(key, rows)
  return rows
}

export function scopedPositionFamilyByPlayer(players: Player[], matches: Match[], scope: PositionScope): Map<string, PositionFamily> {
  const result = new Map<string, PositionFamily>()
  for (const [playerId, positions] of positionMinutesByPlayer(players, matches, scope)) {
    const minutes = new Map<PositionFamily, number>()
    for (const [position, value] of positions) {
      const family = positionFamily(position)
      if (family) minutes.set(family, (minutes.get(family) ?? 0) + value)
    }
    const family = dominantPositionFamily(minutes)
    if (family) result.set(playerId, family)
  }
  if (scope.fallback === 'none') return result
  const hasScope = Boolean(scope.seasons?.length || scope.teams?.length)
  const career = hasScope ? scopedPositionFamilyByPlayer(players, matches, {}) : undefined
  for (const player of players) if (!result.has(player.id)) {
    const fallback = career?.get(player.id) ?? positionFamily(player.position)
    if (fallback) result.set(player.id, fallback)
  }
  return result
}

export function scopedAwardFamilyByPlayer(players: Player[], matches: Match[], scope: PositionScope): Map<string, AwardPositionFamily> {
  const result = new Map<string, AwardPositionFamily>()
  for (const [playerId, positions] of positionMinutesByPlayer(players, matches, scope)) {
    const minutes = new Map<AwardPositionFamily, number>()
    for (const [position, value] of positions) {
      const family = awardPositionFamily(position)
      if (family) minutes.set(family, (minutes.get(family) ?? 0) + value)
    }
    const family = dominant(minutes, AWARD_ORDER)
    if (family) result.set(playerId, family)
  }
  return result
}

/** Team History alone combines all defensive roles; official award families stay unchanged. */
export function teamHistoryPositionGroup(position?: string): TeamHistoryPositionGroup | undefined {
  const family = positionFamily(position)
  if (family === 'GK') return 'GK'
  if (family === 'CB' || family === 'LB' || family === 'RB') return 'DEF'
  if (family && ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(family)) return 'MID'
  if (family && ['ST', 'SS', 'LW', 'RW'].includes(family)) return 'FW'
}

/** Sum credited minutes across each broad group before choosing a representative role.
 * Tied totals use GK, DEF, MID, FW order; no current/career-position fallback applies. */
export function scopedTeamHistoryGroupByPlayer(players: Player[], matches: Match[], scope: PositionScope): Map<string, TeamHistoryPositionGroup> {
  const result = new Map<string, TeamHistoryPositionGroup>()
  for (const [playerId, positions] of positionMinutesByPlayer(players, matches, scope)) {
    const minutes = new Map<TeamHistoryPositionGroup, number>()
    for (const [position, value] of positions) {
      const group = teamHistoryPositionGroup(position)
      if (group && value > 0) minutes.set(group, (minutes.get(group) ?? 0) + value)
    }
    const group = dominant(minutes, ['GK', 'DEF', 'MID', 'FW'])
    if (group) result.set(playerId, group)
  }
  return result
}
