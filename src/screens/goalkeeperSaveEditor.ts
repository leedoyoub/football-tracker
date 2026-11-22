import { saveEventCount, validPlayerSaveEvents } from '../engine/playerMatchFacts'
import { matchPositionSegments } from '../engine/timeline'
import type { Appearance, Match, MatchEvent } from '../types'

export function editGoalkeeperSaveTotal(match: Match, keeper: Appearance, count: number, newId: () => string): MatchEvent[] {
  if (!Number.isSafeInteger(count) || count < 0 || !matchPositionSegments(match, keeper).some(segment => segment.position === 'GK')) return match.events

  const valid = validPlayerSaveEvents(match, keeper)
  let adjustable: Extract<MatchEvent, { type: 'save' }> | undefined
  for (const event of match.events) {
    if (event.type === 'save' && event.teamId === keeper.teamId && event.playerId === keeper.playerId &&
      event.minute === undefined && (event.count === 0 || valid.includes(event))) adjustable = event
  }
  const total = valid.reduce((sum, event) => sum + saveEventCount(event), 0)
  if (count >= total) {
    if (count === total && (valid.length || adjustable)) return match.events
    if (adjustable) return match.events.map(event => event === adjustable ? { ...event, count: saveEventCount(adjustable) + (count - total) } : event)
    return [...match.events, { id: newId(), type: 'save', playerId: keeper.playerId, teamId: keeper.teamId, count: count - total }]
  }

  // Apply the explicit correction to untimed totals first, then the last
  // recorded rows. Zero counts keep the saved event IDs and timeline intact.
  let remaining = count
  const corrections = new Map<MatchEvent, number>()
  for (const timed of [true, false]) for (const event of valid) {
    if ((event.minute !== undefined) !== timed) continue
    const current = saveEventCount(event)
    const kept = Math.min(current, remaining)
    if (kept !== current) corrections.set(event, kept)
    remaining -= kept
  }
  return match.events.map(event => event.type === 'save' && corrections.has(event) ? { ...event, count: corrections.get(event) } : event)
}
