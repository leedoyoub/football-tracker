import { selectMomCandidate } from './momSelection'
import { MOM_POLICY_REVISION } from './momPolicy'
import type { Appearance, Match, MatchEvent, Player, Position, RatingBreakdown } from '../types'
import { RATING_ENGINE_REVISION } from './ratingRevision.ts'
export { RATING_ENGINE_REVISION } from './ratingRevision.ts'
import {
  isOnPitchAtEvent,
  creditedMinutesPlayed,
  creditedPositionSegments,
  matchPositionAtEvent,
  matchPositionSegments,
  pitchWindow,
  normalizeMatchTimeline,
  REGULATION_MINUTES,
  scoringTeamId,
} from './timeline.ts'
import { opponentSot, opponentSotExposureForPositions } from './opponentSot.ts'
import { playerSaveCount } from './playerMatchFacts.ts'

export { creditedMinutesPlayed, creditedPitchIntervals, creditedPositionSegments, hasPitchAppearance, isOnPitchAtEvent, matchPositionAt, matchPositionAtEvent, matchPositionSegments, normalizeMatchPosition, normalizePositionFamily, pitchWindow, scoringTeamId } from './timeline.ts'

export const BASE_RATING = 6.5
export const GOALKEEPER_BASE_RATING = 7.1
export const MIN_RATING = 3.0
export const MAX_RATING = 10.0

type PositionRules = { goal: number; assist: number; teamGoal: number; conceded: number; suppressionMax: number }
const rule = (goal: number, assist: number, teamGoal: number, conceded: number, suppressionMax: number): PositionRules => ({ goal, assist, teamGoal, conceded, suppressionMax })

const striker = rule(.80, .50, 0, 0, 0)
const winger = rule(1, .65, .04, 0, 0)
const wideMidfielder = rule(1.05, .65, .05, -.10, .30)
const centralMidfielder = rule(1.05, .65, .07, -.08, .25)
const defensiveMidfielder = rule(1.15, .70, .06, -.15, .85)
const fullback = rule(1.25, .70, .03, -.25, 1)
const centreBack = rule(1.35, .75, 0, -.35, 1.40)

/** Finalized values. This table is intentionally data-only. */
export const POSITION_RULES: Record<Position, PositionRules> = {
  ST: striker, LST: striker, RST: striker, SS: striker,
  LW: winger, RW: winger, CAM: rule(1, .65, .02, 0, 0),
  LM: wideMidfielder, RM: wideMidfielder,
  CM: centralMidfielder, LCM: centralMidfielder, RCM: centralMidfielder,
  CDM: defensiveMidfielder, LDM: defensiveMidfielder, RDM: defensiveMidfielder,
  LB: fullback, LWB: fullback, RB: fullback, RWB: fullback,
  CB: centreBack, LCB: centreBack, RCB: centreBack,
  GK: rule(1.50, 1, 0, -.30, 0),
}

export function sotMultiplier(opponentSotPer90: number): number {
  return opponentSotPer90 > 0 ? Math.max(0, 1 - .10 * opponentSotPer90) : 1
}

const SAVE_BONUS_POINTS = [.20, .25, .29, .32, .35] as const
export function saveBonusPerSave(saveRate: number): number {
  if (!(saveRate > 0)) return SAVE_BONUS_POINTS[0]
  if (saveRate >= .8) return SAVE_BONUS_POINTS[4]
  const point = saveRate * 5
  const lower = Math.min(3, Math.floor(point))
  const start = SAVE_BONUS_POINTS[lower]
  return start + (SAVE_BONUS_POINTS[lower + 1] - start) * (point - lower)
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
/** Team-level SOT proxy: every applicable own-team GK save plus goals conceded. */
/** Compatibility alias; all consumers now use the canonical domain. */
export function opponentSotProxy(match: Match, teamId: string): number { return opponentSot(match, teamId) }

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
  suppressionIntervals: ReturnType<typeof suppressionByInterval>
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
    suppressionIntervals: suppressionByInterval(appearance, matchPositionSegments(match, appearance), exposureForTeam(match, ratingCacheEntry(match), appearance.teamId)),
    raw: rating.raw,
    clamped: rating.rating,
    display: rating.rating.toFixed(1),
    ratingSource: 'recomputed-current-engine',
    cacheHit: false,
    ...(player.rating === undefined ? {} : { legacyStoredPlayerRating: player.rating }),
    legacyStoredRatingUsed: false,
  }
}

