import type { Appearance, Match, MatchEvent, Player, Position, RatingBreakdown } from '../types'
import { RATING_ENGINE_REVISION } from './ratingRevision.ts'
export { RATING_ENGINE_REVISION } from './ratingRevision.ts'
import {
  isOnPitchAtEvent,
  creditedMinutesPlayed,
  creditedPositionSegments,
  matchPositionAtEvent,
  matchPositionSegments,
  normalizePositionFamily,
  pitchWindow,
  normalizeMatchTimeline,
  scoringTeamId,
} from './timeline.ts'

export { creditedMinutesPlayed, creditedPitchIntervals, creditedPositionSegments, hasPitchAppearance, isOnPitchAtEvent, matchPositionAt, matchPositionAtEvent, matchPositionSegments, normalizeMatchPosition, normalizePositionFamily, pitchWindow, scoringTeamId } from './timeline.ts'

export const BASE_RATING = 6.5
export const GOALKEEPER_BASE_RATING = 7.0
export const MIN_RATING = 3.0
export const MAX_RATING = 10.0

type PositionRules = { goal: number; assist: number; teamGoal: number; suppressionMax: number; conceded: number }
const RULE = (goal: number, assist: number, teamGoal: number, suppressionMax: number, conceded: number): PositionRules => ({ goal, assist, teamGoal, suppressionMax, conceded })

/** Finalized values. This table is intentionally data-only. */
export const POSITION_RULES: Record<Position, PositionRules> = {
  ST: RULE(.90, .55, 0, 0, 0), LST: RULE(.90, .55, 0, 0, 0), RST: RULE(.90, .55, 0, 0, 0),
  SS: RULE(.90, .55, 0, 0, 0), LW: RULE(1, .65, .05, 0, 0), RW: RULE(1, .65, .05, 0, 0), CAM: RULE(1, .65, .05, 0, 0),
  LM: RULE(1.05, .65, .05, .15, -.10), RM: RULE(1.05, .65, .05, .15, -.10),
  CM: RULE(1.05, .65, .07, .25, -.10), LCM: RULE(1.05, .65, .07, .25, -.10), RCM: RULE(1.05, .65, .07, .25, -.10),
  CDM: RULE(1.15, .70, .06, .50, -.15), LDM: RULE(1.15, .70, .06, .50, -.15), RDM: RULE(1.15, .70, .06, .50, -.15),
  LB: RULE(1.25, .70, .04, 1, -.30), LWB: RULE(1.25, .70, .04, 1, -.30), RB: RULE(1.25, .70, .04, 1, -.30), RWB: RULE(1.25, .70, .04, 1, -.30),
  CB: RULE(1.35, .75, 0, 1.30, -.35), LCB: RULE(1.35, .75, 0, 1.30, -.35), RCB: RULE(1.35, .75, 0, 1.30, -.35),
  GK: RULE(1.50, 1, 0, 0, -.35),
}

export const SOT_MULTIPLIERS = [1, .86, .73, .62, .53, .45, .38, .32, .27, .23] as const
/** Preserves the historic table at integer SOT values while smoothly handling
 * interval-normalised fractional SOT/90 values. */
export function sotMultiplier(opponentSOT: number): number {
  if (!Number.isFinite(opponentSOT) || opponentSOT <= 0) return SOT_MULTIPLIERS[0]
  if (opponentSOT >= 10) return .20
  const lower = Math.floor(opponentSOT)
  const fraction = opponentSOT - lower
  const start = SOT_MULTIPLIERS[lower] ?? .20
  const end = SOT_MULTIPLIERS[lower + 1] ?? .20
  return start + (end - start) * fraction
}
export function saveBonusPerSave(saveRate: number): number {
  if (saveRate >= .8) return .30
  if (saveRate >= .6) return .27
  if (saveRate >= .4) return .25
  if (saveRate >= .2) return .21
  return .17
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
  return scored > conceded ? .1 : scored < conceded ? -.3 : 0
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

function validTeamSaveEvents(match: Match, teamId: string): Extract<MatchEvent, { type: 'save' }>[] {
  return match.events.flatMap((event): Extract<MatchEvent, { type: 'save' }>[] => {
    if (event.type !== 'save' || event.teamId !== teamId || !validCount(event.count ?? 1)) return []
    const keeper = match.appearances.find(appearance => appearance.playerId === event.playerId && appearance.teamId === teamId)
    if (!keeper) return []
    const isGoalkeeper = event.minute === undefined
      ? matchPositionSegments(match, keeper).some(segment => segment.position === 'GK')
      : matchPositionAtEvent(match, keeper, event) === 'GK'
    return isGoalkeeper ? [event] : []
  })
}

/** Team-level SOT proxy: every applicable own-team GK save plus goals conceded. */
export function opponentSotProxy(match: Match, teamId: string): number {
  const saves = validTeamSaveEvents(match, teamId).reduce((total, event) => total + validCount(event.count ?? 1), 0)
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
  const totalMinutes = creditedMinutesPlayed(match, appearance)
  const saves = validTeamSaveEvents(match, appearance.teamId)
  const undatedSaves = saves.filter(event => event.minute === undefined).reduce((total, event) => total + validCount(event.count ?? 1), 0)
  const opponentGoals = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && scoringTeamId(match, event) !== appearance.teamId)
  return segments.map(row => {
    const minutes = creditedPositionSegments(match, appearance).filter(segment => segment.position === row.position && segment.enter >= row.enter && segment.exit <= row.exit).reduce((total, segment) => total + segment.exit - segment.enter, 0)
    const contains = (event: MatchEvent) => event.minute !== undefined && event.minute >= row.enter && event.minute <= row.exit && matchPositionAtEvent(match, appearance, event) === row.position
    const exactTimedSaves = saves.filter(contains).reduce((total, event) => total + validCount(event.count ?? 1), 0)
    const conceded = opponentGoals.filter(contains).length
    const sot90 = minutes > 0 ? (exactTimedSaves + undatedSaves * minutes / 90 + conceded) * 90 / minutes : 0
    const multiplier = sotMultiplier(sot90)
    return { ...row, minutes, sot90, multiplier, bonus: POSITION_RULES[row.position].suppressionMax * multiplier * minutes / Math.max(90, totalMinutes) }
  })
}

