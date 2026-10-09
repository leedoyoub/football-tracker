import { TACTICAL_SLOT_DEFINITIONS } from '../engine/tacticalSlots'
import { kickoffLineupForMatch, validateKickoffLineup } from '../engine/kickoffLineup'
import type { Match, MatchEvent, Player, Position, PositionChange } from '../types'
import { rebuildLiveHistory } from '../screens/liveHistory'
import { kickoffConfirmedForEditor } from './draftLifecycle'

type MatchDraftState = { slotAssignments: Record<string, string>; homeBench: string[]; events: MatchEvent[]; positionHistories: Record<string, PositionChange[]> }
export type RestoredDraft = { draft: MatchDraftState; starters: Record<string, string>; bench: string[]; kickoffLineup: Match['kickoffLineup']; sourceSot: Pick<Match, 'halftimeOpponentSot' | 'fulltimeOpponentSot'>; kickoffConfirmed: boolean; missingPlayerIds: string[] }

const slotPositions = Object.fromEntries(TACTICAL_SLOT_DEFINITIONS.map(slot => [slot.id, slot.ratingPosition])) as Record<string, Position>

/** Pure restoration boundary. Callers must not mount an editor when this fails. */
export function restoreDraft(match: Match | undefined, players: Player[]): RestoredDraft | null {
  if (!match || !Array.isArray(match.appearances) || !Array.isArray(match.events)) return null
  try {
    const playerIds = new Set(players.map(player => player.id))
    const teamId = match.teamId ?? match.homeTeamId
    const modernSnapshot = (match.kickoffLineup ?? []).some(slot => slot.ratingPosition !== undefined || slot.displayPosition !== undefined)
    const kickoff = kickoffLineupForMatch(match, teamId, false)
    if (modernSnapshot && match.kickoffLineup?.length && !kickoff.length) return null
    if (!validateKickoffLineup(kickoff, false).valid) return null
    const starters = Object.fromEntries(kickoff.map(slot => [slot.id, slot.playerId!]))
    const bench = [...new Set(match.appearances.filter(item => item.role === 'bench' && !Object.values(starters).includes(item.playerId)).map(item => item.playerId))]
    const histories = Object.fromEntries(match.appearances.filter(item => item.positionHistory?.length).map(item => [item.playerId, item.positionHistory!])) as Record<string, PositionChange[]>
    const roster = [...new Set([...Object.values(starters), ...bench])]
    const hasExactTacticalMove = Object.values(histories).some(changes => changes.some(change => change.tacticalSlotId))
    const replayed = match.events.length || hasExactTacticalMove ? rebuildLiveHistory(starters, roster, match.events, histories, slotPositions) : undefined
    // Replay produces the current slot layout, but the persisted position
    // timeline is authoritative and must never be narrowed during resume.
    const draft = replayed ? { ...replayed, events: match.events, positionHistories: histories } : { slotAssignments: starters, homeBench: bench, events: match.events, positionHistories: histories }
    const referencedIds = new Set(match.appearances.map(item => item.playerId))
    for (const event of match.events) {
      if (event.type === 'goal') {
        for (const id of [event.playerId, event.assistPlayerId, event.concededGoalCausePlayerId]) if (id) referencedIds.add(id)
      } else if (event.type === 'sub') {
        referencedIds.add(event.playerOutId)
        referencedIds.add(event.playerInId)
      } else {
        referencedIds.add(event.playerId)
      }
    }
    const missingPlayerIds = [...referencedIds].filter(id => !playerIds.has(id))
    return { draft, starters, bench, kickoffLineup: kickoff, sourceSot: { halftimeOpponentSot: match.halftimeOpponentSot, fulltimeOpponentSot: match.fulltimeOpponentSot }, kickoffConfirmed: kickoffConfirmedForEditor('resume', match), missingPlayerIds }
  } catch {
    return null
  }
}
