import type { Appearance, FormationSlot, Match, Position } from '../types.ts'
import { TACTICAL_SLOT_DEFINITIONS, tacticalSlotById, tacticalSlotsForFormation } from './tacticalSlots.ts'

export type LineupValidation = { valid: boolean; errors: string[]; playerIds: string[]; slotIds: string[] }

const aliases: Record<string, string> = { LAM: 'LCAM', RAM: 'RCAM', LWB: 'LB', RWB: 'RB' }
const semanticSlots: Record<string, string[]> = {
  GK: ['GK'], LB: ['LB'], RB: ['RB'], LWB: ['LB'], RWB: ['RB'],
  CB: ['LCB', 'CB', 'RCB'], LCB: ['LCB'], RCB: ['RCB'],
  CDM: ['LDM', 'CDM', 'RDM'], LDM: ['LDM'], RDM: ['RDM'],
  CM: ['LCM', 'CM', 'RCM'], LCM: ['LCM'], RCM: ['RCM'],
  CAM: ['LCAM', 'CAM', 'RCAM'], LCAM: ['LCAM'], RCAM: ['RCAM'], LAM: ['LCAM'], RAM: ['RCAM'],
  LM: ['LM'], RM: ['RM'], LW: ['LW'], RW: ['RW'], SS: ['WING_CENTER'],
  ST: ['LST', 'ST', 'RST'], LST: ['LST'], RST: ['RST'],
}

function slotsForSemantic(raw: string, count: number): string[] {
  const slots = semanticSlots[raw.toUpperCase()] ?? []
  if (count === 1 && ['CB', 'CDM', 'CM', 'CAM', 'ST'].includes(raw.toUpperCase())) return [slots[Math.floor(slots.length / 2)]]
  if (count === 2 && ['CB', 'CDM', 'CM', 'CAM', 'ST'].includes(raw.toUpperCase())) return [slots[0], slots[slots.length - 1]]
  return slots
}

export function validateKickoffLineup(lineup: FormationSlot[], exact = true): LineupValidation {
  const occupied = lineup.filter(slot => Boolean(slot.playerId))
  const playerIds = occupied.map(slot => slot.playerId!)
  const slotIds = occupied.map(slot => slot.id)
  const errors: string[] = []
  if (exact && occupied.length !== 11) errors.push('Starting XI must contain exactly 11 occupied slots.')
  if (!exact && occupied.length > 11) errors.push('Starting XI cannot contain more than 11 occupied slots.')
  if (new Set(playerIds).size !== playerIds.length) errors.push('A player occupies more than one tactical slot.')
  if (new Set(slotIds).size !== slotIds.length) errors.push('A tactical slot is duplicated.')
  if (slotIds.filter(id => id === 'GK').length > 1) errors.push('Only one goalkeeper tactical slot is allowed.')
  if (slotIds.some(id => !tacticalSlotById[id])) errors.push('Starting XI contains an unknown tactical slot.')
  return { valid: errors.length === 0, errors, playerIds, slotIds }
}

export function kickoffFromAssignments(assignments: Record<string, string>, exact = true): FormationSlot[] {
  const lineup = Object.entries(assignments).flatMap(([id, playerId]) => {
    const definition = tacticalSlotById[id]
    return definition && playerId ? [{ id, playerId, matchPosition: definition.ratingPosition, ratingPosition: definition.ratingPosition, displayPosition: definition.displayPosition, x: definition.x, y: definition.y }] : []
  })
  if (!validateKickoffLineup(lineup, exact).valid) return lineup
  return lineup
}

function teamStarters(match: Match, teamId: string): Appearance[] {
  return match.appearances.filter(appearance => appearance.teamId === teamId && appearance.role === 'starter')
}

function normalizedSlot(value: string | undefined): string | undefined {
  if (!value) return undefined
  const upper = value.toUpperCase()
  return tacticalSlotById[upper] ? upper : aliases[upper]
}

