import type { Position } from '../types'
import { positionFamily } from './positionScope'

type Candidate = { id: string; position: Position }
type Slot = { slot: string; position: Position }

// Related families are only a fallback after exact side and normalized family.
const relatedFamilies: Record<string, readonly string[]> = {
  CB: ['LB', 'RB', 'CDM'], LB: ['CB', 'RB', 'LM', 'LW'], RB: ['CB', 'LB', 'RM', 'RW'],
  CDM: ['CB', 'CM'], CM: ['CDM', 'CAM', 'LM', 'RM'], CAM: ['CM', 'SS', 'LW', 'RW', 'ST'],
  LM: ['LB', 'LW', 'CM', 'RM'], RM: ['RB', 'RW', 'CM', 'LM'],
  LW: ['LM', 'RW', 'CAM', 'SS', 'ST'], RW: ['RM', 'LW', 'CAM', 'SS', 'ST'],
  SS: ['CAM', 'ST', 'LW', 'RW'], ST: ['SS', 'LW', 'RW', 'CAM'],
}

/** Assign all vacancies together, so an early fallback cannot take a later
 * slot's only exact fit. Candidate order breaks ties after overall fit. */
export function assignLineupVacancies(candidates: Candidate[], slots: Slot[], representative?: Map<string, string>): string[] {
  if (!slots.length) return []
  // A match has at most eleven starters, bounding the subset search at 2048.
  if (slots.length > 11) return []
  const count = 1 << slots.length
  const scoresByMask = new Float64Array(count).fill(-1)
  const picksByMask = new Int32Array(count * slots.length).fill(-1)
  scoresByMask[0] = 0
  // Store each state's picks in one flat buffer. Copy only a winning state;
  // candidate/slot pairs that lose allocate and copy nothing.
  const winsTie = (from: number, to: number, slot = -1, candidate = -1) => {
    for (let index = 0; index < slots.length; index++) {
      const pick = index === slot ? candidate : picksByMask[from * slots.length + index]
      const previous = picksByMask[to * slots.length + index]
      const left = pick < 0 ? Infinity : pick
      const right = previous < 0 ? Infinity : previous
      if (left !== right) return left < right
    }
    return false
  }
  const seen = new Set<string>()
  candidates.forEach((player, playerIndex) => {
    if (seen.has(player.id)) return
    seen.add(player.id)
    const family = representative?.get(player.id) ?? positionFamily(player.position)
    const scores = slots.map(slot => {
      if ((slot.position === 'GK') !== (player.position === 'GK')) return 0
      const targetFamily = positionFamily(slot.position)
      const tier = family === targetFamily ? player.position === slot.position ? 3 : 2
        : relatedFamilies[targetFamily ?? '']?.includes(family ?? '') ? 1 : 0
      // Base twelve makes one better-tier fit outweigh all lower-tier fits;
      // the leading term first maximizes the number of occupied slots.
      return 12 ** 4 + 12 ** tier
    })
    for (let mask = count - 1; mask >= 0; mask--) {
      const current = scoresByMask[mask]
      if (current < 0) continue
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        if ((mask & (1 << slotIndex)) || !scores[slotIndex]) continue
        const score = current + scores[slotIndex]
        const nextMask = mask | (1 << slotIndex)
        if (score < scoresByMask[nextMask] || score === scoresByMask[nextMask] && !winsTie(mask, nextMask, slotIndex, playerIndex)) continue
        scoresByMask[nextMask] = score
        picksByMask.copyWithin(nextMask * slots.length, mask * slots.length, (mask + 1) * slots.length)
        picksByMask[nextMask * slots.length + slotIndex] = playerIndex
      }
    }
  })
  let best = 0
  for (let mask = 1; mask < count; mask++) if (scoresByMask[mask] > scoresByMask[best] || scoresByMask[mask] === scoresByMask[best] && winsTie(mask, best)) best = mask
  return slots.map((_, index) => { const pick = picksByMask[best * slots.length + index]; return pick < 0 ? '' : candidates[pick].id })
}

/** Suggests a kickoff XI from effective families while preserving an exact
 * registered tactical side when it still belongs to that family. */
export function fillFormationSlots(
  squad: { id: string; position: Position }[],
  slots: { slot: string; position: Position }[],
  existing: string[] = [],
  recentAssignments?: Record<string, string>,
  representative?: Map<string, string>,
): string[] {
  if (recentAssignments) return slots.map(slot => recentAssignments[slot.slot] ?? '')
  const ordered = existing.filter(Boolean).map(id => squad.find(player => player.id === id)).filter((player): player is { id: string; position: Position } => Boolean(player))
  const available = squad.filter(player => !ordered.some(selected => selected.id === player.id))
  return assignLineupVacancies([...ordered, ...available], slots, representative)
}
