import type { Appearance, Match } from '../types'
import { creditedPositionSegments, matchPositionAtEvent, scoringTeamId } from './timeline'
import { positionFamily } from './positionScope'
import { opponentSotExposureForPositionSegment } from './opponentSot'
import { isRecordedForTeam } from './matchPerspective'
import { playerGoalkeeperFacts, type PlayerGoalkeeperFacts } from './playerMatchFacts'
import { oldestMatches } from './matchChronology'

export type DefensiveRankingMetric = 'sotAllowed' | 'defenderGaPer90' | 'goalkeeperGaPer90'
export type DefensiveRankingFacts = {
  sotAllowedTotal: number
  sotAllowedAppearances: number
  qualifyingDefenderMinutes: number
  defenderMinutes: number
  defenderConceded: number
  goalkeeperMinutes: number
  goalkeeperConceded: number
  availableTeamMinutes: number
}

const defender = (position?: string) => {
  const family = positionFamily(position)
  return family === 'CB' || family === 'LB' || family === 'RB'
}

export function emptyDefensiveRankingFacts(): DefensiveRankingFacts {
  return { sotAllowedTotal: 0, sotAllowedAppearances: 0, qualifyingDefenderMinutes: 0, defenderMinutes: 0, defenderConceded: 0, goalkeeperMinutes: 0, goalkeeperConceded: 0, availableTeamMinutes: 0 }
}

/** Read-only projection of the canonical timeline and Opponent SOT exposure. */
export function defensiveMatchFacts(match: Match, appearance: Appearance, goalkeeper: PlayerGoalkeeperFacts = playerGoalkeeperFacts(match, appearance)): DefensiveRankingFacts {
  const facts = emptyDefensiveRankingFacts()
  const segments = creditedPositionSegments(match, appearance)
  const defenderSegments = segments.filter(segment => defender(segment.position))
  facts.defenderMinutes = defenderSegments.reduce((sum, segment) => sum + segment.exit - segment.enter, 0)
  facts.goalkeeperMinutes = goalkeeper.minutes
  facts.goalkeeperConceded = goalkeeper.conceded
  if (facts.defenderMinutes >= 60) {
    facts.qualifyingDefenderMinutes = facts.defenderMinutes
    facts.sotAllowedAppearances = 1
    facts.sotAllowedTotal = defenderSegments.reduce((sum, segment) => sum + opponentSotExposureForPositionSegment(match, appearance, segment.position, segment.enter, segment.exit), 0)
  }
  for (const event of match.events) {
    if (event.type !== 'goal' || scoringTeamId(match, event) === appearance.teamId) continue
    const position = matchPositionAtEvent(match, appearance, event)
    if (defender(position)) facts.defenderConceded++
  }
  return facts
}

export function addDefensiveRankingFacts(target: DefensiveRankingFacts, next: DefensiveRankingFacts): void {
  target.sotAllowedTotal += next.sotAllowedTotal
  target.sotAllowedAppearances += next.sotAllowedAppearances
  target.qualifyingDefenderMinutes += next.qualifyingDefenderMinutes
  target.defenderMinutes += next.defenderMinutes
  target.defenderConceded += next.defenderConceded
  target.goalkeeperMinutes += next.goalkeeperMinutes
  target.goalkeeperConceded += next.goalkeeperConceded
}

export type TeamAppearance = { season: string; teamId: string; matchIndex: number }
export type TeamOpportunityIndex = { bySeason: Map<string, Map<string, number[]>>; seen: Set<string> }

export function emptyTeamOpportunityIndex(): TeamOpportunityIndex {
  return { bySeason: new Map(), seen: new Set() }
}

