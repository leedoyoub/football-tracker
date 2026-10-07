import type { AppState } from '../types';
import { validateManualOpponentSot } from '../engine/opponentSot';

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
    if (typeof team.id !== 'string' || !team.id || typeof team.name !== 'string' || teamIds.has(team.id)) return false;
    teamIds.add(team.id);
  }

  // 3. Validate Players
  for (const player of state.players) {
    if (typeof player.id !== 'string' || !player.id || typeof player.name !== 'string' || (player.teamIds !== undefined && !Array.isArray(player.teamIds)) || playerIds.has(player.id)) return false;
    playerIds.add(player.id);
  }

  // 4. Validate Matches & Historical Relationships
  for (const match of state.matches) {
    if (typeof match.id !== 'string' || !match.id || !Array.isArray(match.appearances) || !Array.isArray(match.events) || matchIds.has(match.id)) return false;
    matchIds.add(match.id);
    if (match.teamId !== undefined && (!teamIds.has(match.teamId) || match.teamId !== match.homeTeamId && match.teamId !== match.awayTeamId)) return false;
    if (match.competitionType !== undefined && !['league', 'cup', 'champions'].includes(match.competitionType)) return false;
    if (match.competitionStage !== undefined && typeof match.competitionStage !== 'string') return false;
    
    const eventIds = new Set<string>();
    const appearancePlayerIds = new Set<string>();
    for (const appearance of match.appearances) {
      if (typeof appearance.playerId !== 'string' || !appearance.playerId || appearancePlayerIds.has(appearance.playerId)) return false;
      appearancePlayerIds.add(appearance.playerId);
    }
    // Check events structure
    for (const event of match.events) {
        if (typeof event.id !== 'string' || !event.id || !event.type || !event.teamId || eventIds.has(event.id)) return false;
        eventIds.add(event.id);
    }
    if (validateManualOpponentSot(match, match.teamId ?? match.homeTeamId).kind === 'invalid') return false;
  }

  for (const competition of state.competitionStates ?? []) {
    if (typeof competition.id !== 'string' || !competition.id || competitionIds.has(competition.id) || typeof competition.season !== 'string' || !['champions-draw', 'season-complete'].includes(competition.kind) || !Array.isArray(competition.teamIds)) return false;
    competitionIds.add(competition.id);
  }

  return true;
}
