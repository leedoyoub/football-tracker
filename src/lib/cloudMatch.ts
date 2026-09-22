import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { normalizeMatchCompetitionIdentity } from '../engine/competitionContext'

/** Pure cloud boundary so every persisted tournament identity is exercised without a live client. */
export const serializeCloudEntity = (entity: Team | Player | Match | CompetitionState) => {
  if ('kind' in entity) return { id: entity.id, season: entity.season, kind: entity.kind, team_ids: entity.teamIds }
  if ('position' in entity && 'number' in entity) {
    const { externalPlayerId, photoUrl, ...player } = entity
    return { ...player, external_player_id: externalPlayerId === undefined ? null : String(externalPlayerId), photo_url: photoUrl ?? null }
  }
  if ('appearances' in entity && 'events' in entity) {
    const { competitionType, competitionStage, competitionPairingId, competitionSeriesGame, competitionAssignment, ...match } = entity
    return { ...match, competition_type: competitionType ?? 'league', competition_stage: competitionStage ?? 'regular', competition_pairing_id: competitionPairingId ?? null, competition_series_game: competitionSeriesGame ?? null, competition_assignment: competitionAssignment ?? null }
  }
  return { ...entity }
}

export const deserializeCloudEntity = <T extends Team | Player | Match | CompetitionState>(row: T & { user_id?: string; created_at?: string; updated_at?: string; external_player_id?: string | number | null; photo_url?: string | null; team_ids?: string[]; competition_type?: CompetitionType; competition_stage?: Match['competitionStage']; competition_pairing_id?: string | null; competition_series_game?: number | null; competition_assignment?: Match['competitionAssignment'] | null }) => {
  const { user_id: _user, created_at: _created, updated_at: _updated, external_player_id, photo_url, team_ids, competition_type, competition_stage, competition_pairing_id, competition_series_game, competition_assignment, ...entity } = row
  const restored = { ...entity, ...(external_player_id === undefined || external_player_id === null ? {} : { externalPlayerId: external_player_id }), ...(photo_url === undefined || photo_url === null ? {} : { photoUrl: photo_url }), ...(team_ids === undefined ? {} : { teamIds: team_ids }), ...(competition_type === undefined ? {} : { competitionType: competition_type }), ...(competition_stage === undefined ? {} : { competitionStage: competition_stage }), ...(competition_pairing_id ? { competitionPairingId: competition_pairing_id } : {}), ...(competition_series_game === undefined || competition_series_game === null ? {} : { competitionSeriesGame: competition_series_game }), ...(competition_assignment ? { competitionAssignment: competition_assignment } : {}) } as T
  return 'appearances' in restored && 'events' in restored ? normalizeMatchCompetitionIdentity(restored as Match) as T : restored
}
