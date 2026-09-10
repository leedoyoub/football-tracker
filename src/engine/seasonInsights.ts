import { matchScore, ratePlayerMatch } from './rating'
import { playerSeasonStats, unifiedBestEleven } from './stats'
import { combinationStats, goalPartnerships, starterSubstituteSplits } from './analytics'
import { GOOD_RATING_THRESHOLD } from './constants'
import { classifyGoalTypes } from './goalTypes'
import type { CompetitionState, Match, MatchEvent, Player } from '../types'

/** All season insight calculations live here so none of them require extra match input. */
export const STARTING_XI_MIN_SAMPLE = 3

type GoalEvent = Extract<MatchEvent, { type: 'goal' }>
type OrderedGoal = { event: GoalEvent; index: number; scoringTeamId: string; homeBefore: number; awayBefore: number; homeAfter: number; awayAfter: number }

function orderedMatches(matches: Match[]) {
  return matches.slice().sort((a, b) => a.matchDay - b.matchDay || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

function scoredBy(event: GoalEvent, match: Match) {
  return event.ownGoal ? (event.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId) : event.teamId
}

function goalsInOrder(match: Match): OrderedGoal[] {
  let home = 0; let away = 0
  return match.events.map((event, index) => ({ event, index })).filter((item): item is { event: GoalEvent; index: number } => item.event.type === 'goal')
    .sort((a, b) => a.event.minute - b.event.minute || a.index - b.index)
    .map(({ event, index }) => {
      const homeBefore = home; const awayBefore = away
      const scoringTeamId = scoredBy(event, match)
      if (scoringTeamId === match.homeTeamId) home++; else away++
      return { event, index, scoringTeamId, homeBefore, awayBefore, homeAfter: home, awayAfter: away }
    })
}

export type GoalClassification = {
  eventId: string
  scoringTeamId: string
  scoreBefore: { home: number; away: number }
  scoreAfter: { home: number; away: number }
  labels: ('Opening Goal' | 'Equalizer' | 'Go-ahead Goal' | 'Comeback Goal' | 'Winning Goal' | 'Late Drama' | 'Late Goal')[]
}

/** Rebuilds the score at every goal, including own goals, in stable timeline order. */
export function classifyGoalEvents(match: Match): GoalClassification[] {
  const goals = goalsInOrder(match); const derived = new Map(classifyGoalTypes(match).map(row => [row.event, row]))
  const labels = { opening: 'Opening Goal', equalizer: 'Equalizer', goAhead: 'Go-ahead Goal', comeback: 'Comeback Goal', winning: 'Winning Goal', lateDrama: 'Late Drama' } as const
  return goals.map(goal => {
    const row = derived.get(goal.event)
    const result: GoalClassification['labels'] = (row?.tags ?? []).map(tag => labels[tag])
    // Compatibility presentation label; derived Goal Types uses the stricter
    // >=85 match-state-changing Late Drama definition above.
    if (goal.event.minute >= 75) result.push('Late Goal')
    return { eventId: goal.event.id, scoringTeamId: goal.scoringTeamId, scoreBefore: { home: goal.homeBefore, away: goal.awayBefore }, scoreAfter: { home: goal.homeAfter, away: goal.awayAfter }, labels: result }
  })
}

export type PlayerForm = { seasonAverage: number; last5Average: number; last3Average: number; ratings: { matchId: string; matchDay: number; rating: number }[] }

export function playerForm(player: Player, matches: Match[]): PlayerForm {
  const ratings = orderedMatches(matches).flatMap(match => {
    const appearance = match.appearances.find(item => item.playerId === player.id)
    const rating = appearance ? ratePlayerMatch(match, player) : null
    // ratePlayerMatch deliberately returns null for a bench player who never entered.
    return rating ? [{ matchId: match.id, matchDay: match.matchDay, rating: rating.rating }] : []
  })
  const average = (rows: typeof ratings) => rows.length ? rows.reduce((sum, row) => sum + row.rating, 0) / rows.length : 0
  return { seasonAverage: average(ratings), last5Average: average(ratings.slice(-5)), last3Average: average(ratings.slice(-3)), ratings }
}

export type StreakName = 'goals' | 'assists' | 'goalContributions' | 'goodRating' | 'starts' | 'cleanSheets'
export type PlayerStreak = { key: StreakName; label: string; current: number; best: number }

export function playerStreaks(player: Player, matches: Match[]): PlayerStreak[] {
  const entries = orderedMatches(matches).flatMap(match => {
    const appearance = match.appearances.find(item => item.playerId === player.id)
    if (!appearance) return []
    const rating = ratePlayerMatch(match, player)
    const goals = match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.playerId === player.id).length
    const assists = match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id).length
    const score = matchScore(match); const conceded = appearance.teamId === match.homeTeamId ? score.away : score.home
    return [{ goals, assists, rating: rating?.rating ?? 0, started: appearance.role === 'starter', cleanSheet: Boolean(rating) && conceded === 0 }]
  })
  const definitions: { key: StreakName; label: string; passes: (entry: typeof entries[number]) => boolean }[] = [
    { key: 'goals', label: 'Goals', passes: entry => entry.goals > 0 },
    { key: 'assists', label: 'Assists', passes: entry => entry.assists > 0 },
    { key: 'goalContributions', label: 'G+A', passes: entry => entry.goals + entry.assists > 0 },
    { key: 'goodRating', label: `${GOOD_RATING_THRESHOLD.toFixed(1)}+ rating`, passes: entry => entry.rating >= GOOD_RATING_THRESHOLD },
    { key: 'starts', label: 'Starts', passes: entry => entry.started },
    { key: 'cleanSheets', label: 'Clean sheets', passes: entry => entry.cleanSheet },
  ]
  return definitions.map(definition => {
    let best = 0; let run = 0
    for (const entry of entries) { run = definition.passes(entry) ? run + 1 : 0; best = Math.max(best, run) }
    let current = 0
    for (let index = entries.length - 1; index >= 0 && definition.passes(entries[index]); index--) current++
    return { key: definition.key, label: definition.label, current, best }
  })
}

