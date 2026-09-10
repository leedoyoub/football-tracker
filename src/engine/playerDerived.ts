import type { Appearance, CompetitionType, Match, Player, Position, RatingBreakdown } from '../types'
import { GOOD_RATING_THRESHOLD, isGoodRating } from './constants'
import { combineGoalTypeTotals, goalTypeTotals, type GoalTypeTotals } from './goalTypes'
import { getMatchManOfTheMatch, matchScore, ratePlayerMatch } from './rating'
import { isOnPitchAtEvent, matchPositionAtEvent, matchPositionSegments, scoringTeamId } from './timeline'

export type PlayerScope = { season?: string; competition?: CompetitionType | 'all'; teamIds?: string[] }
export type DerivedAppearance = { match: Match; appearance: Appearance; rating: RatingBreakdown }
export type RoleSummary = { apps: number; minutes: number; averageRating: number; goals: number; assists: number; goalsPer90: number; assistsPer90: number; gaPer90: number }
export type StartingTeamPerformance = { teamId: string; starts: number; wins: number; draws: number; losses: number; starterPpg: number; teamPpg: number; ppgDifference: number; starterGdPerMatch: number; teamGdPerMatch: number; gdDifference: number }
export type CareerEntry = { season: string; teamId: string; apps: number; goals: number; assists: number; averageRating: number }
export type PersonalRecords = { highestRating: number; mostGoals: number; mostAssists: number; mostGA: number; scoringStreak: number; contributionStreak: number; goodMatchStreak: number }
export type PlayerDerived = {
  appearances: DerivedAppearance[]; apps: number; starts: number; subs: number; minutes: number; goals: number; assists: number; saves: number; cleanSheets: number; mom: number; averageRating: number; goodMatches: number; goodMatchRate: number
  onPitchGoalsFor: number; onPitchGoalsAgainst: number; onPitchGdPer90: number; onPitchGaPer90: number; goalInvolvement: number | null; positionMinutes: Map<Position, number>; goalTypes: GoalTypeTotals; starter: RoleSummary; substitute: RoleSummary; startingPerformance: StartingTeamPerformance[]
}

const cache = new WeakMap<Match[], WeakMap<Player[], Map<string, Map<string, PlayerDerived>>>>()
const ordered = (matches: Match[]) => matches.slice().sort((left, right) => left.date.localeCompare(right.date) || left.matchDay - right.matchDay || left.id.localeCompare(right.id))
const scopeKey = (scope: PlayerScope) => `${scope.season ?? '*'}|${scope.competition ?? 'all'}|${(scope.teamIds ?? []).slice().sort().join(',')}`
const scoped = (matches: Match[], scope: PlayerScope) => matches.filter(match => (!scope.season || match.season === scope.season) && (!scope.competition || scope.competition === 'all' || (match.competitionType ?? 'league') === scope.competition))
const goalForPlayer = (match: Match, appearance: Appearance, playerId: string, event: Match['events'][number]) => event.type === 'goal' && !event.ownGoal && event.playerId === playerId && isOnPitchAtEvent(match, appearance, event)
const assistForPlayer = (match: Match, appearance: Appearance, playerId: string, event: Match['events'][number]) => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === playerId && isOnPitchAtEvent(match, appearance, event)
const safeRate = (sum: number, denominator: number) => denominator ? sum / denominator : 0

function roleSummary(rows: DerivedAppearance[], playerId: string): RoleSummary {
  const minutes = rows.reduce((total, row) => total + row.rating.minutes, 0)
  const goals = rows.reduce((total, row) => total + row.match.events.filter(event => goalForPlayer(row.match, row.appearance, playerId, event)).length, 0)
  const assists = rows.reduce((total, row) => total + row.match.events.filter(event => assistForPlayer(row.match, row.appearance, playerId, event)).length, 0)
  return { apps: rows.length, minutes, averageRating: safeRate(rows.reduce((total, row) => total + row.rating.raw, 0), rows.length), goals, assists, goalsPer90: safeRate(goals * 90, minutes), assistsPer90: safeRate(assists * 90, minutes), gaPer90: safeRate((goals + assists) * 90, minutes) }
}

