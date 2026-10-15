import { TACTICAL_SLOT_DEFINITIONS, tacticalSlotById } from '../engine/tacticalSlots'
import { kickoffLineupForMatch, reconstructLegacyKickoffLineup, validateKickoffLineup } from '../engine/kickoffLineup'
import { normalizeMatchPosition } from '../engine/timeline'
import type { Match, MatchEvent, Player, Position, PositionChange } from '../types'
import { rebuildLiveHistory } from '../screens/liveHistory'

type MatchDraftState = { slotAssignments: Record<string, string>; homeBench: string[]; events: MatchEvent[]; positionHistories: Record<string, PositionChange[]> }
export type RestoredDraft = { draft: MatchDraftState; starters: Record<string, string>; bench: string[]; sourceSot: Pick<Match, 'halftimeOpponentSot' | 'fulltimeOpponentSot'> }

const slotPositions = Object.fromEntries(TACTICAL_SLOT_DEFINITIONS.map(slot => [slot.id, slot.ratingPosition])) as Record<string, Position>

/** Validate saved relationships independently of today's roster. Set/Map
 * projections below must never silently repair conflicting source rows. */
function sourceRelationshipErrors(match: Match): string[] {
  const errors: string[] = [], ids = new Set<string>(), eventIds = new Set<string>()
  const teamId = match.teamId ?? match.homeTeamId
  const belongsToFixture = (id: string) => id === match.homeTeamId || id === match.awayTeamId
  const hasPlayer = (id: string, team?: string) => match.appearances.some(row => row.playerId === id && (!team || row.teamId === team))
  if (!belongsToFixture(teamId)) errors.push('Recorded team is not a fixture side.')
  for (const row of match.appearances) {
    if (!row.playerId || ids.has(row.playerId)) errors.push('Saved lineup contains a missing or duplicate player ID.')
    ids.add(row.playerId)
    if (!belongsToFixture(row.teamId)) errors.push('Saved lineup references another team.')
    if (!['starter', 'bench'].includes(row.role) || !normalizeMatchPosition(row.matchPosition ?? row.position)) errors.push('Saved appearance has an invalid role or position.')
    for (const change of row.positionHistory ?? []) {
      if (!Number.isFinite(change.minute) || change.minute < 0 || change.minute > 99 || !normalizeMatchPosition(change.position) || change.tacticalSlotId && !tacticalSlotById[change.tacticalSlotId]) errors.push('Saved position history contains an invalid time, position, or tactical slot.')
    }
  }
  for (const row of match.kickoffLineup ?? []) {
    if (row.playerId && !match.appearances.some(item => item.playerId === row.playerId && item.teamId === teamId && item.role === 'starter')) errors.push('Saved kickoff does not match the recorded starting lineup.')
  }
  for (const event of match.events) {
    if (!event.id || eventIds.has(event.id)) errors.push('Saved events contain a missing or duplicate event ID.')
    eventIds.add(event.id)
    if (!belongsToFixture(event.teamId)) errors.push('Saved event references another team.')
    if (event.minute !== undefined && (!Number.isFinite(event.minute) || event.minute < 0 || event.minute > 99)) errors.push('Saved event time is invalid.')
    if (event.type === 'sub') {
      if (event.playerInId === event.playerOutId || !hasPlayer(event.playerInId, event.teamId) || !hasPlayer(event.playerOutId, event.teamId)) errors.push('Saved substitution does not match the recorded lineup.')
      if (!normalizeMatchPosition(event.position) || event.tacticalSlotId && !tacticalSlotById[event.tacticalSlotId]) errors.push('Saved substitution position or tactical slot is invalid.')
    } else if (event.type === 'goal') {
      if ([event.playerId, event.assistPlayerId].some(id => id && !hasPlayer(id, event.teamId)) || event.concededGoalCausePlayerId && !hasPlayer(event.concededGoalCausePlayerId)) errors.push('Saved goal attribution does not match the recorded lineup.')
    } else if (event.type === 'save') {
      if (!hasPlayer(event.playerId, event.teamId)) errors.push('Saved save does not match the recorded lineup.')
    } else errors.push('Saved event type is invalid.')
  }
  return errors
}