type MatchRatings = { rows: RatingBreakdown[]; mom?: { policyRevision: number; playerId: string | undefined } }
type RatingCacheEntry = Pick<Match, 'id' | 'homeTeamId' | 'awayTeamId' | 'teamId' | 'halftimeOpponentSot' | 'fulltimeOpponentSot'> & {
  revision: number
  ratings: Map<string, RatingBreakdown | null>
  byPlayers: WeakMap<Player[], MatchRatings>
  exposureByTeam: Map<string, ReturnType<typeof opponentSotExposureForPositions>>
}

/** Both match and player queries depend on SOT and team facts in addition to the timeline. */
const ratingCache = new WeakMap<ReturnType<typeof normalizeMatchTimeline>, RatingCacheEntry>()
function ratingCacheEntry(match: Match, revision = RATING_ENGINE_REVISION): RatingCacheEntry {
  const timeline = normalizeMatchTimeline(match)
  const { id, homeTeamId, awayTeamId, teamId, halftimeOpponentSot, fulltimeOpponentSot } = match
  const cached = ratingCache.get(timeline)
  if (cached?.revision === revision && cached.id === id && cached.homeTeamId === homeTeamId && cached.awayTeamId === awayTeamId && cached.teamId === teamId && Object.is(cached.halftimeOpponentSot, halftimeOpponentSot) && Object.is(cached.fulltimeOpponentSot, fulltimeOpponentSot)) return cached
  const entry = { revision, id, homeTeamId, awayTeamId, teamId, halftimeOpponentSot, fulltimeOpponentSot, ratings: new Map(), byPlayers: new WeakMap(), exposureByTeam: new Map() }
  ratingCache.set(timeline, entry)
  return entry
}

function exposureForTeam(match: Match, cache: RatingCacheEntry, teamId: string) {
  let exposure = cache.exposureByTeam.get(teamId)
  if (!exposure) {
    exposure = opponentSotExposureForPositions(match, teamId)
    cache.exposureByTeam.set(teamId, exposure)
  }
  return exposure
}

/** One raw-data-only rating calculation for every screen and award. */
export function ratePlayerMatch(match: Match, player: Player, revision = RATING_ENGINE_REVISION): RatingBreakdown | null {
  return cachedPlayerRating(match, player, ratingCacheEntry(match, revision))
}

function cachedPlayerRating(match: Match, player: Player, cache: RatingCacheEntry) {
  if (cache.ratings.has(player.id)) return cache.ratings.get(player.id)!
  const rating = calculatePlayerMatch(match, player, cache)
  cache.ratings.set(player.id, rating)
  return rating
}

function suppressionByInterval(appearance: Appearance, segments: ReturnType<typeof matchPositionSegments>, exposureForPosition: ReturnType<typeof opponentSotExposureForPositions>) {
  // Tactical labels can split a continuous spell in the same role. Sum its
  // exposure before applying the floor, and count a boundary event only once.
  const spells: typeof segments = []
  for (const segment of segments) {
    const last = spells[spells.length - 1]
    if (last?.position === segment.position && last.exit === segment.enter) last.exit = segment.exit
    else spells.push({ ...segment })
  }
  return spells.map(row => {
    const minutes = Math.max(0, Math.min(REGULATION_MINUTES, row.exit) - row.enter)
    const exposure = minutes > 0 ? exposureForPosition(appearance, row.position, row.enter, row.exit) : 0
    const sot90 = minutes > 0 ? exposure * REGULATION_MINUTES / minutes : 0
    const multiplier = sotMultiplier(sot90)
    return { ...row, minutes, sot90, multiplier, bonus: POSITION_RULES[row.position].suppressionMax * multiplier * minutes / REGULATION_MINUTES }
  })
}

