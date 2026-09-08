import type { Appearance, Match } from '../types'
import { pitchWindow } from '../engine/rating'

function matchTimestamp(match: Match): number | undefined {
  const metadata = match as Match & { playedAt?: unknown; createdAt?: unknown; timestamp?: unknown }
  for (const value of [metadata.playedAt, metadata.createdAt, metadata.timestamp]) {
    if (typeof value !== 'string' && typeof value !== 'number') continue
    if (typeof value === 'string' && !value.trim()) continue
    const numeric = Number(value)
    const time = Number.isFinite(numeric)
      ? numeric * (Math.abs(numeric) < 1e12 ? 1000 : 1)
      : Date.parse(String(value))
    if (Number.isFinite(time)) return time
  }
}

export function recentMatches(matches: Match[]): Match[] {
  // The store appends new matches and edits them in place. Preserve that order
  // for legacy records without timestamps, including ties and mixed imports.
  const newestFirst = [...matches].reverse()
  const dated = newestFirst.flatMap(match => {
    const time = matchTimestamp(match)
    return time === undefined ? [] : [{ match, time }]
  }).sort((a, b) => b.time - a.time)
  let datedIndex = 0
  return newestFirst.map(match => matchTimestamp(match) === undefined ? match : dated[datedIndex++].match)
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
    if (minute > window.enter && positions.at(-1) !== next) positions.push(next)
  }
  return positions.join(' → ') || '-'
}
