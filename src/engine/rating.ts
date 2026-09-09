import type { Appearance, Match, MatchEvent, Player, Position, RatingBreakdown } from '../types'

export const BASE_RATING = 6.5
export const GOALKEEPER_BASE_RATING = 7.1
export const MIN_RATING = 3.0
export const MAX_RATING = 10.0

type PositionRules = { goal: number; assist: number; teamGoal: number; suppressionMax: number; conceded: number }
const RULE = (goal: number, assist: number, teamGoal: number, suppressionMax: number, conceded: number): PositionRules => ({ goal, assist, teamGoal, suppressionMax, conceded })

export const POSITION_RULES: Record<Position, PositionRules> = {
  ST: RULE(.85, .50, 0, 0, 0), LST: RULE(.85, .50, 0, 0, 0), RST: RULE(.85, .50, 0, 0, 0),
  SS: RULE(.90, .55, 0, 0, 0), LW: RULE(1, .65, 0, 0, 0), RW: RULE(1, .65, 0, 0, 0), CAM: RULE(1, .65, 0, 0, 0),
  LM: RULE(1.05, .65, .05, .10, -.04), RM: RULE(1.05, .65, .05, .10, -.04),
  CM: RULE(1.05, .65, .10, .10, -.08), LCM: RULE(1.05, .65, .10, .10, -.08), RCM: RULE(1.05, .65, .10, .10, -.08),
  CDM: RULE(1.15, .70, .10, .50, -.10), LDM: RULE(1.15, .70, .10, .50, -.10), RDM: RULE(1.15, .70, .10, .50, -.10),
  LB: RULE(1.25, .70, .05, 1, -.20), LWB: RULE(1.25, .70, .05, 1, -.20), RB: RULE(1.25, .70, .05, 1, -.20), RWB: RULE(1.25, .70, .05, 1, -.20),
  CB: RULE(1.35, .75, 0, 1.35, -.25), LCB: RULE(1.35, .75, 0, 1.35, -.25), RCB: RULE(1.35, .75, 0, 1.35, -.25),
  GK: RULE(1.50, 1, 0, 0, -.25),
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
    const teamId = scoringTeamId(match, event)
    if (teamId === match.homeTeamId) home += 1
    else away += 1
  }
  return { home, away }
}
export function resultModifier(match: Match, teamId: string): number {
  const score = matchScore(match); const scored = teamId === match.homeTeamId ? score.home : score.away; const conceded = teamId === match.homeTeamId ? score.away : score.home
  return scored > conceded ? .1 : scored < conceded ? -.1 : 0
}
export function pitchWindow(match: Match, appearance: Appearance): { enter: number; exit: number } | null {
  const duration = match.duration || 90
  const subs = match.events.filter((event): event is Extract<MatchEvent, { type: 'sub' }> => event.type === 'sub').sort((a, b) => a.minute - b.minute)
  if (appearance.role === 'starter') { const off = subs.find(sub => sub.playerOutId === appearance.playerId); return { enter: 0, exit: off ? off.minute : duration } }
  const on = subs.find(sub => sub.playerInId === appearance.playerId)
  if (!on) return null
  const off = subs.find(sub => sub.playerOutId === appearance.playerId && sub.minute > on.minute)
  return { enter: on.minute, exit: off ? off.minute : duration }
}
function onPitch(enter: number, exit: number, minute: number): boolean { return minute >= enter && minute < exit }
function scoringTeamId(match: Match, event: Extract<MatchEvent, { type: 'goal' }>): string { return event.ownGoal ? event.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId : event.teamId }

export function matchPositionSegments(match: Match, appearance: Appearance): { enter: number; exit: number; position: Position }[] {
  const window = pitchWindow(match, appearance)
  if (!window || window.exit <= window.enter) return []
  const subOn = match.events.find((event): event is Extract<MatchEvent, { type: 'sub' }> => event.type === 'sub' && event.playerInId === appearance.playerId)
  let position = appearance.role === 'bench' && subOn ? subOn.position : normalizeMatchPosition(appearance.matchPosition) ?? appearance.position
  let enter = window.enter; const segments: { enter: number; exit: number; position: Position }[] = []
  const changesByMinute = new Map((appearance.positionHistory ?? []).filter(change => Number.isInteger(change.minute) && change.minute >= window.enter && change.minute < window.exit && normalizeMatchPosition(change.position)).map(change => [change.minute, change]))
  for (const change of [...changesByMinute.values()].sort((a, b) => a.minute - b.minute)) {
    const next = normalizeMatchPosition(change.position)!
    if (next === normalizeMatchPosition(position)) continue
    if (change.minute > enter) segments.push({ enter, exit: change.minute, position })
    enter = change.minute; position = next
  }
  segments.push({ enter, exit: window.exit, position })
  return segments
}
export function matchPositionAt(match: Match, appearance: Appearance, minute?: number): Position | undefined {
  const segments = matchPositionSegments(match, appearance)
  return minute === undefined ? segments[0]?.position : segments.find(segment => onPitch(segment.enter, segment.exit, minute))?.position
}

