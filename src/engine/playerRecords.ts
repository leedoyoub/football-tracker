import type { CompetitionType, Match, Player, PositionFilterKey } from '../types'
import { isGoodRating } from './constants'
import { newestMatches, oldestMatches } from './matchChronology'
import { positionFilterFamilies, scopedPositionFamilyByPlayer } from './positionScope'
import { getMatchManOfTheMatch, ratePlayerMatch } from './rating'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { classifyGoalTypes, type GoalTypeTotals } from './goalTypes'
import { playerAppearanceMatchIndex, playerGoalkeeperFacts, playerGoalEvents, playerAssistEvents, isPlayerGoalEvent } from './playerMatchFacts'
import { buildGlobalRankingData, rankGlobalRankingRows } from './stats'
import type { DefensiveRankingMetric } from './defensiveRanking'
import { recordsScopedMatches } from './recordsScope'
import { arrayItemRevision } from './arrayItemRevision'
import { historicalRankingTeams, playerInRankingTeams } from './rankingPresentation'

export type PlayerRecordLeaderboardId =
  | 'goals' | 'assists' | 'ga' | 'matches-scored-in' | 'matches-ga' | 'braces' | 'hat-tricks'
  | 'four-goals' | 'three-assists' | 'four-ga' | 'mom'
  | 'good' | 'eight' | 'nine' | 'ten' | 'lowest-sot-90' | 'lowest-defender-ga-90' | 'clean-sheets' | 'saves' | 'lowest-gk-ga-90'
  | 'good-streak' | 'scoring-streak' | 'ga-streak'
  | 'game-winning-goals' | 'comeback-goals' | 'equalizers' | 'opening-goals' | 'stoppage-time-goals'
  | 'highest-rating' | 'highest-goals' | 'highest-assists' | 'highest-ga'

export type PlayerRecordRow = { playerId: string; numeric: number; value: string; detail: string; rank: number }
export type PlayerRecordGroup = { id: PlayerRecordLeaderboardId; title: string; rows: PlayerRecordRow[] }
export type PlayerRecordScope = { seasons?: string[]; teamIds?: string[]; competition?: CompetitionType | 'all'; positionFilter?: PositionFilterKey; positionFilters?: PositionFilterKey[] }

type PlayerRecordFacts = {
  playerId: string; appearances: number; goals: number; assists: number; matchesScoredIn: number; matchesGA: number; braces: number; hatTricks: number
  fourGoalGames: number; threeAssistGames: number; fourGAGames: number; mom: number; goodRatings: number; eightRatings: number
  nineRatings: number; tenRatings: number; cleanSheets: number; saves: number; goodStreak: number; scoringStreak: number; gaStreak: number
  highestRating: number; highestGoals: number; highestAssists: number; highestGA: number
  gameWinningGoals: number; comebackGoals: number; equalizers: number; openingGoals: number; stoppageTimeGoals: number
}

const cache = new WeakMap<Match[], WeakMap<Player[], Map<string, PlayerRecordGroup[]>>>()
const factsCache = new WeakMap<Match[], WeakMap<Player[], Map<string, PlayerRecordFacts[]>>>()

function rank(rows: Omit<PlayerRecordRow, 'rank'>[]): PlayerRecordRow[] {
  let prior: number | undefined
  let priorRank = 0
  return rows.filter(row => row.numeric > 0).sort((left, right) => right.numeric - left.numeric || left.playerId.localeCompare(right.playerId)).map((row, index) => {
    const next = prior === row.numeric ? priorRank : index + 1
    prior = row.numeric; priorRank = next
    return { ...row, rank: next }
  })
}

function scopeKey(scope: PlayerRecordScope) {
  return JSON.stringify([RATING_ENGINE_REVISION, (scope.seasons ?? []).slice().sort(), (scope.teamIds ?? []).slice().sort(), scope.competition ?? 'all', positionFilterFamilies(scope.positionFilters ?? scope.positionFilter ?? 'all').sort()])
}

function selectedMatches(matches: Match[], scope: PlayerRecordScope) {
  return recordsScopedMatches(matches, { seasons: scope.seasons ?? [], competition: scope.competition ?? 'all', teamIds: [] }, 'player')
}