/** Most-played position is the effective role for display/MOM. Alphabetical
 * position order resolves exact-minute ties deterministically. */
function effectivePosition(segments: ReturnType<typeof matchPositionSegments>): Position | undefined {
  const minutes = new Map<Position, number>()
  for (const segment of segments) minutes.set(segment.position, (minutes.get(segment.position) ?? 0) + segment.exit - segment.enter)
  return [...minutes.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
}

function calculatePlayerMatch(match: Match, player: Player, cache: RatingCacheEntry): RatingBreakdown | null {
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
  const suppression = segments.some(segment => segment.enter < REGULATION_MINUTES && POSITION_RULES[segment.position].suppressionMax > 0)
    ? suppressionByInterval(appearance, segments, exposureForTeam(match, cache, teamId)).reduce((total, row) => total + row.bonus, 0)
    : 0
  const goalkeeperSaves = playerSaveCount(match, appearance)
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

const rosterIndex = new WeakMap<Player[], Map<string, { player: Player; order: number }[]>>()

function matchRatings(match: Match, players: Player[]): MatchRatings {
  const cache = ratingCacheEntry(match)
  const cached = cache.byPlayers.get(players)
  if (cached) return cached
  let roster = rosterIndex.get(players)
  if (!roster) {
    roster = new Map()
    players.forEach((player, order) => {
      const entries = roster!.get(player.id) ?? []
      entries.push({ player, order }); roster!.set(player.id, entries)
    })
    rosterIndex.set(players, roster)
  }
  // Preserve the original roster order (including duplicate IDs in legacy
  // callers), while never rating players absent from this Match.
  const participants = [...new Set(match.appearances.map(appearance => appearance.playerId))]
    .flatMap(id => roster.get(id) ?? []).sort((left, right) => left.order - right.order)
  const rows = participants.map(({ player }) => cachedPlayerRating(match, player, cache)).filter((row): row is RatingBreakdown => row !== null)
  const entry = { rows }
  cache.byPlayers.set(players, entry)
  return entry
}

export function rateMatch(match: Match, players: Player[]): RatingBreakdown[] {
  return matchRatings(match, players).rows.slice()
}
export { momPositionPriority } from './momSelection'
function momEventCount(match: Match, playerId: string, key: 'playerId' | 'assistPlayerId'): number {
  const appearance = match.appearances.find(item => item.playerId === playerId)
  return appearance ? match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && !event.ownGoal && event[key] === playerId && isOnPitchAtEvent(match, appearance, event)).length : 0
}
/** Uses the same effective match position exposed by the authoritative rating breakdown. */
export function getMatchManOfTheMatch(match: Match, players: Player[]): string | undefined {
  const entry = matchRatings(match, players)
  if (entry.mom?.policyRevision === MOM_POLICY_REVISION) return entry.mom.playerId
  let leaders: RatingBreakdown[] = []
  for (const row of entry.rows) {
    const best = leaders[0]
    if (!best || row.raw > best.raw ||
      (row.raw === MAX_RATING && best.raw === MAX_RATING && row.preClamp > best.preClamp)) {
      leaders = [row]
    } else if (row.raw === best.raw && (row.raw !== MAX_RATING || row.preClamp === best.preClamp)) {
      leaders.push(row)
    }
  }
  // Only exact leaders need the existing position and event tie-breaks. Keep
  // the full ordered multiset for legacy rosters with repeated player IDs.
  const playerId = leaders.length < 2 ? leaders[0]?.playerId : selectMomCandidate(leaders.map(rating => ({
    playerId: rating.playerId, average: rating.raw, position: rating.position, minutes: rating.minutes,
    goals: momEventCount(match, rating.playerId, 'playerId'),
    assists: momEventCount(match, rating.playerId, 'assistPlayerId'),
  })), match.id)
  entry.mom = { policyRevision: MOM_POLICY_REVISION, playerId }
  return playerId
}
