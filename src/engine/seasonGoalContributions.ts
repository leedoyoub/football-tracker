import type { CompetitionType, Match, Player } from '../types'
import { matchCompetitionType } from './competitionContext'
import { playerAssistEvents, playerGoalEvents } from './playerMatchFacts'
import { RATING_ENGINE_REVISION } from './ratingRevision'
type Counts = { goals: number; assists: number }
const cache = new WeakMap<Match[], Map<string, Map<string, Counts>>>()
/** Editor badges need raw valid goal/assist counts, not ratings, MOM or defence. */
export function seasonGoalContributions(players: Player[], matches: Match[], season: string, teamId: string, type: CompetitionType): Record<string, Counts> {
  let scopes = cache.get(matches); if (!scopes) { scopes = new Map(); cache.set(matches, scopes) }
  const key = `${RATING_ENGINE_REVISION}:${season}:${teamId}:${type}`
  let counts = scopes.get(key)
  if (!counts) {
    counts = new Map()
    for (const match of matches) {
      if (match.season !== season || matchCompetitionType(match) !== type) continue
      const members = new Set(match.appearances.filter(a => a.teamId === teamId).map(a => a.playerId))
      for (const id of members) {
        const appearance = match.appearances.find(a => a.playerId === id)!
        const row = counts.get(id) ?? { goals: 0, assists: 0 }
        row.goals += playerGoalEvents(match, appearance).length; row.assists += playerAssistEvents(match, appearance).length
        counts.set(id, row)
      }
    }
    if (scopes.size >= 32) scopes.delete(scopes.keys().next().value!)
    scopes.set(key, counts)
  }
  return Object.fromEntries(players.map(player => [player.id, { ...(counts.get(player.id) ?? { goals: 0, assists: 0 }) }]))
}
