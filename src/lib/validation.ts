import type { AppState } from '../types';
import { validateManualOpponentSot } from '../engine/opponentSot';
import { currentTeamIds } from './roster';
import { matchPositionAtEvent, matchPositionSegments, normalizeMatchPosition } from '../engine/timeline';
import { leagueSlotConflict } from '../engine/competition';
import { validateKickoffLineup } from '../engine/kickoffLineup';

// Robust validation checking deep structure
export type StateValidationOptions = {
  allowMissingHistoricalPlayers?: boolean
  allowedMissingHistoricalPlayersByMatch?: ReadonlyMap<string, ReadonlySet<string>>
}
export type StateValidationEntityType = 'app-state' | 'team' | 'player' | 'match' | 'competition-state'
export type StateValidationIssue = { code: string; entityType: StateValidationEntityType; entityId?: string; relatedIds: string[]; message: string }

export class StateValidationError extends Error {
  readonly code: string
  readonly issue: StateValidationIssue
  constructor(issue: StateValidationIssue) {
    super(issue.message)
    this.name = 'StateValidationError'
    this.code = issue.code
    this.issue = issue
  }
}

function matchPlayerIds(match: AppState['matches'][number]): Set<string> {
  const ids = new Set(match.appearances.map(item => item.playerId).filter((id): id is string => typeof id === 'string' && Boolean(id)))
  for (const event of match.events) {
    if (event.type === 'goal') {
      for (const id of [event.playerId, event.assistPlayerId, event.concededGoalCausePlayerId]) if (id) ids.add(id)
    } else if (event.type === 'sub') {
      ids.add(event.playerInId); ids.add(event.playerOutId)
    } else ids.add(event.playerId)
  }
  return ids
}

function validateDraftTransition(previous: AppState, next: AppState): StateValidationIssue[] {
  const draft = next.draftMatch
  if (!draft) return []
  const matchAlreadyFinalized = next.matches.find(match => match.id === draft.id)
  if (matchAlreadyFinalized) return [{ code: 'draft.finalized_id', entityType: 'match', entityId: draft.id, relatedIds: [draft.id], message: `Draft ${draft.id} already has a finalized Match.` }]
  if (typeof draft.id !== 'string' || !draft.id || !Array.isArray(draft.appearances) || !Array.isArray(draft.events)) {
    return [{ code: 'draft.invalid_structure', entityType: 'match', entityId: draft.id, relatedIds: [], message: 'Draft is missing its stable ID, appearances, or events.' }]
  }
  if (draft.appearances.some(appearance => !appearance || typeof appearance !== 'object') || (draft.kickoffLineup !== undefined && !Array.isArray(draft.kickoffLineup))) {
    return [{ code: 'draft.invalid_structure', entityType: 'match', entityId: draft.id, relatedIds: [], message: 'Draft contains malformed appearance or kickoff lineup data.' }]
  }
  const starters = draft.appearances.filter(appearance => appearance.role === 'starter')
  const bench = draft.appearances.filter(appearance => appearance.role === 'bench')
  if (starters.length > 11 || bench.length > 12) return [{ code: 'draft.lineup_capacity', entityType: 'match', entityId: draft.id, relatedIds: [...starters, ...bench].map(appearance => appearance.playerId), message: 'Draft exceeds the 11-player starting or 12-player bench limit.' }]

  const allowedMissing = new Map<string, ReadonlySet<string>>()
  const previousDraft = previous.draftMatch
  const playerIds = new Set(next.players.map(player => player.id))
  if (previousDraft?.id === draft.id && Array.isArray(previousDraft.appearances) && Array.isArray(previousDraft.events)) {
    const missing = new Set([...matchPlayerIds(previousDraft)].filter(id => !playerIds.has(id)))
    if (missing.size) allowedMissing.set(draft.id, missing)
  }
  const referencedIds = matchPlayerIds(draft)
  for (const slot of draft.kickoffLineup ?? []) if (slot.playerId) referencedIds.add(slot.playerId)
  const unknown = [...referencedIds].filter(id => !playerIds.has(id) && !allowedMissing.get(draft.id)?.has(id))
  if (unknown.length) return [{ code: 'draft.invalid_reference', entityType: 'match', entityId: draft.id, relatedIds: unknown, message: `Draft ${draft.id} references players outside its current or previously restored roster.` }]

  const kickoff = validateKickoffLineup(draft.kickoffLineup ?? [], false)
  if (!kickoff.valid) return [{ code: 'draft.invalid_lineup', entityType: 'match', entityId: draft.id, relatedIds: [], message: `Draft kickoff snapshot is malformed: ${kickoff.errors.join(' ')}` }]
  const valid = validateState({ teams: next.teams, players: next.players, matches: [draft], competitionStates: [] }, { allowedMissingHistoricalPlayersByMatch: allowedMissing })
  if (!valid) return [{ code: 'draft.invalid_structure_or_reference', entityType: 'match', entityId: draft.id, relatedIds: [], message: `Draft ${draft.id} failed structure or same-match reference validation.` }]
  return []
}

