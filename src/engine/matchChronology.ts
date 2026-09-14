import type { Match } from '../types.ts'

function parsedTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  if (typeof value === 'string' && !value.trim()) return undefined
  const numeric = Number(value)
  const parsed = Number.isFinite(numeric) ? numeric * (Math.abs(numeric) < 1e12 ? 1000 : 1) : Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : undefined
}

function actualTimestamp(match: Match): number | undefined {
  const metadata = match as Match & { playedAt?: unknown; createdAt?: unknown; timestamp?: unknown }
  for (const value of [metadata.playedAt, metadata.createdAt, metadata.timestamp]) {
    const time = parsedTimestamp(value)
    if (time !== undefined) return time
  }
}

export function matchDateTimestamp(match: Match): number | undefined {
  const value = match.date?.trim()
  if (!value) return undefined
  return parsedTimestamp(value.length === 10 ? `${value}T00:00:00` : value)
}

/** Oldest-first comparator. Date is authoritative; stable tie breakers make
 * imports and same-day matches deterministic without using cross-competition MD. */
export function compareMatchChronology(left: Match, right: Match): number {
  const leftDate = matchDateTimestamp(left); const rightDate = matchDateTimestamp(right)
  if (leftDate !== undefined && rightDate !== undefined && leftDate !== rightDate) return leftDate - rightDate
  if (leftDate !== undefined && rightDate === undefined) return 1
  if (leftDate === undefined && rightDate !== undefined) return -1
  const leftActual = actualTimestamp(left); const rightActual = actualTimestamp(right)
  if (leftActual !== undefined && rightActual !== undefined && leftActual !== rightActual) return leftActual - rightActual
  if (leftActual !== undefined && rightActual === undefined) return 1
  if (leftActual === undefined && rightActual !== undefined) return -1
  return left.id.localeCompare(right.id)
}

export function newestMatches(matches: Match[]): Match[] { return matches.slice().sort((left, right) => compareMatchChronology(right, left)) }
