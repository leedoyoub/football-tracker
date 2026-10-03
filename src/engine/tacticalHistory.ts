import type { Appearance, Best11Slot, Match, MatchEvent, Position, PositionChange } from '../types'
import { isOnPitchAtEvent, nextTimelineSequence, orderedEvents, positionChangeOrder } from './timeline'
import { tacticalSlotById } from './tacticalSlots'

type TacticalAction = { minute: number; order: number; index: number; event?: Extract<MatchEvent, { type: 'sub' }>; change?: PositionChange; playerId?: string }

/** The tactical projection of the saved timeline. Rating positions only select a
 * deterministic slot when old data has no exact destination. */
export function tacticalAssignmentsAtMoment(
  kickoff: Record<string, string>, events: MatchEvent[], histories: Record<string, PositionChange[]>,
  positions: Record<string, Position>, moment?: MatchEvent,
): Record<string, string> {
  const slots = { ...kickoff }
  const match = { id: 'tactical-preview', season: '', matchDay: 0, date: '', duration: 90, homeTeamId: '', awayTeamId: '', events, appearances: [] } satisfies Match
  const ordered = orderedEvents(match)
  const rank = new Map(ordered.map((row, index) => [row.event, index]))
  const momentRank = moment ? ordered.findIndex(row => row.event === moment || row.event.id === moment.id) : Infinity
  const appearances = Object.fromEntries(Object.keys(histories).map(playerId => [playerId, { playerId, teamId: events.find(event => event.type === 'sub')?.teamId ?? '', position: 'CM' as Position, role: 'starter' as const }]))
  const actions: TacticalAction[] = ordered.flatMap(({ event }, index) => event.type === 'sub' ? [{ minute: event.minute, order: index, index, event }] : [])
  const legacyMoveMinutes = new Set(actions.map(action => action.minute))
  let index = actions.length
  for (const [playerId, changes] of Object.entries(histories)) for (const change of changes) {
    if (!Number.isFinite(change.minute) || (!change.tacticalSlotId && !legacyMoveMinutes.has(change.minute))) continue
    actions.push({ minute: change.minute, order: positionChangeOrder(change, appearances[playerId], ordered, rank), index: index++, change, playerId })
  }
  actions.sort((a, b) => a.minute - b.minute || a.order - b.order || (a.change?.sequence ?? Infinity) - (b.change?.sequence ?? Infinity) || a.index - b.index)
  const matchingSlots = (position: Position) => Object.keys(positions).filter(slot => positions[slot] === position).sort((a, b) => Number(b === position) - Number(a === position))
  for (const action of actions) {
    if (moment && (action.minute > moment.minute! || (action.minute === moment.minute && action.order >= momentRank))) break
    if (action.event) {
      const event = action.event
      const oldSlot = Object.keys(slots).find(slot => slots[slot] === event.playerOutId)
      if (!oldSlot) throw new Error('This change conflicts with a later substitution.')
      const exact = event.tacticalSlotId && positions[event.tacticalSlotId] === event.position ? event.tacticalSlotId : undefined
      const target = exact ?? (positions[oldSlot] === event.position ? oldSlot : matchingSlots(event.position).find(slot => !slots[slot]))
      if (!target) throw new Error('No available tactical slot for this substitution.')
      const displaced = slots[target]
      delete slots[oldSlot]
      slots[target] = event.playerInId
      if (displaced && target !== oldSlot) slots[oldSlot] = displaced
    } else if (action.change && action.playerId) {
      const { change, playerId } = action
      const oldSlot = Object.keys(slots).find(slot => slots[slot] === playerId)
      if (!oldSlot) throw new Error('This change conflicts with a position change.')
      const exact = change.tacticalSlotId && positions[change.tacticalSlotId] === change.position ? change.tacticalSlotId : undefined
      if (!exact && positions[oldSlot] === change.position) continue
      const target = exact ?? matchingSlots(change.position).find(slot => !slots[slot]) ?? matchingSlots(change.position)[0]
      if (!target) throw new Error('Unknown tactical position.')
      if (target === oldSlot) continue
      const displaced = slots[target]
      delete slots[oldSlot]
      slots[target] = playerId
      if (displaced) slots[oldSlot] = displaced
    }
  }
  return slots
}

export function tacticalPreviewSlots(assignments: Record<string, string>, teamId: string): Best11Slot[] {
  return Object.entries(assignments).flatMap(([slot, playerId]) => {
    const definition = tacticalSlotById[slot]
    return definition && playerId ? [{ slot, playerId, teamId, position: definition.ratingPosition, matchPosition: definition.ratingPosition, displayPosition: definition.displayPosition, x: definition.x, y: definition.y, avgRating: 0, matches: 0 }] : []
  })
}

/** The event must be present in match.events so saved sequence and array order
 * are interpreted by the same canonical timeline as ratings and stats. */
export function eligibleAtEvent(match: Match, event: MatchEvent): Appearance[] {
  return match.appearances.filter(appearance => isOnPitchAtEvent(match, appearance, event))
}

/** Edit projections preserve the original event's array slot and optional
 * sequence. New events receive the same next sequence used when saving. */
export function previewGoalEvent(match: Match, histories: Record<string, PositionChange[]>, minute: number, teamId: string, editingEventId?: string | null): { match: Match; event: MatchEvent } {
  const original = editingEventId ? match.events.find(event => event.id === editingEventId) : undefined
  const event: MatchEvent = {
    id: original?.id ?? `new-goal-preview:${match.events.length}`, type: 'goal', minute, teamId,
    ...(original ? original.sequence === undefined ? {} : { sequence: original.sequence } : { sequence: nextTimelineSequence(match.events, histories) }),
  }
  const events = original ? match.events.map(row => row === original ? event : row) : [...match.events, event]
  return { match: { ...match, events }, event }
}
