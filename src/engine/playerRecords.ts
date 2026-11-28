import type { CompetitionType, Match, Player, PositionFilterKey } from '../types'
import { isGoodRating } from './constants'
import { newestMatches, oldestMatches } from './matchChronology'
import { longestMatchStreaks } from './matchStreaks'
import { positionFilterFamilies, scopedPositionFamilyByPlayer } from './positionScope'
import { getMatchManOfTheMatch, ratePlayerMatch } from './rating'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { MOM_POLICY_REVISION } from './momPolicy'
import { classifyGoalTypes, type GoalTypeTotals } from './goalTypes'
import { playerAppearanceMatchIndex, playerGoalkeeperFacts, playerGoalEvents, playerAssistEvents, isPlayerGoalEvent } from './playerMatchFacts'
import { buildGlobalRankingData, rankGlobalRankingRows } from './stats'
import type { DefensiveRankingMetric } from './defensiveRanking'
import { recordsScopedMatches } from './recordsScope'
import { arrayItemRevision } from './arrayItemRevision'
import { historicalRankingTeams, playerInRankingTeams } from './rankingPresentation'
import { creditedMinutesPlayed } from './timeline'
import { actualAppearance, buildHistoricalParticipation, buildPlayerOpportunityCounter, meetsAppearancesShare, meetsMinutesShare, RECORDS_POLICY_REVISION, uniquePlayedMatches } from './participation'

export type PlayerRecordLeaderboardId =
  | 'goals' | 'assists' | 'ga' | 'matches-scored-in' | 'matches-ga' | 'braces' | 'hat-tricks'
  | 'four-goals' | 'three-assists' | 'four-ga' | 'mom'
  | 'good' | 'eight' | 'nine' | 'ten' | 'lowest-sot-90' | 'lowest-defender-ga-90' | 'clean-sheets' | 'saves' | 'lowest-gk-ga-90'
  | 'good-streak' | 'scoring-streak' | 'ga-streak'
  | 'game-winning-goals' | 'comeback-goals' | 'equalizers' | 'opening-goals' | 'stoppage-time-goals'
  | 'highest-rating' | 'highest-goals' | 'highest-assists' | 'highest-ga'
  | 'appearances' | 'minutes' | 'starts' | 'career-rating' | 'mom-rate' | 'substitute-goals'
  | 'highest-saves' | 'mom-streak' | 'clean-sheet-streak'
  | 'season-goals' | 'season-assists' | 'season-ga' | 'season-mom' | 'season-rating'
  | 'season-appearances' | 'season-minutes' | 'season-clean-sheets' | 'season-saves'

export type PlayerRecordRow = { playerId: string; numeric: number; value: string; detail: string; rank: number; matchId?: string; streakMatchIds?: string[][]; season?: string; teamIds?: string[] }
export type PlayerRecordGroup = { id: PlayerRecordLeaderboardId; title: string; rows: PlayerRecordRow[] }
export type PlayerRecordScope = { seasons?: string[]; teamIds?: string[]; competition?: CompetitionType | 'all'; positionFilter?: PositionFilterKey; positionFilters?: PositionFilterKey[] }

type MatchRecordFacts = {
  match: Match; teamId: string; started: boolean; minutes: number; rawRating: number | null; displayRating: number | null
  goals: number; assists: number; saves: number; goalkeeperMinutes: number; cleanSheet: boolean; mom: boolean; goalTypes: GoalTypeTotals
}
type PlayerRecordFacts = {
  playerId: string; appearances: number; goals: number; assists: number; matchesScoredIn: number; matchesGA: number; braces: number; hatTricks: number
  fourGoalGames: number; threeAssistGames: number; fourGAGames: number; mom: number; goodRatings: number; eightRatings: number
  nineRatings: number; tenRatings: number; cleanSheets: number; saves: number
  minutes: number; starts: number; substituteGoals: number; average: number; matches: MatchRecordFacts[]
  gameWinningGoals: number; comebackGoals: number; equalizers: number; openingGoals: number; stoppageTimeGoals: number
}

