import type { Appearance, Match } from '../types'
import { pitchWindow } from '../engine/rating.ts'
import { newestMatches } from '../engine/matchChronology'

export function recentMatches(matches: Match[]): Match[] {
  return newestMatches(matches)
}

export function recentMatchPositions(match: Match, appearance: Appearance): string {
  const window = pitchWindow(match, appearance)
  const on = match.events.find(event => event.type === 'sub' && event.teamId === appearance.teamId && event.playerInId === appearance.playerId)
  let position = appearance.role === 'bench' && on?.type === 'sub' ? on.position : appearance.matchPosition
  if (!window) return position || '-'

  const changes = [...new Map((appearance.positionHistory ?? [])
    .filter(change => Number.isFinite(change.minute) && change.minute >= 0 && change.minute < window.exit)
    .map(change => [change.minute, change.position])).entries()].sort((a, b) => a[0] - b[0])
  for (const [minute, next] of changes) {
    if (minute <= window.enter) position = next
  }
  const positions = position ? [position] : []
  for (const [minute, next] of changes) {
    if (minute > window.enter && positions[positions.length - 1] !== next) positions.push(next)
  }
  return positions.join(' → ') || '-'
}
