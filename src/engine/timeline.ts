import type { Appearance, Match, MatchEvent, Position } from '../types'

export type PositionSegment = { enter: number; exit: number; position: Position }
export type OrderedEvent = { event: MatchEvent; index: number }

/**
 * Events already have a durable array order.  Newer records may additionally
 * provide a sequence number; old records intentionally retain their saved
 * order instead of being re-sorted by an arbitrary ID.
 */
export function orderedEvents(match: Match): OrderedEvent[] {
  return match.events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const minute = (left.event.minute ?? -1) - (right.event.minute ?? -1)
      if (minute) return minute
      const leftSequence = left.event.sequence
      const rightSequence = right.event.sequence
      if (Number.isFinite(leftSequence) && Number.isFinite(rightSequence) && leftSequence !== rightSequence) return leftSequence! - rightSequence!
      return left.index - right.index
    })
}

export function eventIndex(match: Match, event: MatchEvent): number {
  const direct = match.events.indexOf(event)
  if (direct >= 0) return direct
  const byId = match.events.findIndex(item => item.id === event.id)
  return byId >= 0 ? byId : Number.MAX_SAFE_INTEGER
}

export function compareEvents(match: Match, left: MatchEvent, right: MatchEvent): number {
  const minute = (left.minute ?? -1) - (right.minute ?? -1)
  if (minute) return minute
  if (Number.isFinite(left.sequence) && Number.isFinite(right.sequence) && left.sequence !== right.sequence) return left.sequence! - right.sequence!
  return eventIndex(match, left) - eventIndex(match, right)
}

export function normalizeMatchPosition(value?: string): Position | undefined {
  if (!value) return undefined
  const aliases: Record<string, Position> = {
    LST: 'ST', RST: 'ST', LCAM: 'CAM', RCAM: 'CAM',
    LDM: 'CDM', RDM: 'CDM', LCM: 'CM', RCM: 'CM', LCB: 'CB', RCB: 'CB',
  }
  const normalized = aliases[value] ?? value
  const valid: readonly string[] = ['GK', 'CB', 'LCB', 'RCB', 'LB', 'LWB', 'RB', 'RWB', 'LDM', 'CDM', 'RDM', 'LCM', 'CM', 'RCM', 'CAM', 'LM', 'RM', 'LW', 'LST', 'RW', 'RST', 'SS', 'ST']
  return valid.includes(normalized) ? normalized as Position : undefined
}

function playerSubEvents(match: Match, appearance: Appearance) {
  return orderedEvents(match).flatMap(({ event }) => event.type === 'sub' && event.teamId === appearance.teamId && (event.playerInId === appearance.playerId || event.playerOutId === appearance.playerId) ? [event] : [])
}

/** The numeric playing window is used for minutes and interval intersections. */
export function pitchWindow(match: Match, appearance: Appearance): { enter: number; exit: number } | null {
  const duration = Number.isFinite(match.duration) && match.duration > 0 ? match.duration : 90
  const substitutions = playerSubEvents(match, appearance)
  if (appearance.role === 'starter') {
    const off = substitutions.find(event => event.type === 'sub' && event.playerOutId === appearance.playerId)
    return { enter: 0, exit: Math.min(duration, off?.minute ?? duration) }
  }
  const on = substitutions.find(event => event.type === 'sub' && event.playerInId === appearance.playerId)
  if (!on) return null
  const off = substitutions.find(event => event.type === 'sub' && event.playerOutId === appearance.playerId && compareEvents(match, event, on) > 0)
  return { enter: Math.max(0, on.minute), exit: Math.min(duration, off?.minute ?? duration) }
}

function substitutionFor(match: Match, appearance: Appearance, direction: 'in' | 'out'): Extract<MatchEvent, { type: 'sub' }> | undefined {
  const events = playerSubEvents(match, appearance).filter((event): event is Extract<MatchEvent, { type: 'sub' }> => event.type === 'sub')
  if (direction === 'in') return events.find(event => event.playerInId === appearance.playerId)
  const on = events.find(event => event.playerInId === appearance.playerId)
  return events.find(event => event.playerOutId === appearance.playerId && (!on || compareEvents(match, event, on) > 0))
}

/**
 * The common event attribution rule.  At an equal minute, an event before a
 * substitution sees the old player; an event after it sees the new player.
 * Legacy records have no sequence, so their saved raw event order is used.
 */
export function isOnPitchAtEvent(match: Match, appearance: Appearance, event: MatchEvent): boolean {
  const window = pitchWindow(match, appearance)
  if (!window || window.exit <= window.enter || event.minute === undefined) return false
  const on = substitutionFor(match, appearance, 'in')
  const off = substitutionFor(match, appearance, 'out')
  if (appearance.role === 'bench') {
    if (!on || compareEvents(match, event, on) <= 0) return false
  } else if (event.minute < 0) return false
  if (off && compareEvents(match, event, off) >= 0) return false
  if (appearance.role === 'starter') return event.minute >= 0 && event.minute < window.exit || Boolean(off && event.minute === off.minute && compareEvents(match, event, off) < 0)
  return event.minute >= window.enter && event.minute < window.exit || Boolean(on && event.minute === on.minute && compareEvents(match, event, on) > 0)
}

export function matchPositionSegments(match: Match, appearance: Appearance): PositionSegment[] {
  const window = pitchWindow(match, appearance)
  if (!window || window.exit <= window.enter) return []
  const subOn = substitutionFor(match, appearance, 'in')
  let position = appearance.role === 'bench' && subOn ? subOn.position : normalizeMatchPosition(appearance.matchPosition) ?? normalizeMatchPosition(appearance.position) ?? appearance.position
  let enter = window.enter
  const changes = (appearance.positionHistory ?? [])
    .map((change, index) => ({ ...change, index, position: normalizeMatchPosition(change.position) }))
    .filter((change): change is { minute: number; position: Position; index: number } => Number.isFinite(change.minute) && change.minute >= window.enter && change.minute < window.exit && Boolean(change.position))
    .sort((left, right) => left.minute - right.minute || left.index - right.index)
  const segments: PositionSegment[] = []
  for (const change of changes) {
    if (change.position === normalizeMatchPosition(position)) continue
    if (change.minute > enter) segments.push({ enter, exit: change.minute, position })
    enter = change.minute
    position = change.position
  }
  if (enter < window.exit) segments.push({ enter, exit: window.exit, position })
  return segments
}

export function matchPositionAt(match: Match, appearance: Appearance, minute?: number): Position | undefined {
  const segments = matchPositionSegments(match, appearance)
  if (minute === undefined) return segments[0]?.position
  return segments.find(segment => segment.enter <= minute && minute < segment.exit)?.position
}

export function matchPositionAtEvent(match: Match, appearance: Appearance, event: MatchEvent): Position | undefined {
  if (!isOnPitchAtEvent(match, appearance, event)) return undefined
  const initial = appearance.role === 'bench' ? substitutionFor(match, appearance, 'in')?.position : normalizeMatchPosition(appearance.matchPosition) ?? normalizeMatchPosition(appearance.position)
  let position = initial ?? appearance.position
  for (const change of (appearance.positionHistory ?? [])) {
    if (change.minute <= (event.minute ?? -1) && normalizeMatchPosition(change.position)) position = normalizeMatchPosition(change.position)!
  }
  return position
}

export function scoringTeamId(match: Match, event: Extract<MatchEvent, { type: 'goal' }>): string {
  return event.ownGoal ? (event.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId) : event.teamId
}
