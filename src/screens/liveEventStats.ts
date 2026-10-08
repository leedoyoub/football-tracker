import type { MatchEvent } from '../types'

/** One pass over committed goals, then the uncommitted preview contribution. */
export function liveGoalAssistCounts(events: MatchEvent[], editingEventId: string | null, pendingScorerId?: string, pendingAssistId?: string): Map<string, { goals: number; assists: number }> {
  const counts = new Map<string, { goals: number; assists: number }>()
  const add = (id: string | undefined, kind: 'goals' | 'assists') => {
    if (!id) return
    const row = counts.get(id) ?? { goals: 0, assists: 0 }
    row[kind]++
    counts.set(id, row)
  }
  for (const event of events) {
    if (event.id === editingEventId || event.type !== 'goal') continue
    add(event.playerId, 'goals')
    add(event.assistPlayerId, 'assists')
  }
  add(pendingScorerId, 'goals')
  add(pendingAssistId, 'assists')
  return counts
}
