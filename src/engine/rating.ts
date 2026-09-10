import type { Appearance, Match, MatchEvent, Player, Position, RatingBreakdown } from '../types'
import { RATING_ENGINE_REVISION } from './ratingRevision'
export { RATING_ENGINE_REVISION } from './ratingRevision'
import {
  isOnPitchAtEvent,
  matchPositionAtEvent,
  matchPositionSegments,
  pitchWindow,
  normalizeMatchTimeline,
  scoringTeamId,
} from './timeline'

export { isOnPitchAtEvent, matchPositionAt, matchPositionAtEvent, matchPositionSegments, normalizeMatchPosition, pitchWindow, scoringTeamId } from './timeline'

export const BASE_RATING = 6.5
export const GOALKEEPER_BASE_RATING = 7.1
export const MIN_RATING = 3.0
export const MAX_RATING = 10.0

type PositionRules = { goal: number; assist: number; teamGoal: number; suppressionMax: number; conceded: number }
const RULE = (goal: number, assist: number, teamGoal: number, suppressionMax: number, conceded: number): PositionRules => ({ goal, assist, teamGoal, suppressionMax, conceded })

/** Finalized values. This table is intentionally data-only. */
export const POSITION_RULES: Record<Position, PositionRules> = {
  ST: RULE(.85, .50, 0, 0, 0), LST: RULE(.85, .50, 0, 0, 0), RST: RULE(.85, .50, 0, 0, 0),
  SS: RULE(.90, .55, 0, 0, 0), LW: RULE(1, .65, 0, 0, 0), RW: RULE(1, .65, 0, 0, 0), CAM: RULE(1, .65, 0, 0, 0),
  LM: RULE(1.05, .65, .05, .10, -.04), RM: RULE(1.05, .65, .05, .10, -.04),
  CM: RULE(1.05, .65, .10, .10, -.08), LCM: RULE(1.05, .65, .10, .10, -.08), RCM: RULE(1.05, .65, .10, .10, -.08),
  CDM: RULE(1.15, .70, .10, .50, -.10), LDM: RULE(1.15, .70, .10, .50, -.10), RDM: RULE(1.15, .70, .10, .50, -.10),
  LB: RULE(1.25, .70, .05, 1, -.30), LWB: RULE(1.25, .70, .05, 1, -.30), RB: RULE(1.25, .70, .05, 1, -.30), RWB: RULE(1.25, .70, .05, 1, -.30),
  CB: RULE(1.35, .75, 0, 1.35, -.35), LCB: RULE(1.35, .75, 0, 1.35, -.35), RCB: RULE(1.35, .75, 0, 1.35, -.35),
  GK: RULE(1.50, 1, 0, 0, -.35),
}

export const SOT_MULTIPLIERS = [1, .86, .73, .62, .53, .45, .38, .32, .27, .23] as const
export function sotMultiplier(opponentSOT: number): number { return opponentSOT >= 10 ? .20 : SOT_MULTIPLIERS[Math.max(0, Math.floor(opponentSOT))] ?? .20 }
export function saveBonusPerSave(saveRate: number): number {
  if (saveRate >= .8) return .25
  if (saveRate >= .6) return .22
  if (saveRate >= .4) return .20
  if (saveRate >= .2) return .16
  return .12
}
export function clampRating(value: number): number { return Math.min(MAX_RATING, Math.max(MIN_RATING, value)) }

export function matchScore(match: Match): { home: number; away: number } {
  let home = 0; let away = 0
  for (const event of match.events) {
    if (event.type !== 'goal') continue
    if (scoringTeamId(match, event) === match.homeTeamId) home++
    else if (scoringTeamId(match, event) === match.awayTeamId) away++
  }
  return { home, away }
}

export function resultModifier(match: Match, teamId: string): number {
  const score = matchScore(match)
  const scored = teamId === match.homeTeamId ? score.home : score.away
  const conceded = teamId === match.homeTeamId ? score.away : score.home
  return scored > conceded ? .1 : scored < conceded ? -.1 : 0
}

function eventValue(match: Match, appearance: Appearance, event: MatchEvent, key: 'goal' | 'assist' | 'teamGoal' | 'conceded'): number {
  const position = matchPositionAtEvent(match, appearance, event)
  return position ? POSITION_RULES[position][key] : 0
}
function validCount(value: unknown): number { return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 0 }

function saveCount(match: Match, appearance: Appearance): number {
  return match.events.reduce((total, event) => {
    if (event.type !== 'save' || event.playerId !== appearance.playerId || event.teamId !== appearance.teamId) return total
    if (event.minute === undefined) return matchPositionSegments(match, appearance).some(segment => segment.position === 'GK') ? total + validCount(event.count ?? 1) : total
    return matchPositionAtEvent(match, appearance, event) === 'GK' ? total + validCount(event.count ?? 1) : total
  }, 0)
}

