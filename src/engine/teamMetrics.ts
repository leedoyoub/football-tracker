import type { Match, Team } from '../types'
import { matchScore } from './rating'
import { opponentSot, teamGoalkeeperSaves } from './opponentSot'

function newestMatches(matches: Match[]) {
  return [...matches].sort((left, right) => right.date.localeCompare(left.date) || right.matchDay - left.matchDay)
}

/** Raw team facts for Records and Insights. Opponent SOT is canonical; saves
 * remain their own event-derived statistic. */
export function teamMetrics(team: Team, matches: Match[]) {
  const games = newestMatches(matches.filter(match => match.homeTeamId === team.id || match.awayTeamId === team.id))
  let wins = 0; let goals = 0; let conceded = 0; let cleanSheets = 0; let saves = 0; let opponentSotTotal = 0
  const form = games.map(match => {
    const score = matchScore(match)
    const ours = match.homeTeamId === team.id ? score.home : score.away
    const theirs = match.homeTeamId === team.id ? score.away : score.home
    wins += Number(ours > theirs); goals += ours; conceded += theirs; cleanSheets += Number(theirs === 0)
    saves += teamGoalkeeperSaves(match, team.id); opponentSotTotal += opponentSot(match, team.id)
    return ours > theirs ? 'W' : ours === theirs ? 'D' : 'L'
  })
  return { games, wins, goals, conceded, cleanSheets, saves, opponentSot: opponentSotTotal, form: form.slice(0, 5) }
}