/** Most-played position is the effective role for display/MOM. Alphabetical
 * position order resolves exact-minute ties deterministically. */
function effectivePosition(segments: ReturnType<typeof matchPositionSegments>): Position | undefined {
  const minutes = new Map<Position, number>()
  for (const segment of segments) minutes.set(segment.position, (minutes.get(segment.position) ?? 0) + segment.exit - segment.enter)
  return [...minutes.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
}

function calculatePlayerMatch(match: Match, player: Player): RatingBreakdown | null {
  const appearance = match.appearances.find(item => item.playerId === player.id)
  if (!appearance) return null
  const window = pitchWindow(match, appearance)
  if (!window || window.exit <= window.enter) return null
  const segments = matchPositionSegments(match, appearance)
  const creditedSegments = creditedPositionSegments(match, appearance)
  const position = effectivePosition(creditedSegments.length ? creditedSegments : segments)
  if (!position) return null
  const teamId = appearance.teamId
  const minutes = creditedMinutesPlayed(match, appearance)
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
    // New match flows enforce one fixed GK, so a match has one base role.
    // Legacy mixed-role records remain readable through the effective role.
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
const MOM_POSITION_PRIORITY: Record<Position, number> = {
  GK: 0, CB: 1, LCB: 1, RCB: 1, LB: 2, LWB: 2, RB: 2, RWB: 2,
  CDM: 3, LDM: 3, RDM: 3, CM: 4, LCM: 4, RCM: 4, LM: 5, RM: 5,
  CAM: 6, LW: 7, RW: 7, SS: 8, ST: 9, LST: 9, RST: 9,
}
export function momPositionPriority(position?: string): number | undefined {
  const family = normalizePositionFamily(position)
  return family ? MOM_POSITION_PRIORITY[family] : undefined
}
function momEventCount(match: Match, playerId: string, key: 'playerId' | 'assistPlayerId'): number {
  const appearance = match.appearances.find(item => item.playerId === playerId)
  return appearance ? match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && !event.ownGoal && event[key] === playerId && isOnPitchAtEvent(match, appearance, event)).length : 0
}
function seededTieIndex(matchId: string, playerIds: string[]): number {
  const seed = `${matchId}:${playerIds.slice().sort().join(',')}`
  let hash = 2166136261
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % playerIds.length
}
/** Uses the same effective match position exposed by the authoritative rating breakdown. */
export function getMatchManOfTheMatch(match: Match, players: Player[]): string | undefined {
  const candidates = rateMatch(match, players).map(rating => ({
    rating,
    priority: momPositionPriority(rating.position)!,
    goals: momEventCount(match, rating.playerId, 'playerId'),
    assists: momEventCount(match, rating.playerId, 'assistPlayerId'),
  }))
  const ordered = candidates.sort((left, right) => {
    const leftRating = left.rating; const rightRating = right.rating
    if (leftRating.raw !== rightRating.raw) return rightRating.raw - leftRating.raw
    const positionPriority = left.priority - right.priority
    if (positionPriority) return positionPriority
    const goals = right.goals - left.goals
    if (goals) return goals
    const assists = right.assists - left.assists
    if (assists) return assists
    return rightRating.minutes - leftRating.minutes
  })
  const best = ordered[0]
  if (!best) return undefined
  const tied = ordered.filter(candidate =>
    candidate.rating.raw === best.rating.raw &&
    candidate.priority === best.priority &&
    candidate.goals === best.goals &&
    candidate.assists === best.assists &&
    candidate.rating.minutes === best.rating.minutes,
  )
  const tiedIds = tied.map(candidate => candidate.rating.playerId).sort()
  return tiedIds[seededTieIndex(match.id, tiedIds)]
}