function eventValue(match: Match, appearance: Appearance, minute: number, key: 'goal' | 'assist' | 'teamGoal' | 'conceded'): number {
  const position = matchPositionAt(match, appearance, minute)
  return position ? POSITION_RULES[position][key] : 0
}
function saveCount(match: Match, appearance: Appearance): number {
  const window = pitchWindow(match, appearance)
  if (!window) return 0
  return match.events.filter((event): event is Extract<MatchEvent, { type: 'save' }> => event.type === 'save' && event.playerId === appearance.playerId && (event.minute === undefined ? matchPositionAt(match, appearance, window.enter) === 'GK' : onPitch(window.enter, window.exit, event.minute) && matchPositionAt(match, appearance, event.minute) === 'GK')).reduce((sum, event) => sum + (event.count ?? 1), 0)
}

export function ratePlayerMatch(match: Match, player: Player): RatingBreakdown | null {
  const appearance = match.appearances.find(item => item.playerId === player.id)
  if (!appearance) return null
  const window = pitchWindow(match, appearance)
  if (!window || window.exit <= window.enter) return null
  const segments = matchPositionSegments(match, appearance)
  const position = segments[0]!.position; const teamId = appearance.teamId; const { enter, exit } = window; const minutes = exit - enter
  const ownGoals = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && !event.ownGoal && event.playerId === player.id && onPitch(enter, exit, event.minute))
  const assists = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id && onPitch(enter, exit, event.minute))
  const teamGoals = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && scoringTeamId(match, event) === teamId && onPitch(enter, exit, event.minute) && event.playerId !== player.id && event.assistPlayerId !== player.id)
  const concededGoals = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && scoringTeamId(match, event) !== teamId && onPitch(enter, exit, event.minute))
  const caused = concededGoals.filter(event => event.concededGoalCausePlayerId === player.id || (event.ownGoal && event.playerId === player.id)).length
  const opponentSOT = match.events.filter((event): event is Extract<MatchEvent, { type: 'save' }> => event.type === 'save' && event.teamId === teamId).reduce((sum, event) => sum + (event.count ?? 1), 0) + match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && scoringTeamId(match, event) !== teamId).length
  const suppression = segments.reduce((sum, segment) => sum + POSITION_RULES[segment.position].suppressionMax * ((segment.exit - segment.enter) / 90), 0) * sotMultiplier(opponentSOT)
  const goalkeeperSaves = saveCount(match, appearance)
  const goalkeeperConceded = concededGoals.filter(event => matchPositionAt(match, appearance, event.minute) === 'GK').length
  const saveRate = goalkeeperSaves + goalkeeperConceded ? goalkeeperSaves / (goalkeeperSaves + goalkeeperConceded) : 0
  const saveBonus = goalkeeperSaves ? goalkeeperSaves * saveBonusPerSave(saveRate) : 0
  const breakdown: RatingBreakdown = {
    playerId: player.id, matchId: match.id, played: true, starter: appearance.role === 'starter', enter, exit, minutes, position,
    base: position === 'GK' ? GOALKEEPER_BASE_RATING : BASE_RATING, result: resultModifier(match, teamId),
    goals: ownGoals.reduce((sum, event) => sum + eventValue(match, appearance, event.minute, 'goal'), 0),
    assists: assists.reduce((sum, event) => sum + eventValue(match, appearance, event.minute, 'assist'), 0),
    teamGoals: teamGoals.reduce((sum, event) => sum + eventValue(match, appearance, event.minute, 'teamGoal'), 0),
    conceded: concededGoals.reduce((sum, event) => sum + eventValue(match, appearance, event.minute, 'conceded'), 0),
    cleanSheet: 0, noConceded: suppression, noPoint: 0, ownGoals: 0, concededCause: caused * -.3, saves: saveBonus, raw: 0, rating: 0,
  }
  breakdown.raw = breakdown.base + breakdown.result + breakdown.goals + breakdown.assists + breakdown.teamGoals + breakdown.conceded + breakdown.noConceded + breakdown.concededCause + breakdown.saves
  breakdown.rating = clampRating(breakdown.raw)
  return breakdown
}
function normalizeMatchPosition(value?: string): Position | undefined {
  if (!value) return undefined
  const aliases: Record<string, Position> = { LST: 'ST', RST: 'ST', LCAM: 'CAM', RCAM: 'CAM', LDM: 'CDM', RDM: 'CDM', LCM: 'CM', RCM: 'CM', LCB: 'CB', RCB: 'CB' }
  return aliases[value] ?? (POSITION_RULES[value as Position] ? value as Position : undefined)
}
export function rateMatch(match: Match, players: Player[]): RatingBreakdown[] { return players.map(player => ratePlayerMatch(match, player)).filter((row): row is RatingBreakdown => row !== null) }
export function getMatchManOfTheMatch(match: Match, players: Player[]): string | undefined { return rateMatch(match, players).sort((a, b) => b.raw - a.raw || b.minutes - a.minutes || a.playerId.localeCompare(b.playerId))[0]?.playerId }
