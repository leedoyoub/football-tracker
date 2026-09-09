import type {
  Appearance,
  Match,
  MatchEvent,
  Player,
  Position,
  RatingBreakdown,
} from '../types'

export const BASE_RATING = 6.5
export const MIN_RATING = 3.0
export const MAX_RATING = 10.0

type PositionRules = {
  goal: number
  assist: number
  teamGoal: number
  noConcededMax: number
  save: number
  conceded: (count: number) => number
}

const flatConceded = (each: number) => (count: number) => each * count
const tieredConceded = (first: number, rest: number) => (count: number) =>
  count === 0 ? 0 : first + Math.max(0, count - 1) * rest

const RULE = (
  goal: number, assist: number, teamGoal: number, noConcededMax: number,
  conceded: (count: number) => number, save = 0,
): PositionRules => ({ goal, assist, teamGoal, noConcededMax, conceded, save })

export const POSITION_RULES: Record<Position, PositionRules> = {
  ST: RULE(.90, .55, 0, 0, flatConceded(-.05)), LST: RULE(.90, .55, 0, 0, flatConceded(-.05)), RST: RULE(.90, .55, 0, 0, flatConceded(-.05)),
  SS: RULE(.95, .60, 0, 0, flatConceded(-.05)),
  LW: RULE(1.00, .65, .05, .10, flatConceded(-.05)), RW: RULE(1.00, .65, .05, .10, flatConceded(-.05)),
  CAM: RULE(1.00, .65, .05, .15, flatConceded(-.10)),
  LM: RULE(1.05, .70, .05, .30, flatConceded(-.10)), RM: RULE(1.05, .70, .05, .30, flatConceded(-.10)),
  CM: RULE(1.10, .70, .15, .30, tieredConceded(-.20, -.30)), LCM: RULE(1.10, .70, .15, .30, tieredConceded(-.20, -.30)), RCM: RULE(1.10, .70, .15, .30, tieredConceded(-.20, -.30)),
  CDM: RULE(1.25, .80, .15, .50, tieredConceded(-.25, -.35)), LDM: RULE(1.25, .80, .15, .50, tieredConceded(-.25, -.35)), RDM: RULE(1.25, .80, .15, .50, tieredConceded(-.25, -.35)),
  CB: RULE(1.35, .80, .05, 1.00, tieredConceded(-.35, -.45)), LCB: RULE(1.35, .80, .05, 1.00, tieredConceded(-.35, -.45)), RCB: RULE(1.35, .80, .05, 1.00, tieredConceded(-.35, -.45)),
  LB: RULE(1.25, .80, .05, .95, tieredConceded(-.35, -.45)), LWB: RULE(1.25, .80, .05, .95, tieredConceded(-.35, -.45)), RB: RULE(1.25, .80, .05, .95, tieredConceded(-.35, -.45)), RWB: RULE(1.25, .80, .05, .95, tieredConceded(-.35, -.45)),
  GK: RULE(0, 0, 0, .70, tieredConceded(-.35, -.45), .30),
}

export function clampRating(value: number): number {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, value))
}

export function matchScore(match: Match): { home: number; away: number } {
  let home = 0
  let away = 0
  for (const event of match.events) {
    if (event.type !== 'goal') continue
    const scoringTeamId = event.ownGoal
      ? event.teamId === match.homeTeamId
        ? match.awayTeamId
        : match.homeTeamId
      : event.teamId
    if (scoringTeamId === match.homeTeamId) home += 1
    else away += 1
  }
  return { home, away }
}

export function resultModifier(match: Match, teamId: string): number {
  const { home, away } = matchScore(match)
  const scored = teamId === match.homeTeamId ? home : away
  const conceded = teamId === match.homeTeamId ? away : home
  if (scored > conceded) return 0.1
  if (scored < conceded) return -0.3
  return 0
}

export function pitchWindow(
  match: Match,
  appearance: Appearance,
): { enter: number; exit: number } | null {
  const duration = match.duration || 90
  const subs = match.events
    .filter((e): e is Extract<MatchEvent, { type: 'sub' }> => e.type === 'sub')
    .sort((a, b) => a.minute - b.minute)

  if (appearance.role === 'starter') {
    const off = subs.find((s) => s.playerOutId === appearance.playerId)
    return { enter: 0, exit: off ? off.minute : duration }
  }

  const on = subs.find((s) => s.playerInId === appearance.playerId)
  if (!on) return null
  const off = subs.find(
    (s) => s.playerOutId === appearance.playerId && s.minute > on.minute,
  )
  return { enter: on.minute, exit: off ? off.minute : duration }
}

