import type { Match } from '../types.ts'

function parsedTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  if (typeof value === 'string' && !value.trim()) return undefined
  const numeric = Number(value)
  const parsed = Number.isFinite(numeric) ? numeric * (Math.abs(numeric) < 1e12 ? 1000 : 1) : Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : undefined
}

function timestamp(match: Match): number | undefined {
  const metadata = match as Match & { playedAt?: unknown; createdAt?: unknown; timestamp?: unknown }
  for (const value of [metadata.playedAt, metadata.createdAt, metadata.timestamp]) {
    const time = parsedTimestamp(value)
    if (time !== undefined) return time
  }
  const value = match.date?.trim()
  if (!value) return undefined
  return parsedTimestamp(value.length === 10 ? `${value}T00:00:00` : value)
}

/** Oldest-first comparator. Date is authoritative; stable tie breakers make
 * imports and same-day matches deterministic without using cross-competition MD. */
export function compareMatchChronology(left: Match, right: Match): number {
  const leftTime = timestamp(left); const rightTime = timestamp(right)
  if (leftTime !== undefined && rightTime !== undefined && leftTime !== rightTime) return leftTime - rightTime
  if (leftTime !== undefined && rightTime === undefined) return 1
  if (leftTime === undefined && rightTime !== undefined) return -1
  const season = left.season.localeCompare(right.season)
  if (season) return season
  return left.id.localeCompare(right.id)
}

export function newestMatches(matches: Match[]): Match[] { return matches.slice().sort((left, right) => compareMatchChronology(right, left)) }
