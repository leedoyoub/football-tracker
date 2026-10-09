import { isGoodRating } from '../engine/constants'

/** Plot geometry is shared by player trends and League position history. */
export const TREND_POINT_SPACING = 30

export function trendPlotWidth(pointCount: number): number {
  return Math.max(300, 36 + Math.max(0, pointCount - 1) * TREND_POINT_SPACING)
}

export function scrollTrendToLatest(viewport: { scrollLeft: number; scrollWidth: number } | null): void {
  if (viewport) viewport.scrollLeft = viewport.scrollWidth
}

export function positionHistoryLabelVisible(teamCount: number, focusedTeamId: string | null, seriesTeamId: string, pointIndex: number, pointCount: number): boolean {
  return teamCount === 1 || focusedTeamId === seriesTeamId || pointIndex === pointCount - 1
}

export function recentFormLabelColor(rating: number, isMom: boolean): string {
  if (isMom) return '#60a5fa'
  if (isGoodRating(rating)) return '#34d399'
  if (rating >= 6) return '#fb923c'
  return '#f87171'
}