function onPitch(enter: number, exit: number, minute: number): boolean {
  return minute >= enter && minute < exit
}

function scoringTeamId(match: Match, event: Extract<MatchEvent, { type: 'goal' }>): string {
  if (!event.ownGoal) return event.teamId
  return event.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
}

function teamGoalBonus(
  match: Match,
  teamId: string,
  playerId: string,
  enter: number,
  exit: number,
  rules: PositionRules,
): number {
  const goals = match.events.filter((event) => {
    if (event.type !== 'goal') return false
    if (!onPitch(enter, exit, event.minute)) return false
    return scoringTeamId(match, event) === teamId &&
      event.playerId !== playerId && event.assistPlayerId !== playerId
  })
  return goals.length * rules.teamGoal
}

function noConcededBonus(match: Match, teamId: string, enter: number, exit: number, maximum: number): number {
  if (maximum === 0) return 0
  const duration = match.duration || 90
  const concessions = match.events
    .filter((e): e is Extract<MatchEvent, { type: 'goal' }> => e.type === 'goal' && scoringTeamId(match, e) !== teamId && onPitch(enter, exit, e.minute))
    .sort((a, b) => a.minute - b.minute)
  const periods = [...concessions.map((event) => event.minute), exit]
  let start = enter
  return periods.reduce((total, end) => {
    const minutes = Math.max(0, end - start)
    start = end
    // Each segment is calculated independently.
    return total + maximum * (minutes / duration) ** 2
  }, 0)
}


export function matchPositionSegments(match: Match, appearance: Appearance): { enter: number; exit: number; position: Position }[] {
  const window = pitchWindow(match, appearance)
  if (!window || window.exit <= window.enter) return []
  const subOn = match.events.find((event): event is Extract<MatchEvent, { type: 'sub' }> =>
    event.type === 'sub' && event.playerInId === appearance.playerId,
  )
  let position = appearance.role === 'bench' && subOn
    ? subOn.position : normalizeMatchPosition(appearance.matchPosition) ?? appearance.position
  let enter = window.enter
  const segments: { enter: number; exit: number; position: Position }[] = []
  const changesByMinute = new Map((appearance.positionHistory ?? []).filter(change =>
    Number.isInteger(change.minute) && change.minute >= 0 && change.minute < window.exit && normalizeMatchPosition(change.position),
  ).map(change => [change.minute, change]))
  const changes = [...changesByMinute.values()].sort((a, b) => a.minute - b.minute)
  for (const change of changes) {
    if (normalizeMatchPosition(change.position) === normalizeMatchPosition(position)) continue
    if (change.minute > enter) segments.push({ enter, exit: change.minute, position })
    enter = Math.max(window.enter, change.minute)
    position = change.position
  }
  segments.push({ enter, exit: window.exit, position })
  return segments
}

export function matchPositionAt(match: Match, appearance: Appearance, minute?: number): Position | undefined {
  const segments = matchPositionSegments(match, appearance)
  return minute === undefined ? segments[0]?.position : segments.find(segment => onPitch(segment.enter, segment.exit, minute))?.position
}

