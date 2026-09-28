import type { Best11Slot, ChampionsStage, CupStage, Position } from '../types'
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
  return appearances >= Math.ceil(teamMatches * .4)
}

export type AwardCandidate = {
  playerId: string
  teamId: string
  family?: AwardPositionFamily
  average: number
  appearances: number
  mom: number
  minutes: number
  latestRating: number
  goals: number
  assists: number
  selectionScore: number
}

export type AwardCandidateMode = 'cumulative' | 'recent' | 'monthly'

export function rankAwardCandidates(candidates: AwardCandidate[], mode: AwardCandidateMode): AwardCandidate[] {
  return candidates.slice().sort((left, right) => {
    if (mode === 'recent') {
      return right.average - left.average || right.mom - left.mom || right.latestRating - left.latestRating || right.minutes - left.minutes || (right.goals + right.assists) - (left.goals + left.assists) || left.playerId.localeCompare(right.playerId)
    }
    if (mode === 'monthly') {
      return right.average - left.average || right.mom - left.mom || right.minutes - left.minutes || (right.goals + right.assists) - (left.goals + left.assists) || left.playerId.localeCompare(right.playerId)
    }
    return right.selectionScore - left.selectionScore || right.appearances - left.appearances || right.mom - left.mom || right.minutes - left.minutes || right.latestRating - left.latestRating || (right.goals + right.assists) - (left.goals + left.assists) || left.playerId.localeCompare(right.playerId)
  })
}

export function selectAwardBestXI(candidates: AwardCandidate[]): Best11Slot[] {
  const used = new Set<string>()
  return AWARD_433.map(role => {
    const candidate = candidates.find(row => !used.has(row.playerId) && row.family === role.family)
    if (!candidate) return { slot: role.slot, position: role.position, playerId: null, avgRating: 0, matches: 0 }
    used.add(candidate.playerId)
    return { slot: role.slot, position: role.position, playerId: candidate.playerId, teamId: candidate.teamId, avgRating: candidate.average, matches: candidate.appearances }
  })
}

export function seasonLeaguePositionBonus(rank: number): number {
  return rank === 1 ? .26 : rank === 2 ? .12 : rank === 3 ? .06 : rank === 4 ? .05 : rank <= 6 ? .04 : rank <= 8 ? .03 : rank <= 12 ? .015 : 0
}

export function seasonChampionsProgressBonus(stage: ChampionsStage | 'champion' | 'runnerUp'): number {
  return stage === 'champion' ? .24 : stage === 'runnerUp' ? .11 : stage === 'semiFinal' ? .05 : stage === 'quarterFinal' ? .03 : 0
}

export function seasonCupProgressBonus(stage: CupStage | 'champion' | 'runnerUp'): number {
  if (stage === 'champion') return .12
  if (stage === 'runnerUp') return .06
  const number = Number(stage.replace('stage', ''))
  return Number.isFinite(number) ? [0, 0, 0, 0, .020, .025, .030, .035][number] ?? 0 : 0
}

/** Monthly awards deliberately use League-only individual performance. */
export function monthlyAwardScore(avgRating: number): number {
  return avgRating
}