/** Pure restoration boundary. Callers must not mount an editor when this fails. */
export function restoreDraft(match: Match | undefined, _players: Player[], allowIncomplete = false): RestoredDraft | null {
  if (!match || !Array.isArray(match.appearances) || !Array.isArray(match.events)) return null
  try {
    if (sourceRelationshipErrors(match).length) return null
    const teamId = match.teamId ?? match.homeTeamId
    // Match snapshots are authoritative even when a player has since moved or
    // been deleted from the current roster.
    const saved = match.kickoffLineup ?? []
    const modernSnapshot = saved.some(slot => slot.ratingPosition !== undefined || slot.displayPosition !== undefined)
    const kickoff = allowIncomplete && !match.events.length
      ? modernSnapshot ? saved : reconstructLegacyKickoffLineup(match, teamId)
      : kickoffLineupForMatch(match, teamId)
    if (!validateKickoffLineup(kickoff, !allowIncomplete || match.events.length > 0).valid) return null
    if (allowIncomplete && !modernSnapshot && !saved.length && match.appearances.some(item => item.role === 'starter') && !kickoff.length) return null
    const starters = Object.fromEntries(kickoff.map(slot => [slot.id, slot.playerId!]))
    const bench = [...new Set(match.appearances.filter(item => item.teamId === teamId && item.role === 'bench' && !Object.values(starters).includes(item.playerId)).map(item => item.playerId))]
    const histories = Object.fromEntries(match.appearances.filter(item => item.teamId === teamId && item.positionHistory?.length).map(item => [item.playerId, item.positionHistory!])) as Record<string, PositionChange[]>
    const roster = [...new Set([...Object.values(starters), ...bench])]
    const hasExactTacticalMove = Object.values(histories).some(changes => changes.some(change => change.tacticalSlotId))
    const replayed = match.events.length || hasExactTacticalMove ? rebuildLiveHistory(starters, roster, match.events, histories, slotPositions, teamId) : undefined
    // Replay produces the current slot layout, but the persisted position
    // timeline is authoritative and must never be narrowed during resume.
    const draft = replayed ? { ...replayed, events: match.events, positionHistories: histories } : { slotAssignments: starters, homeBench: bench, events: match.events, positionHistories: histories }
    return { draft, starters, bench, sourceSot: { halftimeOpponentSot: match.halftimeOpponentSot, fulltimeOpponentSot: match.fulltimeOpponentSot } }
  } catch {
    return null
  }
}

/** Recovery errors are displayed without modifying or discarding the source. */
export function draftRestoreFailureReason(match: Match | undefined, allowIncomplete = false): string {
  if (!match) return 'The saved match is missing.'
  if (!Array.isArray(match.appearances) || !Array.isArray(match.events)) return 'The saved match has invalid appearance or event data.'
  try {
    const sourceErrors = sourceRelationshipErrors(match)
    const teamId = match.teamId ?? match.homeTeamId
    const saved = match.kickoffLineup ?? []
    const modernSnapshot = saved.some(slot => slot.ratingPosition !== undefined || slot.displayPosition !== undefined)
    const kickoff = modernSnapshot ? saved : allowIncomplete && !match.events.length
      ? reconstructLegacyKickoffLineup(match, teamId) : kickoffLineupForMatch(match, teamId)
    const errors = validateKickoffLineup(kickoff, !allowIncomplete || match.events.length > 0).errors
    return errors.length ? `Saved kickoff lineup is invalid: ${errors.join(' ')}` : sourceErrors.length ? `Saved match data is invalid: ${[...new Set(sourceErrors)].join(' ')}` : 'Saved event or position history could not be replayed. The saved record was not changed.'
  } catch {
    return 'The saved kickoff lineup could not be read. The saved record was not changed.'
  }
}