function buildFacts(players: Player[], matches: Match[], scope: PlayerRecordScope, selectedIds?: string[]): PlayerRecordFacts[] {
  const selected = selectedMatches(matches, scope)
  const needs = (id: string) => !selectedIds || selectedIds.includes(id)
  const needsGoalTypes = ['game-winning-goals', 'comeback-goals', 'equalizers', 'opening-goals', 'stoppage-time-goals'].some(needs)
  const needsGoalkeeper = needs('saves') || needs('clean-sheets')
  const needsStreaks = ['good-streak', 'scoring-streak', 'ga-streak'].some(needs)
  let byPlayers = factsCache.get(selected); if (!byPlayers) { byPlayers = new WeakMap(); factsCache.set(selected, byPlayers) }
  let byCapability = byPlayers.get(players); if (!byCapability) { byCapability = new Map(); byPlayers.set(players, byCapability) }
  const key = JSON.stringify([RATING_ENGINE_REVISION, arrayItemRevision(players), needs('mom'), needsGoalTypes, needsGoalkeeper, needsStreaks])
  const cached = byCapability.get(key) ?? byCapability.get(JSON.stringify([RATING_ENGINE_REVISION, arrayItemRevision(players), true, true, true, true]))
  if (cached) return cached
  const momByMatch = new Map(needs('mom') ? selected.map(match => [match.id, getMatchManOfTheMatch(match, players)]) : [])
  const appearanceMatches = playerAppearanceMatchIndex(selected)
  const classified = new Map<Match, ReturnType<typeof classifyGoalTypes>>()
  const goalTypesFor = (match: Match, appearance: Match['appearances'][number]) => {
    const totals: GoalTypeTotals = { opening: 0, equalizer: 0, goAhead: 0, leadExtending: 0, deficitReducing: 0, gameWinning: 0, comeback: 0, stoppageTime: 0 }
    if (!needsGoalTypes) return totals
    let rows = classified.get(match)
    if (!rows) { rows = classifyGoalTypes(match); classified.set(match, rows) }
    for (const row of rows) if (row.teamId === appearance.teamId && isPlayerGoalEvent(match, appearance, row.event)) for (const tag of row.tags) totals[tag]++
    return totals
  }
  const result = players.flatMap(player => {
    const games = newestMatches([...(appearanceMatches.get(player.id) ?? [])])
    // Preserve playerStreaks' oldestMatches(newestMatches(source)) ordering,
    // including insertion-order ties in legacy same-date records.
    const rated = (needsStreaks ? oldestMatches(games) : games).flatMap(match => {
      const appearance = match.appearances.find(item => item.playerId === player.id)
      if (!appearance) return []
      const rating = ratePlayerMatch(match, player)
      if (!rating) return []
      const goals = playerGoalEvents(match, appearance).length
      const assists = playerAssistEvents(match, appearance).length
      const goalkeeper = needsGoalkeeper ? playerGoalkeeperFacts(match, appearance) : undefined
      return [{ match, rating, goals, assists, saves: goalkeeper?.saves ?? 0, cleanSheet: goalkeeper?.cleanSheet ?? false, goalTypes: goalTypesFor(match, appearance) }]
    })
    if (!rated.length) return []
    const count = (predicate: (row: typeof rated[number]) => boolean) => rated.filter(predicate).length
    const sum = (metric: (row: typeof rated[number]) => number) => rated.reduce((total, row) => total + metric(row), 0)
    const streak = (passes: (row: typeof rated[number]) => boolean) => {
      if (!needsStreaks) return 0
      let best = 0, current = 0
      for (const row of rated) { current = passes(row) ? current + 1 : 0; best = Math.max(best, current) }
      return best
    }
    const goalTypes = (key: keyof GoalTypeTotals) => rated.reduce((total, row) => total + row.goalTypes[key], 0)
    return [{
      playerId: player.id, appearances: rated.length,
      goals: sum(row => row.goals), assists: sum(row => row.assists), matchesScoredIn: count(row => row.goals >= 1), matchesGA: count(row => row.goals + row.assists >= 1), braces: count(row => row.goals >= 2), hatTricks: count(row => row.goals >= 3),
      fourGoalGames: count(row => row.goals >= 4), threeAssistGames: count(row => row.assists >= 3), fourGAGames: count(row => row.goals + row.assists >= 4), mom: count(row => momByMatch.get(row.match.id) === player.id),
      goodRatings: count(row => isGoodRating(row.rating.raw)), eightRatings: count(row => row.rating.raw >= 8), nineRatings: count(row => row.rating.raw >= 9), tenRatings: count(row => row.rating.raw === 10),
      cleanSheets: count(row => row.cleanSheet), saves: sum(row => row.saves), goodStreak: streak(row => isGoodRating(row.rating.rating)), scoringStreak: streak(row => row.goals > 0), gaStreak: streak(row => row.goals + row.assists > 0),
      highestRating: Math.max(...rated.map(row => row.rating.raw)), highestGoals: Math.max(...rated.map(row => row.goals)), highestAssists: Math.max(...rated.map(row => row.assists)), highestGA: Math.max(...rated.map(row => row.goals + row.assists)),
      gameWinningGoals: goalTypes('gameWinning'), comebackGoals: goalTypes('comeback'), equalizers: goalTypes('equalizer'), openingGoals: goalTypes('opening'), stoppageTimeGoals: goalTypes('stoppageTime'),
    }]
  })
  if (byCapability.size >= 32) byCapability.delete(byCapability.keys().next().value!)
  byCapability.set(key, result)
  return result
}

