import type { AppState } from '../types';

// Robust validation checking deep structure
export function validateState(state: any): state is AppState {
  if (!state || typeof state !== 'object') return false;
  
  // 1. Core structural arrays
  if (!Array.isArray(state.teams) || !Array.isArray(state.players) || !Array.isArray(state.matches)) return false;
  if (state.competitionStates !== undefined && !Array.isArray(state.competitionStates)) return false;
  
  // 2. Validate Teams
  for (const team of state.teams) {
    if (typeof team.id !== 'string' || !team.id || typeof team.name !== 'string') return false;
  }

  // 3. Validate Players
  for (const player of state.players) {
    if (typeof player.id !== 'string' || !player.id || typeof player.name !== 'string' || (player.teamIds !== undefined && !Array.isArray(player.teamIds))) return false;
  }

  // 4. Validate Matches & Historical Relationships
  for (const match of state.matches) {
    if (typeof match.id !== 'string' || !match.id || !Array.isArray(match.appearances) || !Array.isArray(match.events)) return false;
    if (match.competitionType !== undefined && !['league', 'cup', 'champions'].includes(match.competitionType)) return false;
    if (match.competitionStage !== undefined && typeof match.competitionStage !== 'string') return false;
    
    // Check events structure
    for (const event of match.events) {
        if (!event.id || !event.type || !event.teamId) return false;
    }
  }

  for (const competition of state.competitionStates ?? []) {
    if (typeof competition.id !== 'string' || typeof competition.season !== 'string' || !['champions-draw', 'season-complete'].includes(competition.kind) || !Array.isArray(competition.teamIds)) return false;
  }

  return true;
}
