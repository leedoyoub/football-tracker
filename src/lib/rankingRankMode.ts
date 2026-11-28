import type { RankingRankMode } from '../types'

const RANKING_RANK_MODE_KEY = 'football-tracker-ranking-rank-mode'
let rankingRankMode: RankingRankMode = 'filtered'

export function loadRankingRankMode(): RankingRankMode {
  if (typeof window === 'undefined') return 'filtered'
  try {
    return window.localStorage.getItem(RANKING_RANK_MODE_KEY) === 'overall' ? 'overall' : 'filtered'
  } catch {
    return rankingRankMode
  }
}

export function saveRankingRankMode(mode: RankingRankMode) {
  rankingRankMode = mode
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RANKING_RANK_MODE_KEY, mode)
  } catch {
    // Keep the preference in memory when device storage is unavailable.
  }
}
