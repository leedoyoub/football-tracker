import type { Standing } from '../engine/standings'

export type StandingMetric = 'played' | 'wins' | 'draws' | 'losses' | 'goalsFor' | 'goalsAgainst' | 'goalDifference' | 'points'
export type StandingSort = { metric: StandingMetric; direction: 'asc' | 'desc' } | null

export function nextStandingSort(current: StandingSort, metric: StandingMetric | 'rank'): StandingSort {
  if (metric === 'rank') return null
  const direction = current?.metric === metric
    ? current.direction === 'asc' ? 'desc' : 'asc'
    : metric === 'losses' || metric === 'goalsAgainst' ? 'asc' : 'desc'
  return { metric, direction }
}

/** Presentation only: preserve original facts, official ranks and source order. */
export function projectStandings<T extends Standing>(rows: readonly T[], sort: StandingSort): T[] {
  return sort ? rows.slice().sort((left, right) => (sort.direction === 'asc' ? left[sort.metric] - right[sort.metric] : right[sort.metric] - left[sort.metric]) || left.rank - right.rank) : rows.slice()
}

export function standingAriaSort(sort: StandingSort, ...metrics: StandingMetric[]): 'ascending' | 'descending' | 'none' {
  return sort && metrics.includes(sort.metric) ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'
}