const cache = new WeakMap<Match[], WeakMap<Player[], Map<string, PlayerRecordGroup[]>>>()
const factsCache = new WeakMap<Match[], WeakMap<Player[], Map<string, PlayerRecordFacts[]>>>()

function rank(rows: Omit<PlayerRecordRow, 'rank'>[], includeZero = false): PlayerRecordRow[] {
  let prior: number | undefined
  let priorRank = 0
  return rows.filter(row => includeZero ? row.numeric >= 0 : row.numeric > 0).sort((left, right) => right.numeric - left.numeric || left.playerId.localeCompare(right.playerId)).map((row, index) => {
    const next = prior === row.numeric ? priorRank : index + 1
    prior = row.numeric; priorRank = next
    return { ...row, rank: next }
  })
}

function scopeKey(scope: PlayerRecordScope) {
  return JSON.stringify([RECORDS_POLICY_REVISION, RATING_ENGINE_REVISION, (scope.seasons ?? []).slice().sort(), (scope.teamIds ?? []).slice().sort(), scope.competition ?? 'all', positionFilterFamilies(scope.positionFilters ?? scope.positionFilter ?? 'all').sort()])
}

function selectedMatches(matches: Match[], scope: PlayerRecordScope) {
  return recordsScopedMatches(matches, { seasons: scope.seasons ?? [], competition: scope.competition ?? 'all', teamIds: [] }, 'player')
}

function buildFacts(players: Player[], matches: Match[], scope: PlayerRecordScope, selectedIds?: string[]): PlayerRecordFacts[] {
  const selected = selectedMatches(matches, scope)
  const needs = (id: string) => !selectedIds || selectedIds.includes(id)
  const needsGoalTypes = ['game-winning-goals', 'comeback-goals', 'equalizers', 'opening-goals', 'stoppage-time-goals'].some(needs)
  const needsGoalkeeper = ['saves', 'clean-sheets', 'highest-saves', 'clean-sheet-streak', 'season-clean-sheets', 'season-saves'].some(needs)
  const needsRatings = ['good', 'eight', 'nine', 'ten', 'good-streak', 'highest-rating', 'career-rating', 'season-rating'].some(needs)
  const needsMom = playerRecordsNeedMom(selectedIds)
  let byPlayers = factsCache.get(selected); if (!byPlayers) { byPlayers = new WeakMap(); factsCache.set(selected, byPlayers) }
  let byCapability = byPlayers.get(players); if (!byCapability) { byCapability = new Map(); byPlayers.set(players, byCapability) }
  const revision = [RATING_ENGINE_REVISION, arrayItemRevision(players)]
  const key = JSON.stringify([...revision, needsMom ? MOM_POLICY_REVISION : null, needsGoalTypes, needsGoalkeeper, needsRatings])
  const cached = byCapability.get(key) ?? byCapability.get(JSON.stringify([...revision, MOM_POLICY_REVISION, true, true, true]))
  if (cached) return cached
  const gamesInScope = uniquePlayedMatches(selected)
  const momByMatch = new Map(needsMom ? gamesInScope.map(match => [match.id, getMatchManOfTheMatch(match, players)]) : [])
  const appearanceMatches = playerAppearanceMatchIndex(gamesInScope)
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
    const rated = games.flatMap((match): MatchRecordFacts[] => {
      const appearance = match.appearances.find(item => item.playerId === player.id && actualAppearance(match, item))
      if (!appearance) return []
      const rating = needsRatings ? ratePlayerMatch(match, player) : null
      const goals = playerGoalEvents(match, appearance).length
      const assists = playerAssistEvents(match, appearance).length
      const goalkeeper = needsGoalkeeper ? playerGoalkeeperFacts(match, appearance) : undefined
      return [{ match, teamId: appearance.teamId, started: appearance.role === 'starter', minutes: Math.min(90, creditedMinutesPlayed(match, appearance)), rawRating: rating?.raw ?? null, displayRating: rating?.rating ?? null, goals, assists, saves: goalkeeper?.saves ?? 0, goalkeeperMinutes: goalkeeper?.minutes ?? 0, cleanSheet: goalkeeper?.cleanSheet ?? false, mom: momByMatch.get(match.id) === player.id, goalTypes: goalTypesFor(match, appearance) }]
    })
    if (!rated.length) return []
    const count = (predicate: (row: typeof rated[number]) => boolean) => rated.filter(predicate).length
    const sum = (metric: (row: typeof rated[number]) => number) => rated.reduce((total, row) => total + metric(row), 0)
    const goalTypes = (key: keyof GoalTypeTotals) => rated.reduce((total, row) => total + row.goalTypes[key], 0)
    return [{
      playerId: player.id, appearances: rated.length,
      goals: sum(row => row.goals), assists: sum(row => row.assists), matchesScoredIn: count(row => row.goals >= 1), matchesGA: count(row => row.goals + row.assists >= 1), braces: count(row => row.goals >= 2), hatTricks: count(row => row.goals >= 3),
      fourGoalGames: count(row => row.goals >= 4), threeAssistGames: count(row => row.assists >= 3), fourGAGames: count(row => row.goals + row.assists >= 4), mom: count(row => row.mom),
      goodRatings: count(row => isGoodRating(row.rawRating ?? 0)), eightRatings: count(row => (row.rawRating ?? 0) >= 8), nineRatings: count(row => (row.rawRating ?? 0) >= 9), tenRatings: count(row => row.rawRating === 10),
      cleanSheets: count(row => row.cleanSheet), saves: sum(row => row.saves),
      minutes: sum(row => row.minutes), starts: count(row => row.started), substituteGoals: sum(row => row.started ? 0 : row.goals), average: averageRating(rated), matches: rated,
      gameWinningGoals: goalTypes('gameWinning'), comebackGoals: goalTypes('comeback'), equalizers: goalTypes('equalizer'), openingGoals: goalTypes('opening'), stoppageTimeGoals: goalTypes('stoppageTime'),
    }]
  })
  if (byCapability.size >= 32) byCapability.delete(byCapability.keys().next().value!)
  byCapability.set(key, result)
  return result
}

