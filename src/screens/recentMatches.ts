import type { Appearance, Match } from '../types'
import { pitchWindow } from '../engine/rating.ts'
import { newestMatches } from '../engine/matchChronology'
import { orderedPositionChanges } from '../engine/timeline'

export function recentMatches(matches: Match[]): Match[] {
  return newestMatches(matches)
}

export function recentMatchPositions(match: Match, appearance: Appearance): string {
  const window = pitchWindow(match, appearance)
  const on = match.events.find(event => event.type === 'sub' && event.teamId === appearance.teamId && event.playerInId === appearance.playerId)
  let position = appearance.role === 'bench' && on?.type === 'sub' ? on.position : appearance.matchPosition
  if (!window) return position || '-'

  const changes = orderedPositionChanges(appearance, match.events)
    .filter(change => Number.isFinite(change.minute) && change.minute >= 0 && change.minute < window.exit)
  for (const change of changes) {
    if (appearance.role !== 'bench' && change.minute <= window.enter) position = change.position
  }
  const positions = position ? [position] : []
  for (const change of changes) {
    const afterEntry = change.minute > window.enter || (appearance.role === 'bench' && change.minute === window.enter && (!on || !Number.isFinite(change.sequence) || !Number.isFinite(on.sequence) || change.sequence! > on.sequence!))
    if (afterEntry && positions[positions.length - 1] !== change.position) positions.push(change.position)
  }
  return positions.join(' → ') || '-'
}
