import type { LeaderboardMetric } from '../engine/stats'
import type { CompetitionType } from '../types'

// The four ranking surfaces deliberately share this public metric contract.
// Keep its order stable: it is the order users swipe through on every surface.
export const RANKING_METRICS = [
  { value: 'rating', label: 'Rating' },
  { value: 'goals', label: 'Goals' },
  { value: 'assists', label: 'Assists' },
  { value: 'g+a', label: 'G+A' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'mom', label: 'MOM' },
  { value: 'goodMatches', label: '7.2+ Matches' },
  { value: 'goals/90', label: 'Goals/90' },
  { value: 'assists/90', label: 'Assists/90' },
  { value: 'g+a/90', label: 'G+A/90' },
  { value: 'sotAllowed', label: 'SOT Allowed/90' },
  { value: 'defenderGaPer90', label: 'Defender GA/90' },
  { value: 'cleanSheets', label: 'Clean Sheets' },
  { value: 'saves', label: 'Saves' },
  { value: 'goalkeeperGaPer90', label: 'GK GA/90' },
  { value: 'savePercentage', label: 'Qualifying GK Save %' },
] as const satisfies readonly { value: LeaderboardMetric; label: string }[]

export type RankingDisplayMetric = typeof RANKING_METRICS[number]['value']

export type RankingTitleScope = CompetitionType | 'all'

export function rankingTitle(scope: RankingTitleScope, teamScoped = false) {
  if (teamScoped) return 'Team Ranking'
  if (scope === 'all') return 'Global Ranking'
  return `${scope === 'league' ? 'League' : scope === 'cup' ? 'Cup' : 'Champions'} Ranking`
}

export function formatRankingMetricValue(metric: LeaderboardMetric, value: number) {
  const decimals = metric === 'rating' || metric.includes('/') || metric === 'sotAllowed' || metric === 'defenderGaPer90' || metric === 'goalkeeperGaPer90' ? 2 : 0
  return `${value.toFixed(decimals)}${metric === 'savePercentage' ? '%' : ''}`
}
