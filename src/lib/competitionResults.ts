import type { CompetitionType, Match, Team } from '../types'
import { competitionMatches } from '../engine/competition'
import { competitionIdentityForMatch, competitionContextParts } from '../engine/competitionContext'
import { isRecordedForTeam } from '../engine/matchPerspective'
import { derivedResults, isCompletedRecordedMatch, type DerivedResult } from './results'

export type MatchFilters = { teamId: string | null; period: string | null }
const cache = new WeakMap<Match[], WeakMap<Team[], Map<string, DerivedResult[]>>>()

export function competitionResultIndex(matches: Match[], teams: Team[], season: string, type: CompetitionType): DerivedResult[] {
  let byTeams = cache.get(matches); if (!byTeams) { byTeams = new WeakMap(); cache.set(matches, byTeams) }
  let byScope = byTeams.get(teams); if (!byScope) { byScope = new Map(); byTeams.set(teams, byScope) }
  const key = `${season}:${type}`
  let rows = byScope.get(key)
  if (!rows) { rows = derivedResults(competitionMatches(matches, season, type).filter(isCompletedRecordedMatch), teams); byScope.set(key, rows) }
  return rows
}

export function competitionResults(matches: Match[], teams: Team[], season: string, type: CompetitionType, filters: MatchFilters): DerivedResult[] {
  return competitionResultIndex(matches, teams, season, type).filter(result => {
    if (filters.teamId && (result.teamId !== filters.teamId || !isRecordedForTeam(result.match, filters.teamId))) return false
    const identity = competitionIdentityForMatch(result.match)
    return !filters.period || (type === 'league' ? String(identity.matchDay) : identity.stage) === filters.period
  })
}

/** First recording order is independent of edited dates and updatedAt. Legacy
 * records keep their insertion slots; known timestamps sort within known slots. */
export function leagueMatchdayResults(matches: Match[], teams: Team[], season: string, day: number): DerivedResult[] {
  const selected = [...new Map(competitionMatches(matches, season, 'league').filter(match => isCompletedRecordedMatch(match) && competitionIdentityForMatch(match).matchDay === day).map(match => [match.id, match])).values()]
  const known = selected.filter(match => Number.isFinite(match.recordedAt)).sort((a, b) => a.recordedAt! - b.recordedAt!)
  let next = 0
  const ordered = selected.map(match => Number.isFinite(match.recordedAt) ? known[next++] : match)
  const byId = new Map(derivedResults(selected, teams).map(result => [result.match.id, result]))
  return ordered.map(match => byId.get(match.id)!)
}

/** Shared canonical formatter for full result cards, with safe legacy labels. */
export function resultCompetitionLabel(match: Match): string {
  const identity = competitionIdentityForMatch(match)
  const parts = competitionContextParts(identity)
  const name = identity.competitionType === 'league' ? 'League' : identity.competitionType === 'cup' ? 'Cup' : 'Champions'
  if (identity.competitionType === 'league') return Number.isInteger(identity.matchDay) && identity.matchDay >= 1 && identity.matchDay <= 30 ? `${name} · ${parts.secondary}` : name
  if (identity.competitionType === 'cup') return /^(stage[1-7]|final|finalReplay)$/.test(identity.stage) ? `${name} · ${parts.secondary}` : name
  const short = parts.secondary.replace('Round of 16', 'R16').replace('Quarter-final', 'QF').replace('Semi-final', 'SF')
  return `${name} · ${short}`
}