function duplicateId(rows: readonly { id?: unknown }[], entityType: StateValidationEntityType): StateValidationIssue | undefined {
  const seen = new Set<string>()
  for (const row of rows) {
    if (typeof row?.id !== 'string' || !row.id) continue
    if (seen.has(row.id)) return { code: `${entityType}.duplicate_id`, entityType, entityId: row.id, relatedIds: [row.id], message: `Duplicate stable ${entityType} ID: ${row.id}.` }
    seen.add(row.id)
  }
  return undefined
}

export function validateState(state: any, options: StateValidationOptions = {}): state is AppState {
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
    const appearancePlayerIds = new Set<string>();
    for (const appearance of match.appearances) {
      if (!appearance || typeof appearance !== 'object') return false;
      const allowedMissing = options.allowedMissingHistoricalPlayersByMatch?.get(match.id)?.has(appearance.playerId) ?? false
      if (typeof appearance.playerId !== 'string' || !appearance.playerId || (!playerIds.has(appearance.playerId) && !options.allowMissingHistoricalPlayers && !allowedMissing) || appearancePlayerIds.has(appearance.playerId)) return false;
      if (appearance.teamId !== match.homeTeamId && appearance.teamId !== match.awayTeamId) return false;
      if (!normalizeMatchPosition(appearance.matchPosition ?? appearance.position)) return false;
      if (appearance.positionHistory !== undefined && (!Array.isArray(appearance.positionHistory) || appearance.positionHistory.some((change: { minute?: unknown; position?: unknown } | null) => !change || !Number.isFinite(change.minute) || Number(change.minute) < 0 || typeof change.position !== 'string' || !normalizeMatchPosition(change.position)))) return false;
      appearancePlayerIds.add(appearance.playerId);
    }
    // Check events structure
    for (const event of match.events) {
        if (!event || typeof event !== 'object') return false;
        if (typeof event.id !== 'string' || !event.id || !event.type || !event.teamId || eventIds.has(event.id)) return false;
        eventIds.add(event.id);
        if (event.teamId !== match.homeTeamId && event.teamId !== match.awayTeamId) return false;
        if (event.type === 'goal') {
          if (event.playerId !== undefined && ((!playerIds.has(event.playerId) && !options.allowMissingHistoricalPlayers && !(options.allowedMissingHistoricalPlayersByMatch?.get(match.id)?.has(event.playerId))) || !match.appearances.some((row: { playerId: string; teamId: string }) => row.playerId === event.playerId && row.teamId === event.teamId))) return false;
          if (event.assistPlayerId !== undefined && (event.ownGoal || (!playerIds.has(event.assistPlayerId) && !options.allowMissingHistoricalPlayers && !(options.allowedMissingHistoricalPlayersByMatch?.get(match.id)?.has(event.assistPlayerId))) || !match.appearances.some((row: { playerId: string; teamId: string }) => row.playerId === event.assistPlayerId && row.teamId === event.teamId))) return false;
        } else if (event.type === 'sub') {
          const allowedMissing = options.allowedMissingHistoricalPlayersByMatch?.get(match.id)
          if (event.playerInId === event.playerOutId || (!playerIds.has(event.playerInId) && !options.allowMissingHistoricalPlayers && !allowedMissing?.has(event.playerInId)) || (!playerIds.has(event.playerOutId) && !options.allowMissingHistoricalPlayers && !allowedMissing?.has(event.playerOutId))) return false;
          if (!match.appearances.some((row: { playerId: string; teamId: string }) => row.playerId === event.playerInId && row.teamId === event.teamId) || !match.appearances.some((row: { playerId: string; teamId: string }) => row.playerId === event.playerOutId && row.teamId === event.teamId)) return false;
        } else if (event.type === 'save') {
          const appearance = match.appearances.find((row: { playerId: string; teamId: string }) => row.playerId === event.playerId && row.teamId === event.teamId);
          if (!appearance || (!playerIds.has(event.playerId) && !options.allowMissingHistoricalPlayers && !(options.allowedMissingHistoricalPlayersByMatch?.get(match.id)?.has(event.playerId))) || !(event.minute === undefined ? matchPositionSegments(match, appearance).some(segment => segment.position === 'GK') : matchPositionAtEvent(match, appearance, event) === 'GK')) return false;
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

/** Validate only changed immutable collections while retaining known historical references. */
export function validateStateTransition(previous: AppState, next: AppState): StateValidationIssue[] {
  const teamsChanged = next.teams !== previous.teams
  const playersChanged = next.players !== previous.players
  const matchesChanged = next.matches !== previous.matches
  const competitionsChanged = next.competitionStates !== previous.competitionStates
  const draftNeedsValidation = Boolean(next.draftMatch && (next.draftMatch !== previous.draftMatch || teamsChanged || playersChanged || matchesChanged || competitionsChanged))
  if (!teamsChanged && !playersChanged && !matchesChanged && !competitionsChanged && !draftNeedsValidation) return []

  if (teamsChanged) {
    const duplicate = duplicateId(next.teams, 'team')
    if (duplicate) return [duplicate]
  }
  if (playersChanged) {
    const duplicate = duplicateId(next.players, 'player')
    if (duplicate) return [duplicate]
  }
  if (matchesChanged) {
    const duplicate = duplicateId(next.matches, 'match')
    if (duplicate) return [duplicate]
  }
  if (competitionsChanged) {
    const duplicate = duplicateId(next.competitionStates ?? [], 'competition-state')
    if (duplicate) return [duplicate]
  }

  if (teamsChanged || playersChanged) {
    const teamIds = new Set(next.teams.map(team => team.id))
    for (const player of next.players) {
      if (player.teamIds !== undefined && (!Array.isArray(player.teamIds) || new Set(player.teamIds).size !== player.teamIds.length || player.teamId !== (player.teamIds[0] ?? ''))) {
        return [{ code: 'player.invalid_team_membership', entityType: 'player', entityId: player.id, relatedIds: Array.isArray(player.teamIds) ? player.teamIds : [], message: `Player ${player.id} has malformed or inconsistent current team membership.` }]
      }
      const unknown = currentTeamIds(player).filter(id => !teamIds.has(id))
      if (unknown.length) return [{ code: 'player.unknown_team', entityType: 'player', entityId: player.id, relatedIds: unknown, message: `Player ${player.id} references an unknown current team.` }]
    }
  }

  const previousMatches = new Map(previous.matches.map(match => [match.id, match]))
  const changedMatches = matchesChanged ? next.matches.filter(match => previousMatches.get(match.id) !== match) : []
  const allowedMissingHistoricalPlayersByMatch = new Map<string, ReadonlySet<string>>()
  const nextPlayerIds = new Set(next.players.map(player => player.id))
  for (const oldMatch of previous.matches) {
    const oldRefs = matchPlayerIds(oldMatch)
    const missing = new Set([...oldRefs].filter(id => !nextPlayerIds.has(id)))
    if (missing.size) allowedMissingHistoricalPlayersByMatch.set(oldMatch.id, missing)
  }

  for (const changed of changedMatches) {
    const unrecognized = [...matchPlayerIds(changed)].filter(id => !nextPlayerIds.has(id) && !allowedMissingHistoricalPlayersByMatch.get(changed.id)?.has(id))
    if (unrecognized.length) return [{ code: 'match.invalid_reference', entityType: 'match', entityId: changed.id, relatedIds: unrecognized, message: `Match ${changed.id} references a player absent from its historical record.` }]
    const conflict = leagueSlotConflict(next.matches, changed, changed.id)
    if (conflict) return [{ code: 'match.duplicate_league_slot', entityType: 'match', entityId: changed.id, relatedIds: [conflict.id], message: `Match ${changed.id} conflicts with ${conflict.id} in the same League team/season/MatchDay slot.` }]
  }

  const checked = validateState({
    teams: teamsChanged || playersChanged || matchesChanged ? next.teams : [],
    players: teamsChanged || playersChanged || matchesChanged ? next.players : [],
    matches: changedMatches,
    competitionStates: competitionsChanged ? next.competitionStates ?? [] : [],
  }, { allowedMissingHistoricalPlayersByMatch })
  if (!checked) {
    const entityType: StateValidationEntityType = changedMatches.length ? 'match' : competitionsChanged ? 'competition-state' : playersChanged ? 'player' : teamsChanged ? 'team' : 'app-state'
    return [{ code: entityType === 'match' ? 'match.invalid_structure_or_reference' : `${entityType}.invalid_structure_or_reference`, entityType, relatedIds: [], message: `The changed ${entityType} data failed structural or reference validation.` }]
  }

  if (competitionsChanged) {
    const teamIds = new Set(next.teams.map(team => team.id))
    for (const competition of next.competitionStates ?? []) {
      if (competition.kind === 'champions-draw') {
        const repeated = competition.teamIds.find((id, index) => competition.teamIds.indexOf(id) !== index)
        if (repeated) return [{ code: 'competition-state.duplicate_team_reference', entityType: 'competition-state', entityId: competition.id, relatedIds: [repeated], message: `Competition state ${competition.id} repeats team ${repeated}.` }]
      }
      const unknown = competition.teamIds.filter(id => !teamIds.has(id))
      if (unknown.length) return [{ code: 'competition-state.unknown_team_reference', entityType: 'competition-state', entityId: competition.id, relatedIds: unknown, message: `Competition state ${competition.id} references an unknown team.` }]
    }
  }
  return draftNeedsValidation ? validateDraftTransition(previous, next) : []
}

export function assertValidStateTransition(previous: AppState, next: AppState): void {
  const issue = validateStateTransition(previous, next)[0]
  if (issue) throw new StateValidationError(issue)
}
