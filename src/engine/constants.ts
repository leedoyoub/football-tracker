/** A single product-wide definition of a positive player performance. */
export const GOOD_RATING_THRESHOLD = 7.2

export function isGoodRating(rating: number | null | undefined): boolean {
  return typeof rating === 'number' && Number.isFinite(rating) && rating >= GOOD_RATING_THRESHOLD
}
