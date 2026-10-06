import type { Position } from '../types'
import { positionFamily } from './positionScope'

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
  const remaining = [...ordered, ...available]
  const used = new Set<string>()
  return slots.map(slot => {
    const family = positionFamily(slot.position)
    const matchesFamily = (player: { id: string; position: Position }) => family && (representative?.get(player.id) ?? positionFamily(player.position)) === family
    const exact = remaining.find(player => !used.has(player.id) && player.position === slot.position && matchesFamily(player))
    const related = remaining.find(player => !used.has(player.id) && matchesFamily(player))
    const selected = exact ?? related ?? remaining.find(player => !used.has(player.id))
    if (!selected) return ''
    used.add(selected.id)
    return selected.id
  })
}
