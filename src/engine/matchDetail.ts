import type { Appearance, RatingBreakdown } from '../types'

/** Presentation ordering only. Ratings come from the caller's canonical
 * `rateMatch` pass; this helper never recalculates them. */
export function orderMatchDetailAppearances<T extends Pick<Appearance, 'playerId'>>(
  appearances: T[],
  ratings: Record<string, Pick<RatingBreakdown, 'raw'> | undefined>,
): T[] {
  return appearances.slice().sort((left, right) => {
    const leftRating = ratings[left.playerId]
    const rightRating = ratings[right.playerId]
    if (leftRating && !rightRating) return -1
    if (!leftRating && rightRating) return 1
    if (leftRating && rightRating && leftRating.raw !== rightRating.raw) return rightRating.raw - leftRating.raw
    return left.playerId.localeCompare(right.playerId)
  })
}
