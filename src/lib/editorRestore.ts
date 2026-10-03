import { TACTICAL_SLOT_DEFINITIONS } from '../engine/tacticalSlots'
import { kickoffLineupForMatch, validateKickoffLineup } from '../engine/kickoffLineup'
import type { Match, MatchEvent, Player, Position, PositionChange } from '../types'
import { rebuildLiveHistory } from '../screens/liveHistory'

type MatchDraftState = { slotAssignments: Record<string, string>; homeBench: string[]; events: MatchEvent[]; positionHistories: Record<string, PositionChange[]> }
export type RestoredDraft = { draft: MatchDraftState; starters: Record<string, string>; bench: string[]; sourceSot: Pick<Match, 'halftimeOpponentSot' | 'fulltimeOpponentSot'> }

const slotPositions = Object.fromEntries(TACTICAL_SLOT_DEFINITIONS.map(slot => [slot.id, slot.ratingPosition])) as Record<string, Position>

/** Pure restoration boundary. Callers must not mount an editor when this fails. */
export function restoreDraft(match: Match | undefined, players: Player[]): RestoredDraft | null {
  if (!match || !Array.isArray(match.appearances) || !Array.isArray(match.events)) return null
  try {
    const playerIds = new Set(players.map(player => player.id))
    const teamId = match.teamId ?? match.homeTeamId
    const kickoff = kickoffLineupForMatch(match, teamId).filter(slot => playerIds.has(slot.playerId ?? ''))
    if (!validateKickoffLineup(kickoff).valid) return null
    const starters = Object.fromEntries(kickoff.map(slot => [slot.id, slot.playerId!]))
    const bench = [...new Set(match.appearances.filter(item => item.role === 'bench' && playerIds.has(item.playerId) && !Object.values(starters).includes(item.playerId)).map(item => item.playerId))]
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
