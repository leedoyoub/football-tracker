import type { Match, Team } from '../types'
import { opponentSot, teamGoalkeeperSaves } from './opponentSot'
import { newestMatches } from './matchChronology'
import { teamsCreditedWithResult, teamPerspectiveScore } from './matchPerspective'

/** Raw team facts for Records and Insights. Opponent SOT is canonical; saves
 * remain their own event-derived statistic. */
export function teamMetrics(team: Team, matches: Match[]) {
  const games = newestMatches(matches.filter(match => teamsCreditedWithResult(match).includes(team.id)))
  let wins = 0; let goals = 0; let conceded = 0; let cleanSheets = 0; let saves = 0; let opponentSotTotal = 0
  const form = games.map(match => {
    const perspective = teamPerspectiveScore(match, team.id)!
    wins += Number(perspective.outcome === 'W'); goals += perspective.goalsFor; conceded += perspective.goalsAgainst; cleanSheets += Number(perspective.goalsAgainst === 0)
    saves += teamGoalkeeperSaves(match, team.id); opponentSotTotal += opponentSot(match, team.id)
    return perspective.outcome
  })
  return { games, wins, goals, conceded, cleanSheets, saves, opponentSot: opponentSotTotal, form: form.slice(0, 5) }
}