export type StartingXIStat = { key: string; teamId: string; playerIds: string[]; matches: number; wins: number; draws: number; losses: number; winRate: number; averageRating: number; eligible: boolean }

export function startingXIAnalytics(players: Player[], matches: Match[], season: string, teamId?: string): StartingXIStat[] {
  const byId = new Map(players.map(player => [player.id, player]))
  const totals = new Map<string, StartingXIStat>()
  for (const match of orderedMatches(matches).filter(item => item.season === season)) {
    const ids = [...new Set(match.appearances.map(item => item.teamId))]
    for (const currentTeamId of ids) {
      if (teamId && currentTeamId !== teamId) continue
      const starters = match.appearances.filter(item => item.teamId === currentTeamId && item.role === 'starter').map(item => item.playerId).sort()
      if (!starters.length) continue
      const key = `${currentTeamId}:${starters.join(':')}`
      const score = matchScore(match); const ours = currentTeamId === match.homeTeamId ? score.home : score.away; const theirs = currentTeamId === match.homeTeamId ? score.away : score.home
      const values = starters.flatMap(id => { const player = byId.get(id); const rating = player ? ratePlayerMatch(match, player) : null; return rating ? [rating.rating] : [] })
      const previous = totals.get(key) ?? { key, teamId: currentTeamId, playerIds: starters, matches: 0, wins: 0, draws: 0, losses: 0, winRate: 0, averageRating: 0, eligible: false }
      previous.matches++; previous.wins += Number(ours > theirs); previous.draws += Number(ours === theirs); previous.losses += Number(ours < theirs)
      previous.averageRating = ((previous.averageRating * (previous.matches - 1)) + (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0)) / previous.matches
      totals.set(key, previous)
    }
  }
  return [...totals.values()].map(row => ({ ...row, winRate: row.matches ? row.wins / row.matches : 0, eligible: row.matches >= STARTING_XI_MIN_SAMPLE }))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.matches - a.matches || b.winRate - a.winRate)
}

