import type { MatchEvent, Position, PositionChange } from '../types'
import { nextTimelineSequence } from '../engine/timeline'
import { ratingPositionForSlot } from '../engine/tacticalSlots'

export type Lineup = { slotAssignments: Record<string, string>; homeBench: string[] }
export type LineupTarget = { group: 'starting' | 'substitute' | 'squad'; id: string }
export type SubstitutionDraft = Lineup & {
  events: MatchEvent[]
  positionHistories: Record<string, PositionChange[]>
  checkpoint: Lineup
}

export type GoalkeeperMovePhase = 'pre-kickoff' | 'in-match'

type RosterPlayer = { id: string; position: Position }

/** Construct a new match once. Saved drafts and historical matches bypass this. */
export function createFreshLineup(
  squad: RosterPlayer[], recentAssignments: Record<string, string> | null,
  recentBench: string[], defaultAssignments: Record<string, string>,
): Lineup {
  const byId = new Map(squad.map(player => [player.id, player]))
  const preferred = recentAssignments ?? defaultAssignments
  const slotAssignments: Record<string, string> = {}
  const used = new Set<string>()
  for (const [slot, id] of Object.entries(preferred).slice(0, 11)) {
    const player = byId.get(id)
    if (!player || used.has(id) || (slot === 'GK') !== (player.position === 'GK')) continue
    slotAssignments[slot] = id
    used.add(id)
  }
  const candidates = [...new Set([...recentBench, ...squad.map(player => player.id)])]
  for (const slot of Object.keys(preferred).slice(0, 11)) {
    if (slotAssignments[slot]) continue
    const replacement = candidates.find(id => !used.has(id) && byId.has(id) && (slot === 'GK') === (byId.get(id)!.position === 'GK'))
    if (replacement) { slotAssignments[slot] = replacement; used.add(replacement) }
  }
  return reconcileFreshBench({ slotAssignments, homeBench: recentBench }, squad)
}

/** The roster is the recoverable pool; the visible match-day bench is at most 12. */
export function reconcileFreshBench(lineup: Lineup, squad: RosterPlayer[]): Lineup {
  const rosterIds = new Set(squad.map(player => player.id))
  const starters = new Set(Object.values(lineup.slotAssignments).filter(Boolean))
  const homeBench = [...new Set([...lineup.homeBench, ...squad.map(player => player.id)])]
    .filter(id => rosterIds.has(id) && !starters.has(id)).slice(0, 12)
  return { slotAssignments: lineup.slotAssignments, homeBench }
}

/**
 * The starting goalkeeper can be selected before kickoff, but the committed
 * match has one immutable goalkeeper. Keeping this rule here makes both tap
 * orders use the same domain check rather than screen-specific exceptions.
 */
export function allowsGoalkeeperLineupMove(
  source: LineupTarget,
  target: LineupTarget,
  lineup: Lineup,
  slotPositions: Record<string, Position>,
  playerPositions: Record<string, Position | undefined>,
  phase: GoalkeeperMovePhase,
): boolean {
  const sourceId = source.group === 'starting' ? lineup.slotAssignments[source.id] : source.id
  const targetId = target.group === 'starting' ? lineup.slotAssignments[target.id] : target.id
  const sourceGKSlot = source.group === 'starting' && slotPositions[source.id] === 'GK'
  const targetGKSlot = target.group === 'starting' && slotPositions[target.id] === 'GK'
  const sourceIsGK = playerPositions[sourceId] === 'GK'
  const targetIsGK = playerPositions[targetId] === 'GK'
  const involvesGoalkeeper = sourceGKSlot || targetGKSlot || sourceIsGK || targetIsGK

  if (!involvesGoalkeeper) return true
  if (phase === 'in-match') return false

  // The goalkeeper may exchange with a keeper on the bench, or fill an empty
  // GK slot. Both tap orders have the same rule.
  if (sourceGKSlot && target.group !== 'starting') return targetIsGK && (!sourceId || sourceIsGK)
  if (targetGKSlot && source.group !== 'starting') return sourceIsGK && (!targetId || targetIsGK)
  return false
}