function startingPerformance(matches: Match[], playerId: string, scope: PlayerScope): StartingTeamPerformance[] {
  const selected = scoped(matches, scope)
  const rows = new Map<string, { starts: Match[]; all: Match[] }>()
  for (const match of selected) {
    const teamIds = new Set(match.appearances.map(appearance => appearance.teamId))
    for (const teamId of teamIds) {
      if (scope.teamIds?.length && !scope.teamIds.includes(teamId)) continue
      const row = rows.get(teamId) ?? { starts: [], all: [] }
      row.all.push(match)
      if (match.appearances.some(appearance => appearance.playerId === playerId && appearance.teamId === teamId && appearance.role === 'starter')) row.starts.push(match)
      rows.set(teamId, row)
    }
  }
  const metrics = (matchesForTeam: Match[], teamId: string) => matchesForTeam.reduce((total, match) => {
    const score = matchScore(match); const gf = teamId === match.homeTeamId ? score.home : score.away; const ga = teamId === match.homeTeamId ? score.away : score.home
    return { points: total.points + (gf > ga ? 3 : gf === ga ? 1 : 0), gd: total.gd + gf - ga, wins: total.wins + Number(gf > ga), draws: total.draws + Number(gf === ga), losses: total.losses + Number(gf < ga) }
  }, { points: 0, gd: 0, wins: 0, draws: 0, losses: 0 })
  return [...rows.entries()].flatMap(([teamId, row]) => {
    if (!row.starts.length) return []
    const started = metrics(row.starts, teamId); const all = metrics(row.all, teamId)
    const starterPpg = safeRate(started.points, row.starts.length); const teamPpg = safeRate(all.points, row.all.length)
    const starterGdPerMatch = safeRate(started.gd, row.starts.length); const teamGdPerMatch = safeRate(all.gd, row.all.length)
    return [{ teamId, starts: row.starts.length, wins: started.wins, draws: started.draws, losses: started.losses, starterPpg, teamPpg, ppgDifference: starterPpg - teamPpg, starterGdPerMatch, teamGdPerMatch, gdDifference: starterGdPerMatch - teamGdPerMatch }]
  })
}

export function derivePlayerScope(player: Player, players: Player[], matches: Match[], scope: PlayerScope = {}): PlayerDerived {
  let byPlayers = cache.get(matches)
  if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byScope = byPlayers.get(players)
  if (!byScope) { byScope = new Map(); byPlayers.set(players, byScope) }
  const key = scopeKey(scope); let byPlayer = byScope.get(key)
  if (!byPlayer) { byPlayer = new Map(); byScope.set(key, byPlayer) }
  const existing = byPlayer.get(player.id); if (existing) return existing
  const appearances: DerivedAppearance[] = []
  for (const match of scoped(matches, scope)) {
    const appearance = match.appearances.find(item => item.playerId === player.id && (!scope.teamIds?.length || scope.teamIds.includes(item.teamId)))
    if (!appearance) continue
    const rating = ratePlayerMatch(match, player)
    if (rating) appearances.push({ match, appearance, rating })
  }
  const actual = ordered(appearances.map(row => row.match)).map(match => appearances.find(row => row.match === match)!)
  const starts = actual.filter(row => row.appearance.role === 'starter').length; const subs = actual.length - starts
  const minutes = actual.reduce((total, row) => total + row.rating.minutes, 0)
  let goals = 0; let assists = 0; let saves = 0; let onPitchGoalsFor = 0; let onPitchGoalsAgainst = 0; let goalInvolvementGoals = 0; let goalInvolvementTeamGoals = 0
  const positionMinutes = new Map<Position, number>(); let cleanSheets = 0
  for (const row of actual) {
    let concededAsGoalkeeper = 0
    for (const segment of matchPositionSegments(row.match, row.appearance)) positionMinutes.set(segment.position, (positionMinutes.get(segment.position) ?? 0) + segment.exit - segment.enter)
    for (const event of row.match.events) {
      if (event.type === 'save' && event.playerId === player.id && event.teamId === row.appearance.teamId && (event.minute === undefined ? matchPositionSegments(row.match, row.appearance).some(segment => segment.position === 'GK') : matchPositionAtEvent(row.match, row.appearance, event) === 'GK')) saves += Number.isInteger(event.count) && (event.count ?? 0) > 0 ? event.count! : 1
      if (event.type !== 'goal' || !isOnPitchAtEvent(row.match, row.appearance, event)) continue
      const ours = scoringTeamId(row.match, event) === row.appearance.teamId
      if (ours) { onPitchGoalsFor++; goalInvolvementTeamGoals++; if (!event.ownGoal && (event.playerId === player.id || event.assistPlayerId === player.id)) goalInvolvementGoals++ } else { onPitchGoalsAgainst++; if (matchPositionAtEvent(row.match, row.appearance, event) === 'GK') concededAsGoalkeeper++ }
      if (goalForPlayer(row.match, row.appearance, player.id, event)) goals++
      if (assistForPlayer(row.match, row.appearance, player.id, event)) assists++
    }
    if (matchPositionSegments(row.match, row.appearance).some(segment => segment.position === 'GK') && concededAsGoalkeeper === 0) cleanSheets++
  }
  const mom = actual.filter(row => getMatchManOfTheMatch(row.match, players) === player.id).length
  const averageRating = safeRate(actual.reduce((total, row) => total + row.rating.raw, 0), actual.length)
  const goodMatches = actual.filter(row => isGoodRating(row.rating.raw)).length
  const goalTypes = combineGoalTypeTotals(actual.map(row => goalTypeTotals(row.match, player.id, row.appearance.teamId)))
  const result: PlayerDerived = {
    appearances: actual, apps: actual.length, starts, subs, minutes, goals, assists, saves, cleanSheets, mom, averageRating, goodMatches, goodMatchRate: safeRate(goodMatches * 100, actual.length), onPitchGoalsFor, onPitchGoalsAgainst, onPitchGdPer90: safeRate((onPitchGoalsFor - onPitchGoalsAgainst) * 90, minutes), onPitchGaPer90: safeRate(onPitchGoalsAgainst * 90, minutes), goalInvolvement: goalInvolvementTeamGoals ? goalInvolvementGoals / goalInvolvementTeamGoals * 100 : null, positionMinutes, goalTypes,
    starter: roleSummary(actual.filter(row => row.appearance.role === 'starter'), player.id), substitute: roleSummary(actual.filter(row => row.appearance.role !== 'starter'), player.id), startingPerformance: startingPerformance(matches, player.id, scope),
  }
  byPlayer.set(player.id, result)
  return result
}

