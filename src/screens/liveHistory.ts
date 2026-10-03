import type { MatchEvent, Position, PositionChange } from '../types'
import type { Lineup } from './matchLineup'
import { isOnPitchAtEvent, orderedEvents } from '../engine/timeline'
import { tacticalAssignmentsAtMoment } from '../engine/tacticalHistory'

// Rebuild a draft after an event correction; reject edits that orphan later events.
export function rebuildLiveHistory(starters: Record<string, string>, roster: string[], events: MatchEvent[], histories: Record<string, PositionChange[]>, positions: Record<string, Position>) {
  const entered = new Set(Object.values(starters))
  const enteredAt = new Map<string, number>()
  const teamId = events.find(event => event.type === 'sub')?.teamId ?? events[0]?.teamId ?? ''
  const timelineMatch = { id: 'preview', season: '', matchDay: 0, date: '', duration: 90, homeTeamId: '', awayTeamId: '', events, appearances: roster.map(playerId => ({ playerId, teamId, role: Object.values(starters).includes(playerId) ? 'starter' as const : 'bench' as const, position: positions[Object.keys(starters).find(slot => starters[slot] === playerId) ?? ''] ?? 'CM' as Position, positionHistory: histories[playerId] })) }
  const subs = orderedEvents(timelineMatch).flatMap(({ event }) => event.type === 'sub' ? [event] : [])
  const positionHistories = Object.fromEntries(Object.entries(histories).map(([id, changes]) => [id, changes.filter(c => c.tacticalSlotId || subs.some(e => e.minute === c.minute))]))
  for (const event of subs) {
    if (enteredAt.get(event.playerOutId) === event.minute || entered.has(event.playerInId) || !roster.includes(event.playerInId) || event.minute < 0 || event.minute > 99) throw new Error('This change conflicts with a later substitution.')
    entered.add(event.playerInId)
    enteredAt.set(event.playerInId, event.minute)
  }
  const slots = tacticalAssignmentsAtMoment(starters, events, positionHistories, positions)
  for (const event of events) {
    if (event.type === 'goal') {
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