export const playerRecordsNeedMom = (selectedIds?: string[]) =>
  !selectedIds || selectedIds.some(id => ['mom', 'mom-rate', 'mom-streak', 'season-mom'].includes(id))

export function careerPerformanceRows(players: Player[], matches: Match[]) {
  return buildFacts(players, matches, {}, ['career-rating', 'mom'])
}

function averageRating(matches: MatchRecordFacts[]): number {
  const ratings = matches.map(row => row.rawRating).filter((rating): rating is number => rating !== null)
  return ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0
}

/** One engine-owned catalog supplies Records UI and Match Changes ranking identities. */
export function buildPlayerRecordLeaderboards(players: Player[], matches: Match[], scope: PlayerRecordScope = {}, selectedIds?: string[]): PlayerRecordGroup[] {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byScope = byPlayers.get(players); if (!byScope) { byScope = new Map(); byPlayers.set(players, byScope) }
  const momRevision = playerRecordsNeedMom(selectedIds) ? MOM_POLICY_REVISION : null
  const key = JSON.stringify([arrayItemRevision(matches), arrayItemRevision(players), scopeKey(scope), momRevision, selectedIds?.slice().sort() ?? null])
  const cached = byScope.get(key); if (cached) return cached
  if (scope.teamIds?.length) {
    const official = buildPlayerRecordLeaderboards(players, matches, { ...scope, teamIds: [] }, selectedIds)
    const membership = historicalRankingTeams(selectedMatches(matches, scope))
    const result = official.map(group => ({ ...group, rows: group.rows.filter(row => row.teamIds ? row.teamIds.some(teamId => scope.teamIds!.includes(teamId)) : playerInRankingTeams(row.playerId, scope.teamIds!, membership)) }))
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
  const playerById = new Map(players.map(player => [player.id, player]))
  let opportunities: ReturnType<typeof buildPlayerOpportunityCounter> | undefined
  const available = (playerId: string) => {
    opportunities ??= buildPlayerOpportunityCounter(buildHistoricalParticipation(matches), selected)
    return opportunities(playerById.get(playerId)!)
  }
  let rankingIndex: ReturnType<typeof buildGlobalRankingData> | undefined
  const defensiveGroup = (id: PlayerRecordLeaderboardId, title: string, metric: DefensiveRankingMetric): PlayerRecordGroup | undefined => {
    if (!needs(id)) return undefined
    rankingIndex ??= buildGlobalRankingData(players, selected, { seasons: [], teams: [], positions: positionFilterFamilies(scope.positionFilters ?? scope.positionFilter ?? 'all') }, 'rating')
    let previous: number | undefined
    let previousRank = 0
    const rows = rankGlobalRankingRows(rankingIndex, players, metric).filter(row => {
      const minutes = metric === 'sotAllowed' ? row.qualifyingDefenderMinutes : metric === 'defenderGaPer90' ? row.defenderMinutes : row.goalkeeperMinutes
      return meetsMinutesShare(minutes, available(row.playerId) * 90, 20)
    }).map((row, index): PlayerRecordRow => {
      const numeric = row.value
      const rank = previous === numeric ? previousRank : index + 1
      previous = numeric; previousRank = rank
      const minutes = metric === 'sotAllowed' ? row.qualifyingDefenderMinutes : metric === 'defenderGaPer90' ? row.defenderMinutes : row.goalkeeperMinutes
      const detail = metric === 'sotAllowed' ? `${minutes}' qualifying defender minutes · ${row.sotAllowedAppearances} qualifying apps` : `${minutes}' ${metric === 'defenderGaPer90' ? 'defender' : 'GK'} minutes · ${metric === 'defenderGaPer90' ? row.defenderConceded : row.goalkeeperConceded} conceded`
      return { playerId: row.playerId, numeric, value: `${numeric.toFixed(2)} ${metric === 'sotAllowed' ? 'SOT/90' : 'GA/90'}`, detail, rank }
    })
    return { id, title, rows }
  }
  const group = (id: PlayerRecordLeaderboardId, title: string, metric: (row: PlayerRecordFacts) => number, suffix = '', detail?: (row: PlayerRecordFacts) => string, qualifies?: (row: PlayerRecordFacts) => boolean, format: (n: number) => string = String): PlayerRecordGroup | undefined => !needs(id) ? undefined : ({
    id, title, rows: rank(facts.filter(row => !qualifies || qualifies(row)).map(row => {
      const numeric = metric(row)
      return { playerId: row.playerId, numeric, value: `${format(numeric)}${suffix}`, detail: detail?.(row) ?? `${row.appearances} apps` }
    }), id === 'mom-rate'),
  })
  const matchGroup = (id: PlayerRecordLeaderboardId, title: string, metric: (row: MatchRecordFacts) => number, format: (n: number) => string = String): PlayerRecordGroup | undefined => !needs(id) ? undefined : ({
    id, title, rows: rank(facts.flatMap(player => player.matches.map(row => {
      const numeric = metric(row)
      return { playerId: player.playerId, numeric, value: format(numeric), detail: row.match.season, matchId: row.match.id, season: row.match.season, teamIds: [row.teamId] }
    }))),
  })
  const chronological = new Map<PlayerRecordFacts, MatchRecordFacts[]>()
  const streakGroup = (id: PlayerRecordLeaderboardId, title: string, passes: (row: MatchRecordFacts) => boolean): PlayerRecordGroup | undefined => !needs(id) ? undefined : ({
    id, title, rows: rank(facts.map(player => {
      let games = chronological.get(player)
      if (!games) {
        // Preserve the legacy oldestMatches(newestMatches(source)) tie order.
        const byMatch = new Map(player.matches.map(row => [row.match, row]))
        games = oldestMatches(player.matches.map(row => row.match)).map(match => byMatch.get(match)!)
        chronological.set(player, games)
      }
      const { length, matchIds } = longestMatchStreaks(games, passes)
      return { playerId: player.playerId, numeric: length, value: `${length} matches`, detail: `${player.appearances} apps`, streakMatchIds: matchIds }
    })),
  })
  const seasonGames = new Map<string, Match[]>()
  const seasonOpportunities = new Map<string, ReturnType<typeof buildPlayerOpportunityCounter>>()
  const seasonFacts = new Map<string, Map<string, MatchRecordFacts[]>>()
  if (!selectedIds || selectedIds.some(id => id.startsWith('season-'))) {
    for (const match of selected) {
      const games = seasonGames.get(match.season) ?? []
      games.push(match)
      seasonGames.set(match.season, games)
    }
    for (const player of facts) {
      const seasons = new Map<string, MatchRecordFacts[]>()
      for (const row of player.matches) {
        const games = seasons.get(row.match.season) ?? []
        games.push(row)
        seasons.set(row.match.season, games)
      }
      seasonFacts.set(player.playerId, seasons)
    }
  }
  const seasonAvailable = (playerId: string, season: string) => {
    let count = seasonOpportunities.get(season)
    if (!count) {
      count = buildPlayerOpportunityCounter(buildHistoricalParticipation(matches), seasonGames.get(season) ?? [])
      seasonOpportunities.set(season, count)
    }
    return count(playerById.get(playerId)!) * 90
  }
  const seasonGroup = (id: PlayerRecordLeaderboardId, title: string, metric: (rows: MatchRecordFacts[]) => number, format: (n: number) => string = String): PlayerRecordGroup | undefined => !needs(id) ? undefined : ({
    id, title, rows: rank([...seasonFacts].flatMap(([playerId, seasons]) => [...seasons].flatMap(([season, rows]) => {
      const minutes = rows.reduce((sum, row) => sum + row.minutes, 0)
      if (id === 'season-rating' && !meetsMinutesShare(minutes, seasonAvailable(playerId, season), 20)) return []
      const numeric = metric(rows)
      return [{ playerId, numeric, value: format(numeric), detail: `${season} · ${rows.length} apps · ${minutes} min`, season, teamIds: [...new Set(rows.map(row => row.teamId))] }]
    }))),
  })
  const decimals = (numeric: number) => numeric.toFixed(2)
  const total = (metric: (row: MatchRecordFacts) => number) => (rows: MatchRecordFacts[]) => rows.reduce((sum, row) => sum + metric(row), 0)
  const result = [
    group('goals', 'All-time Goals', row => row.goals, ' goals'), group('assists', 'All-time Assists', row => row.assists, ' assists'), group('ga', 'All-time G+A', row => row.goals + row.assists, ' G+A'),
    group('matches-scored-in', 'Most Matches Scored In', row => row.matchesScoredIn), group('matches-ga', 'Most Matches with G+A', row => row.matchesGA), group('braces', 'Most Braces', row => row.braces), group('hat-tricks', 'Most Hat-tricks', row => row.hatTricks),
    group('four-goals', 'Most 4+ Goal Games', row => row.fourGoalGames), group('three-assists', 'Most 3+ Assist Games', row => row.threeAssistGames), group('four-ga', 'Most 4+ G+A Games', row => row.fourGAGames),
    group('mom', 'Most MOM Awards', row => row.mom, ' MOM'), group('good', 'Most 7.2+ Matches', row => row.goodRatings), group('eight', 'Most 8.0+ Ratings', row => row.eightRatings), group('nine', 'Most 9.0+ Ratings', row => row.nineRatings),
    group('ten', 'Most 10.0 Ratings', row => row.tenRatings, '', () => 'final canonical 10.0 ratings'), defensiveGroup('lowest-sot-90', 'Lowest Opponent SOT/90', 'sotAllowed'), defensiveGroup('lowest-defender-ga-90', 'Lowest Defender GA/90', 'defenderGaPer90'), group('clean-sheets', 'Most Clean Sheets', row => row.cleanSheets, ' CS'), group('saves', 'Most Career Saves', row => row.saves, ' saves'), defensiveGroup('lowest-gk-ga-90', 'Lowest GK GA/90', 'goalkeeperGaPer90'),
    streakGroup('good-streak', 'Longest 7.2+ Rating Streak', row => isGoodRating(row.displayRating ?? 0)), streakGroup('scoring-streak', 'Longest Scoring Streak', row => row.goals > 0), streakGroup('ga-streak', 'Longest G+A Streak', row => row.goals + row.assists > 0),
    group('game-winning-goals', 'Most Game-Winning Goals', row => row.gameWinningGoals, ' goals'), group('comeback-goals', 'Most Comeback Goals', row => row.comebackGoals, ' goals'), group('equalizers', 'Most Equalizers', row => row.equalizers, ' goals'), group('opening-goals', 'Most Opening Goals', row => row.openingGoals, ' goals'), group('stoppage-time-goals', 'Most Stoppage-Time Goals', row => row.stoppageTimeGoals, ' goals'),
    matchGroup('highest-rating', 'Highest Match Rating', row => row.rawRating ?? 0, decimals), matchGroup('highest-goals', 'Most Goals in a Match', row => row.goals, n => `${n} goals`),
    matchGroup('highest-assists', 'Most Assists in a Match', row => row.assists, n => `${n} assists`), matchGroup('highest-ga', 'Most G+A in a Match', row => row.goals + row.assists, n => `${n} G+A`),
    group('appearances', 'Most Appearances', row => row.appearances), group('minutes', 'Most Minutes', row => row.minutes, ' min'), group('starts', 'Most Starts', row => row.starts),
    group('career-rating', 'Highest Average Rating', row => row.average, '', row => `${row.minutes} / ${available(row.playerId) * 90} min`, row => meetsMinutesShare(row.minutes, available(row.playerId) * 90, 20), decimals),
    group('mom-rate', 'Highest MOM Rate', row => row.mom / row.appearances, '%', row => `${row.mom} MOM · ${row.appearances} / ${available(row.playerId)} apps`, row => meetsAppearancesShare(row.appearances, available(row.playerId)), n => (n * 100).toFixed(2)),
    group('substitute-goals', 'Most Substitute Goals', row => row.substituteGoals, ' goals'),
    matchGroup('highest-saves', 'Most Saves in a Match', row => row.saves, n => `${n} saves`),
    streakGroup('mom-streak', 'Longest MOM Streak', row => row.mom), streakGroup('clean-sheet-streak', 'Longest Clean Sheet Streak', row => row.cleanSheet),
    seasonGroup('season-goals', 'Most Goals in a Season', total(row => row.goals)), seasonGroup('season-assists', 'Most Assists in a Season', total(row => row.assists)),
    seasonGroup('season-ga', 'Most G+A in a Season', total(row => row.goals + row.assists)), seasonGroup('season-mom', 'Most MOM in a Season', total(row => Number(row.mom))),
    seasonGroup('season-rating', 'Best Season Rating', averageRating, decimals), seasonGroup('season-appearances', 'Most Appearances in a Season', rows => rows.length),
    seasonGroup('season-minutes', 'Most Minutes in a Season', total(row => row.minutes)), seasonGroup('season-clean-sheets', 'Most Clean Sheets in a Season', total(row => Number(row.cleanSheet))),
    seasonGroup('season-saves', 'Most Saves in a Season', total(row => row.saves)),
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
