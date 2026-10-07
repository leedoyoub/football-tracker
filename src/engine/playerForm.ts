import type { DerivedAppearance } from './playerDerived'
import { newestMatches } from './matchChronology'

/** The caller supplies the selected season and competition's actual appearances. */
export function playerForm(appearances: Pick<DerivedAppearance, 'match' | 'rating'>[]) {
  const byMatch = new Map(appearances.map(row => [row.match, row]))
  const newest = newestMatches(appearances.map(row => row.match)).map(match => byMatch.get(match)!)
  const recent = newest.slice(0, 5)
  const average = appearances.length ? appearances.reduce((sum, row) => sum + row.rating.raw, 0) / appearances.length : null
  const recentAverage = recent.length ? recent.reduce((sum, row) => sum + row.rating.raw, 0) / recent.length : null
  return { count: recent.length, recent, points: newest.slice(0, 10).reverse(), average, recentAverage, delta: average === null || recentAverage === null ? null : recentAverage - average }
}
