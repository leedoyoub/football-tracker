/** A single product-wide definition of a positive player performance. */
export const GOOD_RATING_THRESHOLD = 7.2

export function isGoodRating(rating: number | null | undefined): boolean {
  // Classify floating-point results such as 7.1 + 0.1 without altering raw ratings.
  return typeof rating === 'number' && Number.isFinite(rating) &&
    (rating >= GOOD_RATING_THRESHOLD || GOOD_RATING_THRESHOLD - rating <= Number.EPSILON * 8)
}
