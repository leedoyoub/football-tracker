import type { Match } from '../types.ts'

function parsedTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  if (typeof value === 'string' && !value.trim()) return undefined
  const numeric = Number(value)
  const parsed = Number.isFinite(numeric) ? numeric * (Math.abs(numeric) < 1e12 ? 1000 : 1) : Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : undefined
}

function recordingTimestamp(match: Match): number | undefined {
  const metadata = match as Match & { playedAt?: unknown; createdAt?: unknown; timestamp?: unknown }
  for (const value of [match.recordedAt, metadata.playedAt, metadata.createdAt, metadata.timestamp]) {
    const time = parsedTimestamp(value)
    if (time !== undefined) return time
  }
}

export function matchDateTimestamp(match: Match): number | undefined {
  const value = match.date?.trim()
  if (!value) return undefined
  return parsedTimestamp(value.length === 10 ? `${value}T00:00:00` : value)
}

/** Oldest-first semantic chronology. Date is authoritative and creation data
 * only decides records on the same calendar day. */
function compareSemanticChronology(left: Match, right: Match): number {
  const leftDate = matchDateTimestamp(left); const rightDate = matchDateTimestamp(right)
  if (leftDate !== undefined && rightDate !== undefined && leftDate !== rightDate) return leftDate - rightDate
  if (leftDate !== undefined && rightDate === undefined) return 1
  if (leftDate === undefined && rightDate !== undefined) return -1
  const leftActual = recordingTimestamp(left); const rightActual = recordingTimestamp(right)
  if (leftActual !== undefined && rightActual !== undefined && leftActual !== rightActual) return leftActual - rightActual
  if (leftActual !== undefined && rightActual === undefined) return 1
  if (leftActual === undefined && rightActual !== undefined) return -1
  return 0
}

/** Public comparator keeps a deterministic id fallback for callers sorting two standalone records. */
export function compareMatchChronology(left: Match, right: Match): number {
  return compareSemanticChronology(left, right) || left.id.localeCompare(right.id)
}

/**
 * Array position is used only for indistinguishable legacy records. Later
 * persisted entries are newer; UUID text never outranks known insertion order.
 */
export function newestMatches(matches: Match[]): Match[] {
  return matches.map((match, index) => ({ match, index })).sort((left, right) => {
    const semantic = compareSemanticChronology(right.match, left.match)
    return semantic || right.index - left.index || right.match.id.localeCompare(left.match.id)
  }).map(({ match }) => match)
}

/** Oldest-first companion for streaks and aggregate form calculation. */
export function oldestMatches(matches: Match[]): Match[] {
  return matches.map((match, index) => ({ match, index })).sort((left, right) => {
    const semantic = compareSemanticChronology(left.match, right.match)
    return semantic || left.index - right.index || left.match.id.localeCompare(right.match.id)
  }).map(({ match }) => match)
}