/** Team-level SOT proxy: every applicable own-team GK save plus goals conceded. */
export function opponentSotProxy(match: Match, teamId: string): number {
  const saves = match.events.reduce((total, event) => {
    if (event.type !== 'save' || event.teamId !== teamId) return total
    const keeper = match.appearances.find(appearance => appearance.playerId === event.playerId && appearance.teamId === teamId)
    if (!keeper) return total
    if (event.minute === undefined) return matchPositionSegments(match, keeper).some(segment => segment.position === 'GK') ? total + validCount(event.count ?? 1) : total
    return matchPositionAtEvent(match, keeper, event) === 'GK' ? total + validCount(event.count ?? 1) : total
  }, 0)
  const goals = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && scoringTeamId(match, event) !== teamId).length
  return saves + goals
}

export type ConcededGoalTrace = {
  eventId: string
  minute: number
  sequence?: number
  savedIndex: number
  onPitch: boolean
  position?: Position
  penalty: number
}

export type PlayerMatchRatingTrace = {
  playerId: string
  matchId: string
  status: 'starter' | 'substitute'
  enter: number
  exit: number
  minutes: number
  intervals: ReturnType<typeof matchPositionSegments>
  concededGoals: ConcededGoalTrace[]
  opponentSot: number
  sotMultiplier: number
  sotBonus: number
  goals: number
  assists: number
  teamGoals: number
  ownGoals: number
  concededPenalty: number
  individualCausePenalty: number
  saveBonus: number
  result: number
  componentSum: number
  preClamp: number
  suppressionIntervals: { enter: number; exit: number; position: Position; minutes: number; bonus: number }[]
  raw: number
  clamped: number
  display: string
  ratingSource: 'recomputed-current-engine'
  cacheHit: false
  legacyStoredPlayerRating?: number
  legacyStoredRatingUsed: false
}

/** Explain the exact same raw derivation consumed by Match Detail, Player
 * Detail, MOM, Rankings, and Best XI. This is diagnostic only; it never reads
 * a persisted rating as authoritative. */
export function tracePlayerMatchRating(match: Match, player: Player): PlayerMatchRatingTrace | null {
  const appearance = match.appearances.find(item => item.playerId === player.id)
  const rating = ratePlayerMatch(match, player)
  if (!appearance || !rating) return null
  const opponentSot = opponentSotProxy(match, appearance.teamId)
  const concededGoals = match.events.flatMap((event, savedIndex): ConcededGoalTrace[] => {
    if (event.type !== 'goal' || scoringTeamId(match, event) === appearance.teamId) return []
    const position = matchPositionAtEvent(match, appearance, event)
    return [{ eventId: event.id, minute: event.minute, sequence: event.sequence, savedIndex, onPitch: Boolean(position), position, penalty: position ? POSITION_RULES[position].conceded : 0 }]
  })
  const ownGoals = match.events.filter(event => event.type === 'goal' && event.ownGoal && event.playerId === player.id && isOnPitchAtEvent(match, appearance, event)).length
  const componentSum = rating.base + rating.result + rating.goals + rating.assists + rating.teamGoals + rating.conceded + rating.noConceded + rating.concededCause + rating.saves
  return {
    playerId: player.id,
    matchId: match.id,
    status: appearance.role === 'starter' ? 'starter' : 'substitute',
    enter: rating.enter,
    exit: rating.exit,
    minutes: rating.minutes,
    intervals: matchPositionSegments(match, appearance),
    concededGoals,
    opponentSot,
    sotMultiplier: sotMultiplier(opponentSot),
    sotBonus: rating.noConceded,
    goals: rating.goals,
    assists: rating.assists,
    teamGoals: rating.teamGoals,
    ownGoals,
    concededPenalty: rating.conceded,
    individualCausePenalty: rating.concededCause,
    saveBonus: rating.saves,
    result: rating.result,
    componentSum,
    preClamp: rating.preClamp,
    suppressionIntervals: suppressionByInterval(match, appearance),
    raw: rating.raw,
    clamped: rating.rating,
    display: rating.rating.toFixed(1),
    ratingSource: 'recomputed-current-engine',
    cacheHit: false,
    ...(player.rating === undefined ? {} : { legacyStoredPlayerRating: player.rating }),
    legacyStoredRatingUsed: false,
  }
}

