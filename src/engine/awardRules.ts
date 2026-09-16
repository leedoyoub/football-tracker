import type { Position } from '../types'
import { normalizePositionFamily } from './timeline'

export type AwardPositionFamily = 'GK' | 'LB' | 'CB' | 'RB' | 'MID' | 'ATT'

export const AWARD_433: { slot: string; position: Position; family: AwardPositionFamily }[] = [
  { slot: 'GK', position: 'GK', family: 'GK' },
  { slot: 'LB', position: 'LB', family: 'LB' },
  { slot: 'LCB', position: 'CB', family: 'CB' },
  { slot: 'RCB', position: 'CB', family: 'CB' },
  { slot: 'RB', position: 'RB', family: 'RB' },
  { slot: 'LCM', position: 'CM', family: 'MID' },
  { slot: 'CM', position: 'CM', family: 'MID' },
  { slot: 'RCM', position: 'CM', family: 'MID' },
  { slot: 'LW', position: 'LW', family: 'ATT' },
  { slot: 'ST', position: 'ST', family: 'ATT' },
  { slot: 'RW', position: 'RW', family: 'ATT' },
]

export function awardPositionFamily(position?: string): AwardPositionFamily | null {
  const normalized = normalizePositionFamily(position)
  if (normalized === 'GK') return 'GK'
  if (normalized === 'LB' || normalized === 'LWB') return 'LB'
  if (normalized === 'RB' || normalized === 'RWB') return 'RB'
  if (normalized === 'CB') return 'CB'
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(normalized ?? '')) return 'MID'
  if (['ST', 'SS', 'LW', 'RW'].includes(normalized ?? '')) return 'ATT'
  return null
}

export function isAwardEligible(appearances: number, teamMatches: number): boolean {
  return appearances >= Math.ceil(teamMatches * .5)
}

/** Monthly awards deliberately use League-only individual performance. */
export function monthlyAwardScore(avgRating: number): number {
  return avgRating
}
