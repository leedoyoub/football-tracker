import type { Appearance, Match, MatchEvent, Position, PositionChange } from '../types'
import { RATING_ENGINE_REVISION } from './ratingRevision'

export type PositionSegment = { enter: number; exit: number; position: Position }
export type OrderedEvent = { event: MatchEvent; index: number }
type SubEvent = Extract<MatchEvent, { type: 'sub' }>
export type PitchInterval = { enter: number; exit: number; on?: SubEvent; off?: SubEvent; position: Position; startOrder?: number }
type Change = { minute: number; position: Position; order: number; index: number }
export type NormalizedPlayerTimeline = { appearance: Appearance; intervals: PitchInterval[]; positions: PositionSegment[]; changes: Change[] }
export type NormalizedMatchTimeline = { end: number; events: OrderedEvent[]; order: Map<MatchEvent, number>; players: Map<string, NormalizedPlayerTimeline> }
const cache = new WeakMap<Match, { revision: number; events: MatchEvent[]; appearances: Appearance[]; duration: number; value: NormalizedMatchTimeline }>()
const key = (appearance: Appearance) => JSON.stringify([appearance.teamId, appearance.playerId])
const eventMinute = (event: MatchEvent) => Number.isFinite(event.minute) ? event.minute! : -1

export function normalizeMatchPosition(value?: string): Position | undefined {
  if (!value) return undefined
  const aliases: Record<string, Position> = { LST: 'ST', RST: 'ST', LCAM: 'CAM', RCAM: 'CAM', LDM: 'CDM', RDM: 'CDM', LCM: 'CM', RCM: 'CM', LCB: 'CB', RCB: 'CB' }
  const normalized = aliases[value] ?? value
  return ['GK', 'CB', 'LB', 'LWB', 'RB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'SS', 'ST'].includes(normalized) ? normalized as Position : undefined
}

/** Total order, even with partly sequenced legacy arrays: sort explicit events
 * within their saved slots, retain unsequenced slots, then assign ordinal ranks. */
function orderRawEvents(match: Match): OrderedEvent[] {
  const rows = match.events.map((event, index) => ({ event, index })).sort((a, b) => eventMinute(a.event) - eventMinute(b.event) || a.index - b.index)
  for (let start = 0; start < rows.length;) {
    let end = start + 1
    while (end < rows.length && eventMinute(rows[end].event) === eventMinute(rows[start].event)) end++
    const explicit = rows.slice(start, end).filter(row => Number.isFinite(row.event.sequence)).sort((a, b) => a.event.sequence! - b.event.sequence! || a.index - b.index)
    let next = 0
    for (let index = start; index < end; index++) if (Number.isFinite(rows[index].event.sequence)) rows[index] = explicit[next++]
    start = end
  }
  return rows
}

function changeOrder(change: PositionChange, appearance: Appearance, events: OrderedEvent[], order: Map<MatchEvent, number>): number {
  const sameMinute = events.filter(row => row.event.minute === change.minute)
  if (Number.isFinite(change.sequence)) {
    const after = sameMinute.find(row => Number.isFinite(row.event.sequence) && row.event.sequence! > change.sequence!)
    if (after) return order.get(after.event)! - .5
    const beforeRows = sameMinute.filter(row => Number.isFinite(row.event.sequence) && row.event.sequence! <= change.sequence!)
    const before = beforeRows[beforeRows.length - 1]
    if (before) return order.get(before.event)! + .5
  }
  // Historical position moves were committed together with a substitution.
  const anchor = sameMinute.find(row => row.event.type === 'sub' && row.event.teamId === appearance.teamId)
  if (anchor) return order.get(anchor.event)! + .25
  // No cross-array ordering was saved: legacy moves apply at the minute start.
  return (sameMinute.length ? order.get(sameMinute[0].event)! : 0) - .5
}

function positionFor(interval: PitchInterval, changes: Change[], minute: number, order = Infinity): Position {
  let position = interval.position
  for (const change of changes) {
    if (change.minute < interval.enter || (change.minute === interval.enter && interval.startOrder !== undefined && change.order <= interval.startOrder)) continue
    if (change.minute > minute || (change.minute === minute && change.order >= order)) break
    position = change.position
  }
  return position
}

/** Read-time projection only. Match objects are immutable repository revisions.
 * Stoppage time extends the observed end; it is never compressed into minute 90. */
export function normalizeMatchTimeline(match: Match, revision = RATING_ENGINE_REVISION): NormalizedMatchTimeline {
  const prior = cache.get(match)
  if (prior?.revision === revision && prior.events === match.events && prior.appearances === match.appearances && prior.duration === match.duration) return prior.value
  const events = orderRawEvents(match)
  const order = new Map(events.map((row, index) => [row.event, index]))
  const end = Math.max(Number.isFinite(match.duration) && match.duration > 0 ? match.duration : 90, ...events.map(row => eventMinute(row.event)), ...match.appearances.flatMap(row => (row.positionHistory ?? []).map(change => Number.isFinite(change.minute) ? change.minute : 0)))
  const players = new Map<string, NormalizedPlayerTimeline>()
  for (const appearance of match.appearances) {
    const initial = normalizeMatchPosition(appearance.matchPosition) ?? normalizeMatchPosition(appearance.position)
    if (!initial) continue
    const changes = (appearance.positionHistory ?? []).flatMap((change, index): Change[] => {
      const position = normalizeMatchPosition(change.position)
      return position && Number.isFinite(change.minute) && change.minute >= 0 && change.minute <= end ? [{ minute: change.minute, position, index, order: changeOrder(change, appearance, events, order) }] : []
    }).sort((a, b) => a.minute - b.minute || a.order - b.order || a.index - b.index)
    const intervals: PitchInterval[] = []
    let active: PitchInterval | undefined = appearance.role === 'starter' ? { enter: 0, exit: end, position: initial } : undefined
    for (const { event } of events) {
      if (event.type !== 'sub' || event.teamId !== appearance.teamId || !Number.isFinite(event.minute) || event.minute < 0 || event.minute > end) continue
      if (event.playerOutId === appearance.playerId && active) {
        active.exit = event.minute; active.off = event; intervals.push(active); active = undefined
      }
      if (event.playerInId === appearance.playerId && !active) active = { enter: event.minute, exit: end, on: event, startOrder: order.get(event), position: normalizeMatchPosition(event.position) ?? initial }
    }
    if (active) intervals.push(active)
    const positions: PositionSegment[] = []
    for (const interval of intervals) {
      const boundaries = [...new Set([interval.enter, ...changes.filter(change => change.minute > interval.enter && change.minute < interval.exit).map(change => change.minute), interval.exit])].sort((a, b) => a - b)
      for (let index = 0; index < boundaries.length - 1; index++) {
        const enter = boundaries[index], exit = boundaries[index + 1]
        if (exit > enter) positions.push({ enter, exit, position: positionFor(interval, changes, enter) })
      }
    }
    players.set(key(appearance), { appearance, intervals, positions, changes })
  }
  const value = { end, events, order, players }
  cache.set(match, { revision, events: match.events, appearances: match.appearances, duration: match.duration, value })
  return value
}
export function orderedEvents(match: Match): OrderedEvent[] { return normalizeMatchTimeline(match).events }
export function eventIndex(match: Match, event: MatchEvent): number { const index = match.events.indexOf(event); return index >= 0 ? index : match.events.findIndex(row => row.id === event.id) }
export function compareEvents(match: Match, left: MatchEvent, right: MatchEvent): number {
  const timeline = normalizeMatchTimeline(match)
  const rank = (event: MatchEvent) => timeline.order.get(event) ?? timeline.events.findIndex(row => row.event.id === event.id)
  return eventMinute(left) - eventMinute(right) || rank(left) - rank(right)
}
export function pitchIntervals(match: Match, appearance: Appearance): PitchInterval[] {
  const saved = normalizeMatchTimeline(match).players.get(key(appearance))
  if (saved) return saved.intervals
  // Preview helpers may pass an appearance before adding it to the raw lineup.
  return normalizeMatchTimeline({ ...match, appearances: [appearance] }).players.get(key(appearance))?.intervals ?? []
}
/** Envelope for entry/exit labels only; actual minutes sum the position intervals. */
export function pitchWindow(match: Match, appearance: Appearance): { enter: number; exit: number } | null {
  const intervals = pitchIntervals(match, appearance)
  return intervals.length ? { enter: intervals[0].enter, exit: intervals[intervals.length - 1].exit } : null
}
function intervalAtEvent(match: Match, appearance: Appearance, event: MatchEvent): PitchInterval | undefined {
  if (event.minute === undefined || !Number.isFinite(event.minute) || event.minute < 0) return undefined
  return pitchIntervals(match, appearance).find(interval =>
    event.minute! >= interval.enter && event.minute! <= interval.exit &&
    (!interval.on || compareEvents(match, event, interval.on) > 0) &&
    (!interval.off || compareEvents(match, event, interval.off) < 0))
}
export function isOnPitchAtEvent(match: Match, appearance: Appearance, event: MatchEvent): boolean { return Boolean(intervalAtEvent(match, appearance, event)) }
export function matchPositionSegments(match: Match, appearance: Appearance): PositionSegment[] { return normalizeMatchTimeline(match).players.get(key(appearance))?.positions ?? [] }
export function matchPositionAt(match: Match, appearance: Appearance, minute?: number): Position | undefined {
  const segments = matchPositionSegments(match, appearance)
  if (minute === undefined) return segments[0]?.position
  return segments.find(segment => segment.enter <= minute && minute < segment.exit)?.position ??
    (minute === normalizeMatchTimeline(match).end && pitchIntervals(match, appearance).some(interval => !interval.off && interval.exit === minute) ? segments[segments.length - 1]?.position : undefined)
}
export function matchPositionAtEvent(match: Match, appearance: Appearance, event: MatchEvent): Position | undefined {
  const timeline = normalizeMatchTimeline(match), player = timeline.players.get(key(appearance)), interval = intervalAtEvent(match, appearance, event)
  if (!player || !interval) return undefined
  const rank = timeline.order.get(event) ?? timeline.events.findIndex(row => row.event.id === event.id)
  return positionFor(interval, player.changes, event.minute!, rank)
}
export function scoringTeamId(match: Match, event: Extract<MatchEvent, { type: 'goal' }>): string { return event.ownGoal ? (event.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId) : event.teamId }

/** New actions share a monotonically increasing order; legacy arrays stay intact. */
export function nextTimelineSequence(events: MatchEvent[], histories: Record<string, PositionChange[]>): number {
  return Math.max(events.length - 1, ...events.map(event => event.sequence ?? -1), ...Object.values(histories).flatMap(changes => changes.map(change => change.sequence ?? -1))) + 1
}