export function playerCareerTimeline(player: Player, players: Player[], matches: Match[]): CareerEntry[] {
  const groups = new Map<string, { season: string; teamId: string; matches: Match[] }>()
  for (const match of matches) for (const appearance of match.appearances) if (appearance.playerId === player.id) {
    const key = `${match.season}:${appearance.teamId}`; const group = groups.get(key) ?? { season: match.season, teamId: appearance.teamId, matches: [] }; if (!group.matches.includes(match)) group.matches.push(match); groups.set(key, group)
  }
  return [...groups.values()].map(group => { const data = derivePlayerScope(player, players, group.matches, { teamIds: [group.teamId] }); return { season: group.season, teamId: group.teamId, apps: data.apps, goals: data.goals, assists: data.assists, averageRating: data.averageRating } }).sort((left, right) => right.season.localeCompare(left.season) || right.teamId.localeCompare(left.teamId))
}

export function playerPersonalRecords(player: Player, _players: Player[], matches: Match[]): PersonalRecords {
  const rows: DerivedAppearance[] = []
  for (const match of ordered(matches)) {
    const appearance = match.appearances.find(item => item.playerId === player.id)
    const rating = appearance ? ratePlayerMatch(match, player) : null
    if (appearance && rating) rows.push({ match, appearance, rating })
  }
  let scoring = 0; let contribution = 0; let good = 0; let scoringBest = 0; let contributionBest = 0; let goodBest = 0; let highestRating = 0; let mostGoals = 0; let mostAssists = 0; let mostGA = 0
  for (const row of rows) {
    const goals = row.match.events.filter(event => goalForPlayer(row.match, row.appearance, player.id, event)).length; const assists = row.match.events.filter(event => assistForPlayer(row.match, row.appearance, player.id, event)).length
    highestRating = Math.max(highestRating, row.rating.raw); mostGoals = Math.max(mostGoals, goals); mostAssists = Math.max(mostAssists, assists); mostGA = Math.max(mostGA, goals + assists)
    scoring = goals ? scoring + 1 : 0; contribution = goals + assists ? contribution + 1 : 0; good = isGoodRating(row.rating.raw) ? good + 1 : 0
    scoringBest = Math.max(scoringBest, scoring); contributionBest = Math.max(contributionBest, contribution); goodBest = Math.max(goodBest, good)
  }
  return { highestRating, mostGoals, mostAssists, mostGA, scoringStreak: scoringBest, contributionStreak: contributionBest, goodMatchStreak: goodBest }
}

export { GOOD_RATING_THRESHOLD }
