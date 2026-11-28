import type { Match, Team } from '../types'
import { opponentSot, teamGoalkeeperSaves } from './opponentSot'
import { teamRecordedMatchFacts } from './teamHistoricMatches'
import { oldestMatches } from './matchChronology'
import { longestMatchStreaks } from './matchStreaks'

/** Raw team facts for Records and Insights. Opponent SOT is canonical; saves
 * remain their own event-derived statistic. */
export function teamMetrics(team: Team, matches: Match[]) {
  const rows = teamRecordedMatchFacts(matches).byTeam.get(team.id) ?? []
  const games = rows.map(row => row.match).reverse()
  let wins = 0, draws = 0, losses = 0, goals = 0, conceded = 0, cleanSheets = 0, saves = 0, opponentSotTotal = 0, openingGoals = 0, comebackWins = 0
  for (const { match, outcome, goalsFor, goalsAgainst, openingGoal, comebackDeficit } of rows) {
    wins += Number(outcome === 'W'); draws += Number(outcome === 'D'); losses += Number(outcome === 'L')
    goals += goalsFor; conceded += goalsAgainst; cleanSheets += Number(goalsAgainst === 0)
    openingGoals += Number(openingGoal); comebackWins += Number(comebackDeficit > 0)
    saves += teamGoalkeeperSaves(match, team.id); opponentSotTotal += opponentSot(match, team.id)
  }
  // Preserve the historical Records ordering of indistinguishable legacy games.
  const byMatch = new Map(rows.map(row => [row.match, row]))
  const chronological = oldestMatches(games).map(match => byMatch.get(match)!)
  const runs = {
    winning: longestMatchStreaks(chronological, row => row.outcome === 'W'),
    unbeaten: longestMatchStreaks(chronological, row => row.outcome !== 'L'),
    scoring: longestMatchStreaks(chronological, row => row.goalsFor > 0),
    cleanSheet: longestMatchStreaks(chronological, row => row.goalsAgainst === 0),
    losing: longestMatchStreaks(chronological, row => row.outcome === 'L'),
    winless: longestMatchStreaks(chronological, row => row.outcome !== 'W'),
  }
  const streakKeys = Object.keys(runs) as (keyof typeof runs)[]
  const streaks = Object.fromEntries(streakKeys.map(key => [key, runs[key].length])) as Record<keyof typeof runs, number>
  const streakMatchIds = Object.fromEntries(streakKeys.map(key => [key, runs[key].matchIds])) as Record<keyof typeof runs, string[][]>
  const played = rows.length
  return { games, played, wins, draws, losses, goals, conceded, goalDifference: goals - conceded, cleanSheets, saves, opponentSot: opponentSotTotal,
    winRate: played ? wins / played * 100 : 0, ppg: played ? (wins * 3 + draws) / played : 0,
    openingGoals, comebackWins, streaks, streakMatchIds, form: rows.slice(-5).reverse().map(row => row.outcome) }
}
