import type { Position } from '../types'
import { normalizePositionFamily } from './timeline'

const MOM_POSITION_PRIORITY: Record<Position, number> = {
  GK: 0, CB: 1, LCB: 1, RCB: 1, LB: 2, LWB: 2, RB: 2, RWB: 2,
  CDM: 3, LDM: 3, RDM: 3, CM: 4, LCM: 4, RCM: 4, LM: 5, RM: 5,
  CAM: 6, LW: 7, RW: 7, SS: 8, ST: 9, LST: 9, RST: 9,
}
export function momPositionPriority(position?: string): number | undefined {
  const family = normalizePositionFamily(position)
  return family ? MOM_POSITION_PRIORITY[family] : undefined
}
export type MomCandidate = { playerId: string; average: number; position: string; goals: number; assists: number; minutes: number }
export function selectMomCandidate(candidates: MomCandidate[], scopeId: string): string | undefined {
  const compare = (a: MomCandidate, b: MomCandidate) => b.average - a.average || (momPositionPriority(a.position) ?? 99) - (momPositionPriority(b.position) ?? 99) || b.goals - a.goals || b.assists - a.assists || b.minutes - a.minutes
  const ordered = candidates.slice().sort(compare)
  if (!ordered.length) return undefined
  const ids = ordered.filter(candidate => compare(candidate, ordered[0]) === 0).map(candidate => candidate.playerId).sort()
  const seed = `${scopeId}:${ids.join(',')}`
  let hash = 2166136261
  for (let index = 0; index < seed.length; index++) { hash ^= seed.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return ids[(hash >>> 0) % ids.length]
}
