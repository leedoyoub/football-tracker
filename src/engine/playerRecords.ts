import type { CompetitionType, Match, Player, PositionFilterKey } from '../types'
import { matchCompetitionType } from './competition'
import { GOOD_RATING_THRESHOLD } from './constants'
import { newestMatches } from './matchChronology'
import { positionFilterFamilies, scopedPositionFamilyByPlayer } from './positionScope'
import { getMatchManOfTheMatch, isOnPitchAtEvent, matchPositionAtEvent, matchPositionSegments, ratePlayerMatch } from './rating'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { playerStreaks } from './seasonInsights'

export type PlayerRecordLeaderboardId =
  | 'goals' | 'assists' | 'matches-scored-in' | 'braces' | 'hat-tricks'
  | 'four-goals' | 'three-assists' | 'four-ga' | 'mom'
  | 'good' | 'eight' | 'nine' | 'ten' | 'clean-sheets' | 'saves'
  | 'good-streak' | 'scoring-streak' | 'ga-streak'
  | 'highest-rating' | 'highest-goals' | 'highest-assists' | 'highest-ga'

export type PlayerRecordRow = { playerId: string; numeric: number; value: string; detail: string; rank: number }
export type PlayerRecordGroup = { id: PlayerRecordLeaderboardId; title: string; rows: PlayerRecordRow[] }
export type PlayerRecordScope = { seasons?: string[]; teamIds?: string[]; competition?: CompetitionType | 'all'; positionFilter?: PositionFilterKey }

type PlayerRecordFacts = {
  playerId: string; appearances: number; goals: number; assists: number; matchesScoredIn: number; braces: number; hatTricks: number
  fourGoalGames: number; threeAssistGames: number; fourGAGames: number; mom: number; goodRatings: number; eightRatings: number
  nineRatings: number; tenRatings: number; cleanSheets: number; saves: number; goodStreak: number; scoringStreak: number; gaStreak: number
  highestRating: number; highestGoals: number; highestAssists: number; highestGA: number
}

const cache = new WeakMap<Match[], WeakMap<Player[], Map<string, PlayerRecordGroup[]>>>()

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
  return `${RATING_ENGINE_REVISION}|${(scope.seasons ?? []).slice().sort().join(',')}|${(scope.teamIds ?? []).slice().sort().join(',')}|${scope.competition ?? 'all'}|${scope.positionFilter ?? 'all'}`
}

function selectedMatches(matches: Match[], scope: PlayerRecordScope) {
  return matches.filter(match => (!scope.seasons?.length || scope.seasons.includes(match.season)) && (!scope.competition || scope.competition === 'all' || matchCompetitionType(match) === scope.competition))
}

function buildFacts(players: Player[], matches: Match[], scope: PlayerRecordScope): PlayerRecordFacts[] {
  const selected = selectedMatches(matches, scope)
  const allowedFamilies = new Set(positionFilterFamilies(scope.positionFilter ?? 'all'))
  const historicalFamilies = allowedFamilies.size ? scopedPositionFamilyByPlayer(players, selected, { teams: scope.teamIds }) : undefined
  const momByMatch = new Map(selected.map(match => [match.id, getMatchManOfTheMatch(match, players)]))
  return players.flatMap(player => {
    if (allowedFamilies.size && !allowedFamilies.has(historicalFamilies?.get(player.id)!)) return []
    const games = newestMatches(selected.filter(match => match.appearances.some(appearance => appearance.playerId === player.id && (!scope.teamIds?.length || scope.teamIds.includes(appearance.teamId)))))
    const rated = games.flatMap(match => {
      const appearance = match.appearances.find(item => item.playerId === player.id && (!scope.teamIds?.length || scope.teamIds.includes(item.teamId)))
      if (!appearance) return []
      const rating = ratePlayerMatch(match, player)
      if (!rating) return []
      const goals = match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.playerId === player.id && isOnPitchAtEvent(match, appearance, event)).length
      const assists = match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id && isOnPitchAtEvent(match, appearance, event)).length
      const playedGoalkeeper = matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
      const saves = match.events.reduce((total, event) => {
        if (event.type !== 'save' || event.playerId !== player.id || event.teamId !== appearance.teamId) return total
        if (event.minute === undefined ? !playedGoalkeeper : matchPositionAtEvent(match, appearance, event) !== 'GK') return total
        const value = event.count ?? 1
        return Number.isInteger(value) && value > 0 ? total + value : total
      }, 0)
      return [{ match, rating, goals, assists, saves, cleanSheet: playedGoalkeeper && rating.minutes > 0 && rating.conceded === 0 }]
    })
    if (!rated.length) return []
    const count = (predicate: (row: typeof rated[number]) => boolean) => rated.filter(predicate).length
    const sum = (metric: (row: typeof rated[number]) => number) => rated.reduce((total, row) => total + metric(row), 0)
    const streak = (key: 'goodRating' | 'goals' | 'goalContributions') => playerStreaks(player, games).find(row => row.key === key)?.best ?? 0
    return [{
      playerId: player.id, appearances: rated.length,
      goals: sum(row => row.goals), assists: sum(row => row.assists), matchesScoredIn: count(row => row.goals >= 1), braces: count(row => row.goals >= 2), hatTricks: count(row => row.goals >= 3),
      fourGoalGames: count(row => row.goals >= 4), threeAssistGames: count(row => row.assists >= 3), fourGAGames: count(row => row.goals + row.assists >= 4), mom: count(row => momByMatch.get(row.match.id) === player.id),
      goodRatings: count(row => row.rating.raw >= GOOD_RATING_THRESHOLD), eightRatings: count(row => row.rating.raw >= 8), nineRatings: count(row => row.rating.raw >= 9), tenRatings: count(row => row.rating.raw === 10),
      cleanSheets: count(row => row.cleanSheet), saves: sum(row => row.saves), goodStreak: streak('goodRating'), scoringStreak: streak('goals'), gaStreak: streak('goalContributions'),
      highestRating: Math.max(...rated.map(row => row.rating.raw)), highestGoals: Math.max(...rated.map(row => row.goals)), highestAssists: Math.max(...rated.map(row => row.assists)), highestGA: Math.max(...rated.map(row => row.goals + row.assists)),
    }]
  })
}

