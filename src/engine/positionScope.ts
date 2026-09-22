import type { Match, Player, Position, PositionFilterKey } from '../types'
import { creditedPositionSegments, normalizePositionFamily } from './timeline'
import { awardPositionFamily, type AwardPositionFamily } from './awardRules'

export type PositionFamily = 'ST' | 'SS' | 'LW' | 'RW' | 'CAM' | 'LM' | 'RM' | 'CM' | 'CDM' | 'FB' | 'CB' | 'GK'
export type { PositionFilterKey } from '../types'
export type PositionScope = { seasons?: string[]; teams?: string[] }

const FAMILY_ORDER: PositionFamily[] = ['GK', 'CB', 'FB', 'CDM', 'CM', 'LM', 'RM', 'CAM', 'LW', 'RW', 'SS', 'ST']
const AWARD_ORDER: AwardPositionFamily[] = ['GK', 'LB', 'CB', 'RB', 'MID', 'ATT']

export function positionFamily(position?: string): PositionFamily | undefined {
  const value = normalizePositionFamily(position)
  if (!value) return undefined
  if (value === 'LB' || value === 'LWB' || value === 'RB' || value === 'RWB') return 'FB'
  return value as PositionFamily
}

export function positionFilterFamilies(key: PositionFilterKey): PositionFamily[] {
  if (key === 'all') return []
  if (key === 'st-ss') return ['ST', 'SS']
  if (key === 'lw-rw') return ['LW', 'RW']
  if (key === 'lm-rm') return ['LM', 'RM']
  return [key.toUpperCase() as PositionFamily]
}

function inScope(match: Match, scope: PositionScope) {
  return (!scope.seasons?.length || scope.seasons.includes(match.season))
}

function dominant<T extends string>(minutes: Map<T, number>, order: readonly T[]): T | undefined {
  return [...minutes].sort((left, right) => right[1] - left[1] || order.indexOf(left[0]) - order.indexOf(right[0]) || left[0].localeCompare(right[0]))[0]?.[0]
}

function positionMinutesByPlayer(players: Player[], matches: Match[], scope: PositionScope) {
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
    const family = dominant(minutes, FAMILY_ORDER)
    if (family) result.set(playerId, family)
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
