import { TACTICAL_SLOT_DEFINITIONS } from '../engine/tacticalSlots'
import { kickoffLineupForMatch, reconstructLegacyKickoffLineup, validateKickoffLineup } from '../engine/kickoffLineup'
import type { Match, MatchEvent, Player, Position, PositionChange } from '../types'
import { rebuildLiveHistory } from '../screens/liveHistory'

type MatchDraftState = { slotAssignments: Record<string, string>; homeBench: string[]; events: MatchEvent[]; positionHistories: Record<string, PositionChange[]> }
export type RestoredDraft = { draft: MatchDraftState; starters: Record<string, string>; bench: string[]; sourceSot: Pick<Match, 'halftimeOpponentSot' | 'fulltimeOpponentSot'> }

const slotPositions = Object.fromEntries(TACTICAL_SLOT_DEFINITIONS.map(slot => [slot.id, slot.ratingPosition])) as Record<string, Position>

/** Pure restoration boundary. Callers must not mount an editor when this fails. */
export function restoreDraft(match: Match | undefined, _players: Player[], allowIncomplete = false): RestoredDraft | null {
  if (!match || !Array.isArray(match.appearances) || !Array.isArray(match.events)) return null
  try {
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
    const bench = [...new Set(match.appearances.filter(item => item.role === 'bench' && !Object.values(starters).includes(item.playerId)).map(item => item.playerId))]
    const histories = Object.fromEntries(match.appearances.filter(item => item.positionHistory?.length).map(item => [item.playerId, item.positionHistory!])) as Record<string, PositionChange[]>
    const roster = [...new Set([...Object.values(starters), ...bench])]
    const hasExactTacticalMove = Object.values(histories).some(changes => changes.some(change => change.tacticalSlotId))
    const replayed = match.events.length || hasExactTacticalMove ? rebuildLiveHistory(starters, roster, match.events, histories, slotPositions) : undefined
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
    const teamId = match.teamId ?? match.homeTeamId
    const saved = match.kickoffLineup ?? []
    const modernSnapshot = saved.some(slot => slot.ratingPosition !== undefined || slot.displayPosition !== undefined)
    const kickoff = modernSnapshot ? saved : allowIncomplete && !match.events.length
      ? reconstructLegacyKickoffLineup(match, teamId) : kickoffLineupForMatch(match, teamId)
    const errors = validateKickoffLineup(kickoff, !allowIncomplete || match.events.length > 0).errors
    return errors.length ? `Saved kickoff lineup is invalid: ${errors.join(' ')}` : 'Saved event or position history could not be replayed. The saved record was not changed.'
  } catch {
    return 'The saved kickoff lineup could not be read. The saved record was not changed.'
  }
}