/** One engine-owned catalog supplies Records UI and Match Changes ranking identities. */
export function buildPlayerRecordLeaderboards(players: Player[], matches: Match[], scope: PlayerRecordScope = {}): PlayerRecordGroup[] {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byScope = byPlayers.get(players); if (!byScope) { byScope = new Map(); byPlayers.set(players, byScope) }
  const key = scopeKey(scope)
  const cached = byScope.get(key); if (cached) return cached
  const facts = buildFacts(players, matches, scope)
  const group = (id: PlayerRecordLeaderboardId, title: string, metric: (row: PlayerRecordFacts) => number, suffix = '', detail?: (row: PlayerRecordFacts) => string): PlayerRecordGroup => ({
    id, title, rows: rank(facts.map(row => {
      const numeric = metric(row)
      return { playerId: row.playerId, numeric, value: id === 'highest-rating' ? numeric.toFixed(2) : `${numeric}${suffix}`, detail: detail?.(row) ?? `${row.appearances} apps` }
    })),
  })
  const result: PlayerRecordGroup[] = [
    group('goals', 'All-time Goals', row => row.goals, ' goals'), group('assists', 'All-time Assists', row => row.assists, ' assists'),
    group('matches-scored-in', 'Most Matches Scored In', row => row.matchesScoredIn), group('braces', 'Most Braces', row => row.braces), group('hat-tricks', 'Most Hat-tricks', row => row.hatTricks),
    group('four-goals', 'Most 4+ Goal Games', row => row.fourGoalGames), group('three-assists', 'Most 3+ Assist Games', row => row.threeAssistGames), group('four-ga', 'Most 4+ G+A Games', row => row.fourGAGames),
    group('mom', 'Most MOM Awards', row => row.mom, ' MOM'), group('good', 'Most 7.2+ Matches', row => row.goodRatings), group('eight', 'Most 8.0+ Ratings', row => row.eightRatings), group('nine', 'Most 9.0+ Ratings', row => row.nineRatings),
    group('ten', 'Most 10.0 Ratings', row => row.tenRatings, '', () => 'final canonical 10.0 ratings'), group('clean-sheets', 'Most Clean Sheets', row => row.cleanSheets, ' CS'), group('saves', 'Most Career Saves', row => row.saves, ' saves'),
    group('good-streak', 'Longest 7.2+ Streak', row => row.goodStreak, ' matches'), group('scoring-streak', 'Longest Scoring Streak', row => row.scoringStreak, ' matches'), group('ga-streak', 'Longest G+A Streak', row => row.gaStreak, ' matches'),
    group('highest-rating', 'Highest Match Rating', row => row.highestRating, '', row => `${row.highestRating.toFixed(2)} canonical raw rating`), group('highest-goals', 'Most Goals in a Match', row => row.highestGoals, ' goals'),
    group('highest-assists', 'Most Assists in a Match', row => row.highestAssists, ' assists'), group('highest-ga', 'Most G+A in a Match', row => row.highestGA, ' G+A'),
  ]
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