export function ratePlayerMatch(
  match: Match,
  player: Player,
): RatingBreakdown | null {
  const appearance = match.appearances.find((a) => a.playerId === player.id)
  if (!appearance) return null
  const window = pitchWindow(match, appearance)
  if (!window || window.exit <= window.enter) return null

  const segments = matchPositionSegments(match, appearance)
  const position = segments[0].position
  const positionAt = (minute: number) => segments.find(segment => onPitch(segment.enter, segment.exit, minute))!.position
  const isStarter = appearance.role === 'starter'
  const teamId = appearance.teamId
  const { enter, exit } = window
  const minutes = Math.max(0, exit - enter)

  const goalEvents = match.events.filter(
    (e): e is Extract<MatchEvent, { type: 'goal' }> =>
      e.type === 'goal' &&
      !e.ownGoal &&
      e.playerId === player.id &&
      onPitch(enter, exit, e.minute),
  )
  const saves = match.events.filter((event): event is Extract<MatchEvent, { type: 'save' }> =>
    event.type === 'save' && event.playerId === player.id && (event.minute === undefined || onPitch(enter, exit, event.minute)),
  )
  const savePoints = segments.length === 1
    ? saves.reduce((total, event) => total + (event.count ?? 1), 0) * POSITION_RULES[position].save
    : saves.reduce((total, event) => total + (event.count ?? 1) * POSITION_RULES[event.minute === undefined ? position : positionAt(event.minute)].save, 0)

  const teamGoalsPoints = segments.reduce((total, segment) => total + teamGoalBonus(match, teamId, player.id, segment.enter, segment.exit, POSITION_RULES[segment.position]), 0)
  const concessions = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> =>
    event.type === 'goal' && scoringTeamId(match, event) !== teamId && onPitch(enter, exit, event.minute),
  ).sort((a, b) => a.minute - b.minute)
  // Keep the match-wide concession ordinal; moving position must not reset its tier.
  const concededPoints = segments.length === 1
    ? POSITION_RULES[position].conceded(concessions.length)
    : concessions.reduce((total, event, index) => {
      const rules = POSITION_RULES[positionAt(event.minute)]
      return total + (rules.conceded(index + 1) - rules.conceded(index))
    }, 0)

  let goalPoints = 0
  for (const [index, event] of goalEvents.entries()) {
    const position = positionAt(event.minute)
    const rules = POSITION_RULES[position]
    let base = rules.goal
    if (isStarter && position === 'SS') {
      base = index === 0 ? .70 : rules.goal
    }
    if (position !== 'GK') goalPoints += base
  }

  const assistEvents = match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> =>
    event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id && onPitch(enter, exit, event.minute),
  )
  let assistPoints = 0
  for (const [index, event] of assistEvents.entries()) {
    const position = positionAt(event.minute)
    if (position === 'GK') continue
    const rules = POSITION_RULES[position]
    let base = rules.assist
    if (isStarter && position === 'SS') {
      base = index === 0 ? .40 : rules.assist
    }
    assistPoints += base
  }

  const causedConcessionCount = match.events.filter((event) =>
    event.type === 'goal' && scoringTeamId(match, event) !== teamId && onPitch(enter, exit, event.minute) &&
    (event.concededGoalCausePlayerId === player.id || (event.ownGoal && event.playerId === player.id)),
  ).length

  const breakdown: RatingBreakdown = {
    playerId: player.id,
    matchId: match.id,
    played: true,
    starter: isStarter,
    enter,
    exit,
    minutes,
    position,
    base: BASE_RATING,
    result: resultModifier(match, teamId),
    goals: goalPoints,
    assists: assistPoints,
    teamGoals: teamGoalsPoints,
    conceded: concededPoints,
    cleanSheet: 0,
    noConceded: segments.reduce((total, segment) => total + noConcededBonus(match, teamId, segment.enter, segment.exit, POSITION_RULES[segment.position].noConcededMax), 0),
    noPoint: 0,
    ownGoals: 0,
    concededCause: causedConcessionCount * -.3,
    saves: savePoints,
    raw: 0,
    rating: 0,
  }

  breakdown.raw =
    breakdown.base +
    breakdown.result +
    breakdown.goals +
    breakdown.assists +
    breakdown.teamGoals +
    breakdown.conceded +
    breakdown.cleanSheet +
    breakdown.noConceded +
    breakdown.noPoint +
    breakdown.ownGoals +
    breakdown.concededCause +
    breakdown.saves
  breakdown.rating = clampRating(breakdown.raw)
  return breakdown
}

function normalizeMatchPosition(matchPosition?: string): Position | undefined {
  if (!matchPosition) return undefined
  const aliases: Record<string, Position> = {
    LST: 'ST', RST: 'ST',
    LCAM: 'CAM', RCAM: 'CAM',
    LDM: 'CDM', RDM: 'CDM',
    LCM: 'CM', RCM: 'CM',
    LCB: 'CB', RCB: 'CB',
  }
  return aliases[matchPosition] ?? (POSITION_RULES[matchPosition as Position] ? matchPosition as Position : undefined)
}

export function rateMatch(match: Match, players: Player[]): RatingBreakdown[] {
  return players
    .map((player) => ratePlayerMatch(match, player))
    .filter((row): row is RatingBreakdown => row !== null)
}

export function getMatchManOfTheMatch(match: Match, players: Player[]): string | undefined {
  const ratings = rateMatch(match, players);
  if (ratings.length === 0) return undefined;
  
  return ratings.sort((a, b) => 
    b.raw - a.raw || 
    b.minutes - a.minutes || 
    a.playerId.localeCompare(b.playerId)
  )[0]?.playerId;
}
