import type { MatchEvent, Position, PositionChange } from '../types'
import type { Lineup } from './matchLineup'
import { isOnPitchAtEvent, orderedEvents } from '../engine/timeline'

// Rebuild a draft after an event correction; reject edits that orphan later events.
export function rebuildLiveHistory(starters: Record<string, string>, roster: string[], events: MatchEvent[], histories: Record<string, PositionChange[]>, positions: Record<string, Position>) {
  const slots = { ...starters }
  const matchingSlots = (position: Position) => Object.keys(positions).filter(slot => positions[slot] === position).sort((a, b) => Number(b === position) - Number(a === position))
  const entered = new Set(Object.values(starters))
  const enteredAt = new Map<string, number>()
  const teamId = events.find(event => event.type === 'sub')?.teamId ?? events[0]?.teamId ?? ''
  const timelineMatch = { id: 'preview', season: '', matchDay: 0, date: '', duration: 90, homeTeamId: '', awayTeamId: '', events, appearances: roster.map(playerId => ({ playerId, teamId, role: Object.values(starters).includes(playerId) ? 'starter' as const : 'bench' as const, position: positions[Object.keys(starters).find(slot => starters[slot] === playerId) ?? ''] ?? 'CM' as Position, positionHistory: histories[playerId] })) }
  const subs = orderedEvents(timelineMatch).flatMap(({ event }) => event.type === 'sub' ? [event] : [])
  const positionHistories = Object.fromEntries(Object.entries(histories).map(([id, changes]) => [id, changes.filter(c => subs.some(e => e.minute === c.minute))]))
  const minutes = [...new Set(events.flatMap(e => e.minute === undefined ? [] : [e.minute]))].sort((a, b) => a - b)
  for (const minute of minutes) {
    for (const event of subs.filter(e => e.minute === minute)) {
      const oldSlot = Object.keys(slots).find(slot => slots[slot] === event.playerOutId)
      if (!oldSlot || enteredAt.get(event.playerOutId) === minute || entered.has(event.playerInId) || !roster.includes(event.playerInId) || minute < 0 || minute > 99) throw new Error('This change conflicts with a later substitution.')
      delete slots[oldSlot]
      const target = positions[oldSlot] === event.position ? oldSlot : matchingSlots(event.position).find(slot => !slots[slot])
      if (!target) throw new Error('No available tactical slot for this substitution.')
      slots[target] = event.playerInId
      entered.add(event.playerInId)
      enteredAt.set(event.playerInId, minute)
    }
    for (const [id, history] of Object.entries(positionHistories)) {
      const change = history.find(c => c.minute === minute)
      if (!change) continue
      const old = Object.keys(slots).find(slot => slots[slot] === id)
      if (!old) throw new Error('This change conflicts with a position change.')
      if (positions[old] === change.position) continue
      const target = matchingSlots(change.position).find(slot => !slots[slot]) ?? matchingSlots(change.position)[0]
      if (!target) throw new Error('Unknown tactical position.')
      const other = slots[target]; delete slots[old]; slots[target] = id
      if (other) slots[old] = other
    }
    for (const event of events.filter(e => e.type === 'goal' && e.minute === minute)) {
      if (event.type !== 'goal') continue
      if ([event.playerId, event.assistPlayerId, event.concededGoalCausePlayerId].some(id => {
        if (!id) return false
        const appearance = timelineMatch.appearances.find(row => row.playerId === id)
        return !appearance || !isOnPitchAtEvent(timelineMatch, appearance, event)
      })) throw new Error('A goal or fault player is off the pitch at this time. Edit that event first.')
      if (event.playerId && event.playerId === event.assistPlayerId) throw new Error('Scorer cannot assist their own goal.')
    }
  }
  const lineup: Lineup = { slotAssignments: slots, homeBench: roster.filter(id => !Object.values(slots).includes(id)) }
  return { ...lineup, events, positionHistories }
}
