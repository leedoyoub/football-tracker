import type { Appearance, AppState } from '../types';
import { validateManualOpponentSot } from '../engine/opponentSot';
import { currentTeamIds } from './roster';
import { matchPositionAtEvent, matchPositionSegments, normalizeMatchPosition } from '../engine/timeline';
import { validateKickoffLineup } from '../engine/kickoffLineup';
import { tacticalSlotById } from '../engine/tacticalSlots';
import type { FormationSlot } from '../types';

// Robust validation checking deep structure
export function validateState(state: any): state is AppState {
  if (!state || typeof state !== 'object') return false;
  
  // 1. Core structural arrays
  if (!Array.isArray(state.teams) || !Array.isArray(state.players) || !Array.isArray(state.matches)) return false;
  if (state.competitionStates !== undefined && !Array.isArray(state.competitionStates)) return false;

  const teamIds = new Set<string>();
  const playerIds = new Set<string>();
  const matchIds = new Set<string>();
  const competitionIds = new Set<string>();
  
  // 2. Validate Teams
  for (const team of state.teams) {
    if (!team || typeof team !== 'object') return false;
    if (typeof team.id !== 'string' || !team.id || typeof team.name !== 'string' || teamIds.has(team.id)) return false;
    teamIds.add(team.id);
  }

  // 3. Validate Players
  for (const player of state.players) {
    if (!player || typeof player !== 'object') return false;
    if (typeof player.id !== 'string' || !player.id || typeof player.name !== 'string' || playerIds.has(player.id)) return false;
    if (player.teamIds !== undefined && (!Array.isArray(player.teamIds) || player.teamIds.some((id: unknown) => typeof id !== 'string' || !id || !teamIds.has(id)) || new Set(player.teamIds).size !== player.teamIds.length || player.teamId !== (player.teamIds[0] ?? ''))) return false;
    if (player.teamIds === undefined && player.teamId && !teamIds.has(player.teamId)) return false;
    if (player.teamIds === undefined && player.teamId !== undefined && typeof player.teamId !== 'string') return false;
    if (currentTeamIds(player).some(id => !teamIds.has(id))) return false;
    playerIds.add(player.id);
  }

  // 4. Validate Matches & Historical Relationships
  for (const match of state.matches) {
    if (!match || typeof match !== 'object') return false;
    if (typeof match.id !== 'string' || !match.id || !Array.isArray(match.appearances) || !Array.isArray(match.events) || matchIds.has(match.id)) return false;
    matchIds.add(match.id);
    if (match.teamId !== undefined && (!teamIds.has(match.teamId) || match.teamId !== match.homeTeamId && match.teamId !== match.awayTeamId)) return false;
    if (match.competitionType !== undefined && !['league', 'cup', 'champions'].includes(match.competitionType)) return false;
    if (match.competitionStage !== undefined && typeof match.competitionStage !== 'string') return false;
    if (match.competitionAssignment !== undefined) {
      const assignment = match.competitionAssignment;
      if (!assignment || typeof assignment !== 'object' || !['league', 'cup', 'champions'].includes(assignment.competitionType) || assignment.season !== match.season || typeof assignment.stage !== 'string' || !assignment.stage) return false;
      if (assignment.teamId !== match.homeTeamId && assignment.teamId !== match.awayTeamId) return false;
      if (assignment.opponentTeamId !== undefined && assignment.opponentTeamId !== (assignment.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId)) return false;
      if (!Number.isInteger(assignment.matchDay) || assignment.matchDay < 1 || assignment.competitionType === 'league' && assignment.matchDay > 30) return false;
      if (assignment.pairingId !== undefined && (typeof assignment.pairingId !== 'string' || !assignment.pairingId)) return false;
      if (assignment.seriesGame !== undefined && (!Number.isInteger(assignment.seriesGame) || assignment.seriesGame < 1 || assignment.seriesGame > 3)) return false;
    }
    
    const eventIds = new Set<string>();
    const appearancesById = new Map<string, Appearance>();
    for (const appearance of match.appearances) {
      if (!appearance || typeof appearance !== 'object') return false;
      // Historical Match facts retain stable player IDs after a player is
      // deleted from the current roster. Never resolve or rewrite those IDs.
      if (typeof appearance.playerId !== 'string' || !appearance.playerId || appearancesById.has(appearance.playerId)) return false;
      if (appearance.teamId !== match.homeTeamId && appearance.teamId !== match.awayTeamId) return false;
      if (!normalizeMatchPosition(appearance.matchPosition ?? appearance.position)) return false;
      if (appearance.positionHistory !== undefined && (!Array.isArray(appearance.positionHistory) || appearance.positionHistory.some((change: { minute?: unknown; position?: unknown } | null) => !change || !Number.isFinite(change.minute) || Number(change.minute) < 0 || typeof change.position !== 'string' || !normalizeMatchPosition(change.position)))) return false;
      if (appearance.positionHistory?.some((change: { tacticalSlotId?: string }) => change.tacticalSlotId !== undefined && !tacticalSlotById[change.tacticalSlotId])) return false;
      appearancesById.set(appearance.playerId, appearance);
    }
    const hasAppearance = (id: string, teamId: string) => appearancesById.get(id)?.teamId === teamId;
    if (match.kickoffLineup !== undefined) {
      if (!Array.isArray(match.kickoffLineup) || match.kickoffLineup.some((slot: FormationSlot | null) => !slot || typeof slot.id !== 'string' || !slot.id || slot.playerId !== null && (typeof slot.playerId !== 'string' || !slot.playerId))) return false;
      // Modern snapshots own tactical identities. Legacy snapshots can have
      // player IDs as slot IDs and retain their existing reconstruction route.
      const modern = match.kickoffLineup.some((slot: FormationSlot) => slot.ratingPosition !== undefined || slot.displayPosition !== undefined);
      if (modern && (!validateKickoffLineup(match.kickoffLineup, false).valid || match.kickoffLineup.some((slot: FormationSlot) => {
        if (!slot.playerId) return false;
        const row = appearancesById.get(slot.playerId);
        return row?.teamId !== (match.teamId ?? match.homeTeamId) || row?.role !== 'starter';
      }))) return false;
    }
    // Check events structure
    for (const event of match.events) {
        if (!event || typeof event !== 'object') return false;
        if (typeof event.id !== 'string' || !event.id || !event.type || !event.teamId || eventIds.has(event.id)) return false;
        eventIds.add(event.id);
        if (event.teamId !== match.homeTeamId && event.teamId !== match.awayTeamId) return false;
        if (event.type === 'goal') {
          if (event.playerId !== undefined && !hasAppearance(event.playerId, event.teamId)) return false;
          if (event.assistPlayerId !== undefined && (event.ownGoal || !hasAppearance(event.assistPlayerId, event.teamId))) return false;
        } else if (event.type === 'sub') {
          if (event.playerInId === event.playerOutId) return false;
          if (event.tacticalSlotId !== undefined && !tacticalSlotById[event.tacticalSlotId]) return false;
          if (!hasAppearance(event.playerInId, event.teamId) || !hasAppearance(event.playerOutId, event.teamId)) return false;
        } else if (event.type === 'save') {
          const appearance = appearancesById.get(event.playerId);
          if (!appearance || appearance.teamId !== event.teamId || !(event.minute === undefined ? matchPositionSegments(match, appearance).some(segment => segment.position === 'GK') : matchPositionAtEvent(match, appearance, event) === 'GK')) return false;
        } else return false;
    }
    if (validateManualOpponentSot(match, match.teamId ?? match.homeTeamId).kind === 'invalid') return false;
  }

  for (const competition of state.competitionStates ?? []) {
    if (!competition || typeof competition !== 'object') return false;
    if (typeof competition.id !== 'string' || !competition.id || competitionIds.has(competition.id) || typeof competition.season !== 'string' || !['champions-draw', 'season-complete'].includes(competition.kind) || !Array.isArray(competition.teamIds)) return false;
    competitionIds.add(competition.id);
  }

  return true;
}