/** One raw-data-only rating calculation for every screen and award. */
const ratingCache = new WeakMap<ReturnType<typeof normalizeMatchTimeline>, { revision: number; ratings: Map<string, RatingBreakdown | null> }>()
export function ratePlayerMatch(match: Match, player: Player, revision = RATING_ENGINE_REVISION): RatingBreakdown | null {
  const timeline = normalizeMatchTimeline(match)
  let entry = ratingCache.get(timeline)
  if (!entry || entry.revision !== revision) { entry = { revision, ratings: new Map() }; ratingCache.set(timeline, entry) }
  const ratings = entry.ratings
  if (ratings.has(player.id)) return ratings.get(player.id)!
  const rating = calculatePlayerMatch(match, player)
  ratings.set(player.id, rating)
  return rating
}

function suppressionByInterval(match: Match, appearance: Appearance) {
  const segments = matchPositionSegments(match, appearance)
  const minutes = segments.reduce((total, row) => total + row.exit - row.enter, 0)
  const multiplier = sotMultiplier(opponentSotProxy(match, appearance.teamId))
  // Cap the total minutes factor once, preserving each position's actual share.
  return segments.map(row => ({ ...row, minutes: row.exit - row.enter, bonus: POSITION_RULES[row.position].suppressionMax * multiplier * (row.exit - row.enter) / Math.max(90, minutes) }))
}

function calculatePlayerMatch(match: Match, player: Player): RatingBreakdown | null {
  const appearance = match.appearances.find(item => item.playerId === player.id)
  if (!appearance) return null
  const window = pitchWindow(match, appearance)
  if (!window || window.exit <= window.enter) return null
  const segments = matchPositionSegments(match, appearance)
  const position = segments[0]?.position
  if (!position) return null
  const teamId = appearance.teamId
  const minutes = segments.reduce((total, row) => total + row.exit - row.enter, 0)
  if (!minutes) return null
  const goals = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && !event.ownGoal && event.playerId === player.id && isOnPitchAtEvent(match, appearance, event))
  const assists = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id && isOnPitchAtEvent(match, appearance, event))
  const teamGoals = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && scoringTeamId(match, event) === teamId && isOnPitchAtEvent(match, appearance, event) && event.playerId !== player.id && event.assistPlayerId !== player.id)
  const concededGoals = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && scoringTeamId(match, event) !== teamId && isOnPitchAtEvent(match, appearance, event))
  const caused = concededGoals.filter(event => event.concededGoalCausePlayerId === player.id || (event.ownGoal && event.playerId === player.id)).length
  const suppression = suppressionByInterval(match, appearance).reduce((total, row) => total + row.bonus, 0)
  const goalkeeperSaves = saveCount(match, appearance)
  const goalkeeperConceded = concededGoals.filter(event => matchPositionAtEvent(match, appearance, event) === 'GK').length
  const saveRate = goalkeeperSaves + goalkeeperConceded ? goalkeeperSaves / (goalkeeperSaves + goalkeeperConceded) : 0
  const saveBonus = goalkeeperSaves ? goalkeeperSaves * saveBonusPerSave(saveRate) : 0
  const breakdown: RatingBreakdown = {
    playerId: player.id, matchId: match.id, played: true, starter: appearance.role === 'starter', enter: window.enter, exit: window.exit, minutes, position,
    base: position === 'GK' ? GOALKEEPER_BASE_RATING : BASE_RATING, result: resultModifier(match, teamId),
    goals: goals.reduce((total, event) => total + eventValue(match, appearance, event, 'goal'), 0),
    assists: assists.reduce((total, event) => total + eventValue(match, appearance, event, 'assist'), 0),
    teamGoals: teamGoals.reduce((total, event) => total + eventValue(match, appearance, event, 'teamGoal'), 0),
    conceded: concededGoals.reduce((total, event) => total + eventValue(match, appearance, event, 'conceded'), 0),
    cleanSheet: 0, noConceded: suppression, noPoint: 0, ownGoals: 0, concededCause: caused * -.3, saves: saveBonus, preClamp: 0, raw: 0, rating: 0,
  }
  breakdown.preClamp = breakdown.base + breakdown.result + breakdown.goals + breakdown.assists + breakdown.teamGoals + breakdown.conceded + breakdown.noConceded + breakdown.concededCause + breakdown.saves
  breakdown.raw = clampRating(breakdown.preClamp)
  breakdown.rating = breakdown.raw
  return breakdown
}

export function rateMatch(match: Match, players: Player[]): RatingBreakdown[] { return players.map(player => ratePlayerMatch(match, player)).filter((row): row is RatingBreakdown => row !== null) }
export function getMatchManOfTheMatch(match: Match, players: Player[]): string | undefined { return rateMatch(match, players).sort((left, right) => right.raw - left.raw || right.minutes - left.minutes || left.playerId.localeCompare(right.playerId))[0]?.playerId }
