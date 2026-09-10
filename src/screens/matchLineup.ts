import type { MatchEvent, Position, PositionChange } from '../types'
import { nextTimelineSequence } from '../engine/timeline'

export type Lineup = { slotAssignments: Record<string, string>; homeBench: string[] }
export type LineupTarget = { group: 'starting' | 'substitute' | 'squad'; id: string }
export type SubstitutionDraft = Lineup & {
  events: MatchEvent[]
  positionHistories: Record<string, PositionChange[]>
  checkpoint: Lineup
}

export function lineupTarget(id: string): LineupTarget | undefined {
  const slot = id.match(/^(?:player|target):(.+)$/)
  if (slot) return { group: 'starting', id: slot[1] }
  if (id === 'bench:empty') return { group: 'substitute', id: '' }
  const roster = id.match(/^roster:(substitute|squad):(.+)$/)
  return roster ? { group: roster[1] as 'substitute' | 'squad', id: roster[2] } : undefined
}

// Both lineup setup and live substitutions use this same swap/assign operation.
export function moveLineup(lineup: Lineup, source: LineupTarget, target: LineupTarget): Lineup {
  if (source.group === target.group && source.id === target.id) return lineup
  if (source.group !== 'starting' && target.group === 'starting') return moveLineup(lineup, target, source)
  const assignments = { ...lineup.slotAssignments }
  const bench = [...lineup.homeBench]
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
  return { slotAssignments: assignments, homeBench: bench }
}

export function moveSubstitution(
  draft: SubstitutionDraft, source: LineupTarget, target: LineupTarget,
  starters: Record<string, string>, positions: Record<string, Position>, minute: number, teamId: string,
  newId: () => string,
): SubstitutionDraft {
  if (!Number.isInteger(minute) || minute < 0 || minute > 99 || source.group === 'squad' || target.group === 'squad') return draft
  if ([source, target].some(item => item.group === 'starting' && !positions[item.id])) return draft
  const subs = draft.events.filter((event): event is Extract<MatchEvent, { type: 'sub' }> => event.type === 'sub')
  if (subs.some(event => event.minute > minute) || Object.values(draft.positionHistories).some(history => history.some(change => change.minute > minute))) return draft
  const next = moveLineup(draft, source, target)
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
    event.minute !== undefined && event.minute >= minute && (event.type === 'save' ? event.playerId === id :
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
    events.push({ id: newId(), sequence: nextTimelineSequence(events, draft.positionHistories), type: 'sub', minute, teamId, playerOutId, playerInId, position: positions[newSlot] })
  }
  const positionHistories = { ...draft.positionHistories }
  for (const id of nextIds.filter(id => beforeIds.includes(id))) {
    const oldSlot = Object.keys(before).find(slot => before[slot] === id)!
    const newSlot = Object.keys(next.slotAssignments).find(slot => next.slotAssignments[slot] === id)!
    if (oldSlot === newSlot) continue
    if (positions[oldSlot] === 'GK' && positions[newSlot] !== 'GK' && events.some(event => event.type === 'save' && event.playerId === id && (event.minute === undefined || event.minute >= minute))) return draft
    const history = (positionHistories[id] ?? []).filter(change => change.minute !== minute)
    positionHistories[id] = [...history, { minute, position: positions[newSlot], sequence: nextTimelineSequence(events, positionHistories) }]
  }
  return { ...next, events, positionHistories, checkpoint: next }
}

export function canConfirmSubstitution(draft: SubstitutionDraft, baseline: { events: MatchEvent[]; positionHistories: Record<string, PositionChange[]> }): boolean {
  if (Object.values(draft.slotAssignments).filter(Boolean).length !== 11) return false
  if (JSON.stringify(draft.slotAssignments) !== JSON.stringify(draft.checkpoint.slotAssignments)) return false
  if (draft.events.length === baseline.events.length && JSON.stringify(draft.positionHistories) === JSON.stringify(baseline.positionHistories)) return false
  return Object.values(draft.positionHistories).every(history => history.every(change => draft.events.some(event => event.type === 'sub' && event.minute === change.minute)))
}
