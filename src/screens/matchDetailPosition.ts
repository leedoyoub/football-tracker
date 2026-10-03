import type { Appearance, MatchEvent } from '../types'
import { displayPositionForSlot } from '../engine/tacticalSlots'

/** A bench player's registered position is only a fallback for unused players. */
export function matchRoleLabel(appearance: Pick<Appearance, 'playerId' | 'position' | 'positionHistory' | 'role'>, events: MatchEvent[]): string {
  const entry = events.find(event => event.type === 'sub' && event.playerInId === appearance.playerId)
  if (!entry || entry.type !== 'sub') return appearance.position
  const first = (entry.tacticalSlotId && displayPositionForSlot(entry.tacticalSlotId)) || entry.position
  const labels = [first]
  for (const change of [...(appearance.positionHistory ?? [])].sort((a, b) => a.minute - b.minute || (a.sequence ?? 0) - (b.sequence ?? 0))) {
    if (change.minute < entry.minute) continue
    const next = (change.tacticalSlotId && displayPositionForSlot(change.tacticalSlotId)) || change.position
    if (next !== labels[labels.length - 1]) labels.push(next)
  }
  return labels.join(' → ')
}