function nearestSavedSlot(appearance: Appearance, used: Set<string>): string | undefined {
  if (appearance.kickoffX === undefined || appearance.kickoffY === undefined) return undefined
  const x = appearance.kickoffX <= 1 ? appearance.kickoffX * 100 : appearance.kickoffX
  const y = appearance.kickoffY <= 1 ? appearance.kickoffY * 100 : appearance.kickoffY
  return TACTICAL_SLOT_DEFINITIONS.filter(slot => !used.has(slot.id)).sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))[0]?.id
}

/** Pure legacy recovery. It never writes a reconstructed lineup back into a match. */
export function reconstructLegacyKickoffLineup(match: Match, teamId: string): FormationSlot[] {
  const used = new Set<string>()
  const result: FormationSlot[] = []
  const starters = teamStarters(match, teamId)
  const formationTargets = tacticalSlotsForFormation(match.formation) ?? TACTICAL_SLOT_DEFINITIONS.map(slot => slot.id)
  const targetSet = new Set(formationTargets)
  const semanticCounts = new Map<string, number>()
  for (const appearance of starters) {
    const raw = String(appearance.matchPosition ?? appearance.position).toUpperCase()
    semanticCounts.set(raw, (semanticCounts.get(raw) ?? 0) + 1)
  }
  for (const appearance of starters) {
    const raw = (appearance.matchPosition ?? appearance.position) as string
    const saved = match.kickoffLineup?.find(slot => slot.playerId === appearance.playerId)
    const direct = normalizedSlot(raw)
    // CB/CM/CDM/CAM/ST are rating semantics, not unique tactical slots.
    const semanticCandidates = slotsForSemantic(raw, semanticCounts.get(raw.toUpperCase()) ?? 1)
    const candidates = (semanticCandidates.length ? semanticCandidates : direct ? [direct] : []).filter(id => targetSet.has(id))
    const savedSlot = saved && tacticalSlotById[saved.id] && !used.has(saved.id) ? saved.id : undefined
    const withSavedPoint = saved && (saved.x !== undefined || saved.y !== undefined)
      ? ({ ...appearance, kickoffX: saved.x ?? appearance.kickoffX, kickoffY: saved.y ?? appearance.kickoffY })
      : appearance
    const slotId = savedSlot
      ?? candidates.find(id => !used.has(id))
      ?? nearestSavedSlot(withSavedPoint, used)
      ?? TACTICAL_SLOT_DEFINITIONS.find(slot => targetSet.has(slot.id) && !used.has(slot.id) && slot.ratingPosition === (appearance.matchPosition ?? appearance.position as Position))?.id
      ?? formationTargets.find(id => !used.has(id))
      ?? TACTICAL_SLOT_DEFINITIONS.find(slot => !used.has(slot.id))?.id
    if (!slotId) continue
    const definition = tacticalSlotById[slotId]
    used.add(slotId)
    const useSavedPoint = !saved || !tacticalSlotById[saved.id] || savedSlot === slotId
    result.push({ id: slotId, playerId: appearance.playerId, matchPosition: definition.ratingPosition, ratingPosition: definition.ratingPosition, displayPosition: definition.displayPosition, x: useSavedPoint ? saved?.x ?? appearance.kickoffX ?? definition.x : appearance.kickoffX ?? definition.x, y: useSavedPoint ? saved?.y ?? appearance.kickoffY ?? definition.y : appearance.kickoffY ?? definition.y })
  }
  return result
}

/** Modern matches render their immutable snapshot directly; old matches have one
 * deterministic compatibility route rather than per-screen reconstruction. */
export function kickoffLineupForMatch(match: Match, teamId: string): FormationSlot[] {
  const modern = (match.kickoffLineup ?? []).filter(slot => Boolean(slot.playerId))
  if (modern.length && validateKickoffLineup(modern, false).valid) return modern.map(slot => {
    const definition = tacticalSlotById[slot.id]
    return { ...slot, matchPosition: slot.ratingPosition ?? slot.matchPosition ?? definition?.ratingPosition ?? 'CM', ratingPosition: slot.ratingPosition ?? slot.matchPosition ?? definition?.ratingPosition, displayPosition: slot.displayPosition ?? definition?.displayPosition, x: slot.x ?? definition?.x ?? 50, y: slot.y ?? definition?.y ?? 50 }
  })
  return reconstructLegacyKickoffLineup(match, teamId)
}
