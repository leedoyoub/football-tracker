import type { Match } from '../types'
import { arrayItemRevision } from './arrayItemRevision'
import { oldestMatches } from './matchChronology'
import { teamPerspectiveScore, teamsCreditedWithResult } from './matchPerspective'
import { orderedEventList, scoringTeamId } from './timeline'

type TeamMatchFact = {
  teamId: string
  opponentId: string
  match: Match
  goalsFor: number
  goalsAgainst: number
  outcome: 'W' | 'D' | 'L'
  openingGoal: boolean
  comebackDeficit: number
}

function goalFlow(match: Match) {
  const goalIds = new Set<string>()
  let lead = 0, lowestLead = 0, highestLead = 0
  let openingTeamId: string | undefined
  for (const event of orderedEventList(match.events)) {
    if (event.type !== 'goal') continue
    if (!event.id || goalIds.has(event.id) || !Number.isFinite(event.minute) || event.minute < 0) return
    if (event.teamId !== match.homeTeamId && event.teamId !== match.awayTeamId) return
    goalIds.add(event.id)
    const scorer = scoringTeamId(match, event)
    openingTeamId ??= scorer
    lead += scorer === match.homeTeamId ? 1 : -1
    lowestLead = Math.min(lowestLead, lead)
    highestLead = Math.max(highestLead, lead)
  }
  return { openingTeamId, lowestLead, highestLead }
}

const matchFactsCache = new WeakMap<Match, { events: Match['events']; rows: TeamMatchFact[] }>()
function factsForMatch(match: Match): TeamMatchFact[] {
  const cached = matchFactsCache.get(match)
  if (cached?.events === match.events) return cached.rows
  if (!match.id || !match.homeTeamId || !match.awayTeamId || match.homeTeamId === match.awayTeamId || !Array.isArray(match.events)) return []
  const flow = goalFlow(match)
  const rows = teamsCreditedWithResult(match).flatMap(teamId => {
    const perspective = teamPerspectiveScore(match, teamId)
    if (!perspective) return []
    const home = teamId === match.homeTeamId
    return [{ teamId, match, ...perspective, opponentId: home ? match.awayTeamId : match.homeTeamId,
      openingGoal: flow?.openingTeamId === teamId,
      comebackDeficit: flow && perspective.outcome === 'W' ? home ? -flow.lowestLead : flow.highestLead : 0 }]
  })
  matchFactsCache.set(match, { events: match.events, rows })
  return rows
}

type TeamMatchFacts = { rows: TeamMatchFact[]; byTeam: Map<string, TeamMatchFact[]> }
const matchIndex = new WeakMap<Match[], { revision: number; facts: TeamMatchFacts }>()

/** One chronological index for team totals, streaks, and match evidence. */
export function teamRecordedMatchFacts(matches: Match[]): TeamMatchFacts {
  const revision = arrayItemRevision(matches)
  const cached = matchIndex.get(matches)
  if (cached?.revision === revision) return cached.facts
  const uniqueMatches = [...new Map(matches.map(match => [match.id, match])).values()]
  const rows = oldestMatches(uniqueMatches).flatMap(factsForMatch)
  const byTeam = new Map<string, TeamMatchFact[]>()
  for (const row of rows) {
    const teamRows = byTeam.get(row.teamId) ?? []
    teamRows.push(row)
    byTeam.set(row.teamId, teamRows)
  }
  const facts = { rows, byTeam }
  matchIndex.set(matches, { revision, facts })
  return facts
}

const historicMetrics = [
  { id: 'biggest-win', title: 'Biggest Win', measure: (row: TeamMatchFact) => row.outcome === 'W' ? row.goalsFor - row.goalsAgainst : undefined },
  { id: 'high-score', title: 'Most Goals in a Match', measure: (row: TeamMatchFact) => row.goalsFor },
  { id: 'high-conceded', title: 'Most Conceded in a Match', measure: (row: TeamMatchFact) => row.goalsAgainst },
  { id: 'biggest-defeat', title: 'Biggest Defeat', measure: (row: TeamMatchFact) => row.outcome === 'L' ? row.goalsAgainst - row.goalsFor : undefined },
  { id: 'biggest-comeback', title: 'Biggest Comeback', measure: (row: TeamMatchFact) => row.comebackDeficit || undefined },
] as const

export type HistoricTeamMatch = Pick<TeamMatchFact, 'teamId' | 'opponentId' | 'match' | 'goalsFor' | 'goalsAgainst'> & { numeric: number }

export function teamHistoricMatchRecords(matches: Match[], teamIds?: string[], selectedIds?: string[]) {
  const { rows, byTeam } = teamRecordedMatchFacts(matches)
  const scope = teamIds ? [...new Set(teamIds)].flatMap(id => byTeam.get(id) ?? []) : rows
  return historicMetrics.filter(metric => !selectedIds || selectedIds.includes(metric.id)).map(metric => ({
    id: metric.id,
    title: metric.title,
    rows: scope.flatMap((row): HistoricTeamMatch[] => {
      const numeric = metric.measure(row)
      if (numeric === undefined) return []
      const { teamId, opponentId, match, goalsFor, goalsAgainst } = row
      return [{ teamId, opponentId, match, goalsFor, goalsAgainst, numeric }]
    }),
  }))
}