/** Match indices follow canonical oldest-first order, including legacy same-date records. */
export function appendRecordedTeamOpportunities(index: TeamOpportunityIndex, match: Match, matchIndex: number): void {
  for (const teamId of new Set([match.teamId ?? match.homeTeamId, match.awayTeamId])) {
    if (!teamId || !isRecordedForTeam(match, teamId)) continue
    const key = `${match.season}\0${teamId}\0${match.id}`
    if (index.seen.has(key)) continue
    index.seen.add(key)
    const teams = index.bySeason.get(match.season) ?? new Map<string, number[]>()
    const opportunities = teams.get(teamId) ?? []
    opportunities.push(matchIndex)
    teams.set(teamId, opportunities)
    index.bySeason.set(match.season, teams)
  }
}

export function teamAppearanceHistory(matches: Match[]): Map<string, TeamAppearance[]> {
  const history = new Map<string, TeamAppearance[]>()
  matches.forEach((match, matchIndex) => {
    for (const appearance of match.appearances) {
      if (!creditedPositionSegments(match, appearance).some(segment => segment.exit > segment.enter)) continue
      const rows = history.get(appearance.playerId) ?? []
      rows.push({ season: match.season, teamId: appearance.teamId, matchIndex })
      history.set(appearance.playerId, rows)
    }
  })
  return history
}

const lowerBound = (values: number[], target: number) => {
  let left = 0; let right = values.length
  while (left < right) { const middle = (left + right) >>> 1; if (values[middle] < target) left = middle + 1; else right = middle }
  return left
}

/** Count possible historical team opportunities. Other-team appearances bound each
 * stint; uncertain games between those appearances remain counted for eligibility. */
export function teamOpportunityMinutesFromIndex(index: TeamOpportunityIndex, representedTeamIds: ReadonlySet<string>, appearances: readonly TeamAppearance[]): number {
  const bySeason = new Map<string, TeamAppearance[]>()
  for (const appearance of appearances) {
    const rows = bySeason.get(appearance.season) ?? []
    rows.push(appearance)
    bySeason.set(appearance.season, rows)
  }
  let opportunities = 0
  for (const [season, rows] of bySeason) {
    const runs: { teamId: string; first: number; last: number }[] = []
    for (const row of rows) {
      const last = runs[runs.length - 1]
      if (last?.teamId === row.teamId) last.last = row.matchIndex
      else runs.push({ teamId: row.teamId, first: row.matchIndex, last: row.matchIndex })
    }
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]
      if (!representedTeamIds.has(run.teamId)) continue
      const games = index.bySeason.get(season)?.get(run.teamId) ?? []
      const afterPreviousTeam = i ? runs[i - 1].last + 1 : 0
      const beforeNextTeam = i + 1 < runs.length ? runs[i + 1].first : Infinity
      opportunities += lowerBound(games, beforeNextTeam) - lowerBound(games, afterPreviousTeam)
    }
  }
  return opportunities * 90
}

export function teamOpportunityMinutes(matches: Match[], representedTeamIds: ReadonlySet<string>, playerId?: string): number {
  const ordered = oldestMatches(matches)
  const index = emptyTeamOpportunityIndex()
  ordered.forEach((match, matchIndex) => appendRecordedTeamOpportunities(index, match, matchIndex))
  if (!playerId) return [...index.bySeason.values()].reduce((sum, teams) => sum + [...representedTeamIds].reduce((count, teamId) => count + (teams.get(teamId)?.length ?? 0), 0), 0) * 90
  return teamOpportunityMinutesFromIndex(index, representedTeamIds, teamAppearanceHistory(ordered).get(playerId) ?? [])
}

export function defensiveRankingValue(metric: DefensiveRankingMetric, facts: DefensiveRankingFacts): number | null {
  if (metric === 'sotAllowed') return facts.sotAllowedAppearances && facts.qualifyingDefenderMinutes ? facts.sotAllowedTotal / facts.qualifyingDefenderMinutes * 90 : null
  const minutes = metric === 'defenderGaPer90' ? facts.defenderMinutes : facts.goalkeeperMinutes
  const conceded = metric === 'defenderGaPer90' ? facts.defenderConceded : facts.goalkeeperConceded
  return minutes > 0 && facts.availableTeamMinutes > 0 && minutes >= facts.availableTeamMinutes * .3 ? conceded / minutes * 90 : null
}