export type StartingXILeaders = { mostUsed?: StartingXIStat; highestWinRate?: StartingXIStat; bestRated?: StartingXIStat }
export function startingXILeaders(players: Player[], matches: Match[], season: string, teamId?: string): StartingXILeaders {
  const rows = startingXIAnalytics(players, matches, season, teamId).filter(row => row.eligible)
  const mostUsed = rows.slice().sort((a, b) => b.matches - a.matches || b.winRate - a.winRate)[0]
  const highestWinRate = rows.slice().sort((a, b) => b.winRate - a.winRate || b.matches - a.matches)[0]
  const bestRated = rows.slice().sort((a, b) => b.averageRating - a.averageRating || b.matches - a.matches)[0]
  return { mostUsed, highestWinRate, bestRated }
}

export type SeasonAward = { id: string; title: string; playerIds: string[]; detail: string }
export type SeasonRecap = { season: string; complete: boolean; matchDays: number; awards: SeasonAward[]; bestXI: ReturnType<typeof unifiedBestEleven>['slots'] }
export function isSeasonComplete(_matches: Match[], season: string, states: CompetitionState[] = []) { return states.some(state => state.kind === 'season-complete' && state.season === season) }

export function seasonRecap(players: Player[], matches: Match[], season: string, states: CompetitionState[] = []): SeasonRecap {
  const stats = players.map(player => ({ player, stats: playerSeasonStats(player, players, matches, season) })).filter(row => row.stats.matches > 0)
  const pick = (rows: typeof stats, value: (row: typeof stats[number]) => number) => rows.slice().sort((a, b) => value(b) - value(a) || b.stats.minutes - a.stats.minutes)[0]
  const awardFor = (id: string, title: string, row: typeof stats[number] | undefined, detail: (row: typeof stats[number]) => string): SeasonAward | undefined => row && { id, title, playerIds: [row.player.id], detail: detail(row) }
  const filter = { season }
  const partnership = goalPartnerships(players, matches, filter)[0]
  const combination = (kind: Parameters<typeof combinationStats>[3]) => combinationStats(players, matches, filter, kind).find(row => row.eligible)
  const comboAward = (id: string, title: string, kind: Parameters<typeof combinationStats>[3], detail: (row: ReturnType<typeof combinationStats>[number]) => string): SeasonAward | undefined => { const row = combination(kind); return row ? { id, title, playerIds: row.playerIds, detail: detail(row) } : undefined }
  const bestSub = pick(stats.filter(row => starterSubstituteSplits(row.player, matches, filter).substitute.apps >= 3), row => starterSubstituteSplits(row.player, matches, filter).substitute.averageRating)
  const xi = startingXILeaders(players, matches, season).mostUsed
  const bestXI = unifiedBestEleven(players, matches, season).slots
  const awards = [
    awardFor('player', 'Player of the Season', pick(stats, row => row.stats.avgRating), row => `${row.stats.avgRating.toFixed(2)} average rating`),
    awardFor('scorer', 'Top Scorer', pick(stats, row => row.stats.goals), row => `${row.stats.goals} goals`),
    awardFor('assists', 'Assist King', pick(stats, row => row.stats.assists), row => `${row.stats.assists} assists`),
    awardFor('mom', 'Most MOM', pick(stats, row => row.stats.mom), row => `${row.stats.mom} Player of the Match awards`),
    { id: 'best-xi', title: 'Best XI', playerIds: bestXI.flatMap(slot => slot.playerId ? [slot.playerId] : []), detail: 'Season average rating · 4-3-3' },
    partnership && { id: 'goal-partnership', title: 'Best Goal Partnership', playerIds: [partnership.assisterId, partnership.scorerId], detail: `${partnership.assistedGoals} assisted goals` },
    comboAward('duo', 'Best Duo', 'duo', row => `${row.goalDifference > 0 ? '+' : ''}${row.goalDifference} goal difference`),
    comboAward('attack', 'Best Attack Trio', 'attack', row => `${row.combinedGA} combined G+A`),
    comboAward('midfield', 'Best Midfield Trio', 'midfield', row => `${row.averageRating.toFixed(2)} average rating`),
    comboAward('cb', 'Best CB Pair', 'cb', row => `${(row.goalsAgainst / row.togetherMinutes * 90).toFixed(2)} GA/90`),
    comboAward('back-four', 'Best Back Four', 'backFour', row => `${row.cleanSheets} clean sheets`),
    awardFor('substitute', 'Best Substitute', bestSub, row => `${starterSubstituteSplits(row.player, matches, filter).substitute.averageRating.toFixed(2)} as a substitute`),
    xi && { id: 'most-used-xi', title: 'Most Used XI', playerIds: xi.playerIds, detail: `${xi.matches} matches · ${(xi.winRate * 100).toFixed(0)}% wins` },
  ].filter((award): award is SeasonAward => Boolean(award))
  return { season, complete: isSeasonComplete(matches, season, states), matchDays: new Set(matches.filter(match => match.season === season && (match.competitionType ?? 'league') === 'league').map(match => match.matchDay)).size, awards, bestXI }
}

