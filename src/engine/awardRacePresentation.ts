import type { AwardCandidate } from './awardRules'
import { rankAwardCandidates } from './awardRules'

/** A race is a player leaderboard; official award candidates retain team stints. */
export function awardRaceCandidates(candidates: AwardCandidate[]): AwardCandidate[] {
  const seen = new Set<string>()
  return rankAwardCandidates(candidates, 'cumulative').filter(candidate => {
    if (seen.has(candidate.playerId)) return false
    seen.add(candidate.playerId)
    return true
  })
}