export function lineupTarget(id: string): LineupTarget | undefined {
  const slot = id.match(/^(?:player|target):(.+)$/)
  if (slot) return { group: 'starting', id: slot[1] }
  if (id === 'bench:empty') return { group: 'substitute', id: '' }
  const roster = id.match(/^roster:(substitute|squad):(.+)$/)
  return roster ? { group: roster[1] as 'substitute' | 'squad', id: roster[2] } : undefined
}

// Live substitution staging may briefly park an OUT player beside a full bench;
// only confirmed match-day lineups are limited to twelve bench players.
export function moveLineup(lineup: Lineup, source: LineupTarget, target: LineupTarget, allowTemporaryBenchOverflow = false): Lineup {
  if (source.group === target.group && source.id === target.id) return lineup
  if (source.group !== 'starting' && target.group === 'starting') return moveLineup(lineup, target, source, allowTemporaryBenchOverflow)
  const assignments = { ...lineup.slotAssignments }
  const bench = [...lineup.homeBench]
  // An invalid saved lineup is never silently repaired by an unrelated move.
  const existingIds = [...Object.values(assignments).filter(Boolean), ...bench.filter(Boolean)]
  if (new Set(existingIds).size !== existingIds.length) return lineup
  if (source.group === 'starting') {
    const outgoing = assignments[source.id]
    if (target.group === 'starting') {
      if (!outgoing) return lineup
      if (assignments[target.id]) assignments[source.id] = assignments[target.id]
      else delete assignments[source.id]
      assignments[target.id] = outgoing
    } else {
      const incoming = target.id
      if (incoming && Object.values(assignments).includes(incoming)) return lineup
      if (target.group === 'substitute' && incoming && !bench.includes(incoming)) return lineup
      if (incoming && !outgoing && Object.values(assignments).filter(Boolean).length >= 11) return lineup
      if (!incoming && outgoing && target.group === 'substitute' && bench.length >= 12 && !allowTemporaryBenchOverflow) return lineup
      if (!outgoing && !incoming) return lineup
      if (incoming) assignments[source.id] = incoming
      else delete assignments[source.id]
      if (target.group === 'substitute') {
        const index = bench.indexOf(incoming)
        if (index >= 0) { if (outgoing) bench[index] = outgoing; else bench.splice(index, 1) }
        else if (outgoing && !bench.includes(outgoing)) bench.push(outgoing)
      }
    }
  } else {
    if (source.group === target.group) return lineup
    const fromBench = source.group === 'substitute' ? source.id : target.id
    const fromSquad = source.group === 'squad' ? source.id : target.id
    const index = bench.indexOf(fromBench)
    if (index < 0 || !fromSquad || bench.includes(fromSquad) || Object.values(assignments).includes(fromSquad)) return lineup
    bench[index] = fromSquad
  }
  const nextIds = [...Object.values(assignments).filter(Boolean), ...bench.filter(Boolean)]
  if (Object.values(assignments).filter(Boolean).length > 11 || (!allowTemporaryBenchOverflow && bench.length > 12) || new Set(nextIds).size !== nextIds.length) return lineup
  return { slotAssignments: assignments, homeBench: bench }
}

