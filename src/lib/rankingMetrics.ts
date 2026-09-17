import type { LeaderboardMetric } from '../engine/stats'

// The four ranking surfaces deliberately share this public metric contract.
// Keep its order stable: it is the order users swipe through on every surface.
export const RANKING_METRICS = [
  { value: 'rating', label: 'Rating' },
  { value: 'goals', label: 'Goals' },
  { value: 'assists', label: 'Assists' },
  { value: 'g+a', label: 'G+A' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'mom', label: 'MOM' },
  { value: 'goals/90', label: 'Goals/90' },
  { value: 'assists/90', label: 'Assists/90' },
  { value: 'g+a/90', label: 'G+A/90' },
  { value: 'cleanSheets', label: 'Clean Sheets' },
  { value: 'saves', label: 'Saves' },
  { value: 'savePercentage', label: 'Save %' },
] as const satisfies readonly { value: LeaderboardMetric; label: string }[]

export type RankingDisplayMetric = typeof RANKING_METRICS[number]['value']

export function formatRankingMetricValue(metric: LeaderboardMetric, value: number) {
  return `${value.toFixed(metric === 'rating' || metric.includes('/') ? 2 : 0)}${metric === 'savePercentage' ? '%' : ''}`
}