/** One engine-owned catalog supplies Records UI and Match Changes ranking identities. */
export function buildPlayerRecordLeaderboards(players: Player[], matches: Match[], scope: PlayerRecordScope = {}, selectedIds?: string[]): PlayerRecordGroup[] {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byScope = byPlayers.get(players); if (!byScope) { byScope = new Map(); byPlayers.set(players, byScope) }
  const key = JSON.stringify([arrayItemRevision(matches), arrayItemRevision(players), scopeKey(scope), selectedIds?.slice().sort() ?? null])
  const cached = byScope.get(key); if (cached) return cached
  if (scope.teamIds?.length) {
    const official = buildPlayerRecordLeaderboards(players, matches, { ...scope, teamIds: [] }, selectedIds)
    const membership = historicalRankingTeams(selectedMatches(matches, scope))
    const result = official.map(group => ({ ...group, rows: group.rows.filter(row => playerInRankingTeams(row.playerId, scope.teamIds!, membership)) }))
    if (byScope.size >= 32) byScope.delete(byScope.keys().next().value!)
    byScope.set(key, result)
    return result
  }
  const needs = (id: string) => !selectedIds || selectedIds.includes(id)
  const selected = selectedMatches(matches, scope)
  const allowedFamilies = new Set(positionFilterFamilies(scope.positionFilters ?? scope.positionFilter ?? 'all'))
  const historicalFamilies = allowedFamilies.size ? scopedPositionFamilyByPlayer(players, selected, {}) : undefined
  const allFacts = !selectedIds || selectedIds.some(id => !['lowest-sot-90', 'lowest-defender-ga-90', 'lowest-gk-ga-90'].includes(id)) ? buildFacts(players, matches, scope, selectedIds) : []
  const facts = allowedFamilies.size ? allFacts.filter(row => { const family = historicalFamilies?.get(row.playerId); return family !== undefined && allowedFamilies.has(family) }) : allFacts
  let rankingIndex: ReturnType<typeof buildGlobalRankingData> | undefined
  const defensiveGroup = (id: PlayerRecordLeaderboardId, title: string, metric: DefensiveRankingMetric): PlayerRecordGroup | undefined => {
    if (!needs(id)) return undefined
    rankingIndex ??= buildGlobalRankingData(players, selected, { seasons: [], teams: [], positions: positionFilterFamilies(scope.positionFilters ?? scope.positionFilter ?? 'all') }, 'rating')
    let previous: number | undefined
    let previousRank = 0
    const rows = rankGlobalRankingRows(rankingIndex, players, metric).map((row, index): PlayerRecordRow => {
      const numeric = row.value
      const rank = previous === numeric ? previousRank : index + 1
      previous = numeric; previousRank = rank
      const minutes = metric === 'sotAllowed' ? row.qualifyingDefenderMinutes : metric === 'defenderGaPer90' ? row.defenderMinutes : row.goalkeeperMinutes
      const detail = metric === 'sotAllowed' ? `${minutes}' qualifying defender minutes · ${row.sotAllowedAppearances} qualifying apps` : `${minutes}' ${metric === 'defenderGaPer90' ? 'defender' : 'GK'} minutes · ${metric === 'defenderGaPer90' ? row.defenderConceded : row.goalkeeperConceded} conceded`
      return { playerId: row.playerId, numeric, value: `${numeric.toFixed(2)} ${metric === 'sotAllowed' ? 'SOT/90' : 'GA/90'}`, detail, rank }
    })
    return { id, title, rows }
  }
  const group = (id: PlayerRecordLeaderboardId, title: string, metric: (row: PlayerRecordFacts) => number, suffix = '', detail?: (row: PlayerRecordFacts) => string): PlayerRecordGroup | undefined => !needs(id) ? undefined : ({
    id, title, rows: rank(facts.map(row => {
      const numeric = metric(row)
      return { playerId: row.playerId, numeric, value: id === 'highest-rating' ? numeric.toFixed(2) : `${numeric}${suffix}`, detail: detail?.(row) ?? `${row.appearances} apps` }
    })),
  })
  const result = [
    group('goals', 'All-time Goals', row => row.goals, ' goals'), group('assists', 'All-time Assists', row => row.assists, ' assists'), group('ga', 'All-time G+A', row => row.goals + row.assists, ' G+A'),
    group('matches-scored-in', 'Most Matches Scored In', row => row.matchesScoredIn), group('matches-ga', 'Most Matches with G+A', row => row.matchesGA), group('braces', 'Most Braces', row => row.braces), group('hat-tricks', 'Most Hat-tricks', row => row.hatTricks),
    group('four-goals', 'Most 4+ Goal Games', row => row.fourGoalGames), group('three-assists', 'Most 3+ Assist Games', row => row.threeAssistGames), group('four-ga', 'Most 4+ G+A Games', row => row.fourGAGames),
    group('mom', 'Most MOM Awards', row => row.mom, ' MOM'), group('good', 'Most 7.2+ Matches', row => row.goodRatings), group('eight', 'Most 8.0+ Ratings', row => row.eightRatings), group('nine', 'Most 9.0+ Ratings', row => row.nineRatings),
    group('ten', 'Most 10.0 Ratings', row => row.tenRatings, '', () => 'final canonical 10.0 ratings'), defensiveGroup('lowest-sot-90', 'Lowest Opponent SOT/90', 'sotAllowed'), defensiveGroup('lowest-defender-ga-90', 'Lowest Defender GA/90', 'defenderGaPer90'), group('clean-sheets', 'Most Clean Sheets', row => row.cleanSheets, ' CS'), group('saves', 'Most Career Saves', row => row.saves, ' saves'), defensiveGroup('lowest-gk-ga-90', 'Lowest GK GA/90', 'goalkeeperGaPer90'),
    group('good-streak', 'Longest 7.2+ Streak', row => row.goodStreak, ' matches'), group('scoring-streak', 'Longest Scoring Streak', row => row.scoringStreak, ' matches'), group('ga-streak', 'Longest G+A Streak', row => row.gaStreak, ' matches'),
    group('game-winning-goals', 'Most Game-Winning Goals', row => row.gameWinningGoals, ' goals'), group('comeback-goals', 'Most Comeback Goals', row => row.comebackGoals, ' goals'), group('equalizers', 'Most Equalizers', row => row.equalizers, ' goals'), group('opening-goals', 'Most Opening Goals', row => row.openingGoals, ' goals'), group('stoppage-time-goals', 'Most Stoppage-Time Goals', row => row.stoppageTimeGoals, ' goals'),
    group('highest-rating', 'Highest Match Rating', row => row.highestRating, '', row => `${row.highestRating.toFixed(2)} canonical raw rating`), group('highest-goals', 'Most Goals in a Match', row => row.highestGoals, ' goals'),
    group('highest-assists', 'Most Assists in a Match', row => row.highestAssists, ' assists'), group('highest-ga', 'Most G+A in a Match', row => row.highestGA, ' G+A'),
  ].filter((group): group is PlayerRecordGroup => Boolean(group))
  if (byScope.size >= 32) byScope.delete(byScope.keys().next().value!)
  byScope.set(key, result)
  return result
}

type LegacyRatingRecordRow = { id: string; name: string; metrics: { eightRatings: number; nineRatings: number; tenRatings: number }; detail?: string }

/** Compatibility projection for old callers; new surfaces consume the canonical builder. */
export function playerRecordGroups(rows: LegacyRatingRecordRow[]) {
  const detail = (row: LegacyRatingRecordRow) => row.detail ?? '0 apps'
  const group = (id: PlayerRecordLeaderboardId, title: string, metric: (row: LegacyRatingRecordRow) => number, recordDetail?: string) => ({ id, title, rows: rank(rows.map(row => ({ playerId: row.id, numeric: metric(row), value: String(metric(row)), detail: recordDetail ?? detail(row) }))).map(ranked => ({ id: ranked.playerId, name: rows.find(row => row.id === ranked.playerId)?.name ?? ranked.playerId, numeric: ranked.numeric, value: ranked.value, detail: ranked.detail, rank: ranked.rank })) })
  return [group('eight', 'Most 8.0+ Ratings', row => row.metrics.eightRatings), group('nine', 'Most 9.0+ Ratings', row => row.metrics.nineRatings), group('ten', 'Most 10.0 Ratings', row => row.metrics.tenRatings, 'final canonical 10.0 ratings')]
}