export function moveSubstitution(
  draft: SubstitutionDraft, source: LineupTarget, target: LineupTarget,
  starters: Record<string, string>, positions: Record<string, Position>, minute: number, teamId: string,
  newId: () => string,
): SubstitutionDraft {
  if (!Number.isInteger(minute) || minute < 0 || minute > 99 || source.group === 'squad' || target.group === 'squad') return draft
  if ([source, target].some(item => item.group === 'starting' && !positions[item.id])) return draft
  // A goalkeeper is fixed for the match: live tactical changes can never
  // enter, leave, or exchange the GK slot.
  if ([source, target].some(item => item.group === 'starting' && positions[item.id] === 'GK')) return draft
  const subs = draft.events.filter((event): event is Extract<MatchEvent, { type: 'sub' }> => event.type === 'sub')
  if (subs.some(event => event.minute > minute) || Object.values(draft.positionHistories).some(history => history.some(change => change.minute > minute))) return draft
  const next = moveLineup(draft, source, target, true)
  if (next === draft) return draft
  const before = draft.checkpoint.slotAssignments
  const beforeIds = Object.values(before).filter(Boolean)
  const nextIds = Object.values(next.slotAssignments).filter(Boolean)
  const incoming = nextIds.filter(id => !beforeIds.includes(id))
  if (incoming.some(id => Object.values(starters).includes(id) || subs.some(event => event.playerInId === id))) return draft
  if (new Set(nextIds).size !== nextIds.length) return draft
  // Allow an incomplete formation while the user pairs an empty-slot assignment with an OUT.
  if (nextIds.length !== beforeIds.length) return { ...draft, ...next }
  const outgoing = beforeIds.filter(id => !nextIds.includes(id))
  if (outgoing.some(id => subs.some(event => event.playerInId === id && event.minute >= minute) || draft.events.some(event =>
    event.minute !== undefined && event.minute > minute && (event.type === 'save' ? event.playerId === id :
      event.type === 'goal' && [event.playerId, event.assistPlayerId, event.concededGoalCausePlayerId].includes(id)),
  ))) return draft
  const events = [...draft.events]
  const unpaired = [...incoming]
  for (const playerOutId of outgoing) {
    const oldSlot = Object.keys(before).find(slot => before[slot] === playerOutId)!
    const sameSlot = next.slotAssignments[oldSlot]
    const playerInId = unpaired.includes(sameSlot) ? sameSlot : unpaired[0]
    unpaired.splice(unpaired.indexOf(playerInId), 1)
    const newSlot = Object.keys(next.slotAssignments).find(slot => next.slotAssignments[slot] === playerInId)!
    events.push({ id: newId(), sequence: nextTimelineSequence(events, draft.positionHistories), type: 'sub', minute, teamId, playerOutId, playerInId, position: positions[newSlot], tacticalSlotId: newSlot })
  }
  const positionHistories = { ...draft.positionHistories }
  for (const id of nextIds.filter(id => beforeIds.includes(id))) {
    const oldSlot = Object.keys(before).find(slot => before[slot] === id)!
    const newSlot = Object.keys(next.slotAssignments).find(slot => next.slotAssignments[slot] === id)!
    if (oldSlot === newSlot) continue
    if (positions[oldSlot] === 'GK' && positions[newSlot] !== 'GK' && events.some(event => event.type === 'save' && event.playerId === id && (event.minute === undefined || event.minute >= minute))) return draft
    const history = positionHistories[id] ?? []
    positionHistories[id] = [...history, { minute, position: positions[newSlot], tacticalSlotId: newSlot, sequence: nextTimelineSequence(events, positionHistories) }]
  }
  return { ...next, events, positionHistories, checkpoint: next }
}

export function canConfirmSubstitution(draft: SubstitutionDraft, baseline: { events: MatchEvent[]; positionHistories: Record<string, PositionChange[]> }): boolean {
  if (Object.values(draft.slotAssignments).filter(Boolean).length !== 11) return false
  if (JSON.stringify(draft.slotAssignments) !== JSON.stringify(draft.checkpoint.slotAssignments)) return false
  if (draft.events.length === baseline.events.length && JSON.stringify(draft.positionHistories) === JSON.stringify(baseline.positionHistories)) return false
  return Object.values(draft.positionHistories).every(history => history.every(change =>
    (change.tacticalSlotId && ratingPositionForSlot(change.tacticalSlotId) === change.position) || draft.events.some(event => event.type === 'sub' && event.minute === change.minute)))
}

/** Associate only new histories from this confirmation, never same-minute
 * histories from an earlier, independently confirmed tactical action. */
export function linkSubstitutionHistory(draft: SubstitutionDraft, baseline: Pick<SubstitutionDraft, 'events' | 'positionHistories'>): SubstitutionDraft {
  const sourceSubstitutionIds = draft.events.filter(event => event.type === 'sub' && !baseline.events.some(saved => saved.id === event.id)).map(event => event.id)
  if (!sourceSubstitutionIds.length) return draft
  const positionHistories = Object.fromEntries(Object.entries(draft.positionHistories).map(([id, changes]) => [id,
    changes.map((change, index) => index < (baseline.positionHistories[id]?.length ?? 0) ? change : { ...change, sourceSubstitutionIds }),
  ]))
  return { ...draft, positionHistories }
}