export type DataStory = { id: string; eyebrow: string; title: string; detail: string; playerIds: string[] }
export function homeDataStories(players: Player[], matches: Match[], season: string): DataStory[] {
  const seasonMatches = matches.filter(match => match.season === season)
  const candidates: (DataStory & { score: number })[] = []
  const nameFor = (id: string) => players.find(player => player.id === id)?.displayName ?? players.find(player => player.id === id)?.name ?? 'Player'
  for (const player of players) {
    const involved = seasonMatches.filter(match => match.appearances.some(appearance => appearance.playerId === player.id))
    const form = playerForm(player, involved); const streaks = playerStreaks(player, involved)
    const ga = streaks.find(row => row.key === 'goalContributions')!; const hot = streaks.find(row => row.key === 'goodRating')!
    if (ga.current >= 2) candidates.push({ id: `ga:${player.id}`, eyebrow: '🔥 Involved', title: player.displayName ?? player.name, detail: `${ga.current} matches with a goal contribution`, playerIds: [player.id], score: ga.current * 4 })
    if (form.ratings.length >= 3 && form.last5Average - form.seasonAverage >= .2) candidates.push({ id: `form:${player.id}`, eyebrow: '📈 Rising form', title: player.displayName ?? player.name, detail: `Season ${form.seasonAverage.toFixed(2)} → Last 5 ${form.last5Average.toFixed(2)}`, playerIds: [player.id], score: (form.last5Average - form.seasonAverage) * 10 })
    if (hot.current >= 3) candidates.push({ id: `hot:${player.id}`, eyebrow: '⚡ Hot streak', title: player.displayName ?? player.name, detail: `${hot.current} straight ${GOOD_RATING_THRESHOLD.toFixed(1)}+ ratings`, playerIds: [player.id], score: hot.current * 3 })
  }
  const partnership = goalPartnerships(players, seasonMatches, { season })[0]
  if (partnership) candidates.push({ id: `partnership:${partnership.key}`, eyebrow: '🤝 Best partnership', title: `${nameFor(partnership.assisterId)} → ${nameFor(partnership.scorerId)}`, detail: `${partnership.assistedGoals} assisted goals`, playerIds: [partnership.assisterId, partnership.scorerId], score: partnership.assistedGoals * 2 })
  const cb = combinationStats(players, seasonMatches, { season }, 'cb').find(row => row.eligible)
  if (cb) candidates.push({ id: `cb:${cb.key}`, eyebrow: '🧱 Best CB pair', title: cb.playerIds.map(nameFor).join(' + '), detail: `${(cb.goalsAgainst / cb.togetherMinutes * 90).toFixed(2)} GA/90`, playerIds: cb.playerIds, score: 4 - cb.goalsAgainst / cb.togetherMinutes * 90 })
  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 4).map(({ score: _, ...story }) => story)
}
