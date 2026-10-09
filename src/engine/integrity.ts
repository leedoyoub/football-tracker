import type { CompetitionState, Match, Player, Team } from '../types'
import { matchScore } from './rating'
import { isOnPitchAtEvent, matchPositionSegments, normalizeMatchPosition, pitchWindow } from './timeline'
import { validateKickoffLineup } from './kickoffLineup'
import { tacticalSlotById } from './tacticalSlots'
import { competitionIdentityForMatch } from './competitionContext'
import { leagueSlotTeamIds } from './leagueSlots'
import { validateManualOpponentSot } from './opponentSot'
import { recordedTeamId } from './matchPerspective'
import { currentTeamIds } from '../lib/roster'

export type IntegritySeverity = 'error' | 'warning' | 'info'
export type IntegrityEntityType = 'app-state' | 'team' | 'player' | 'match' | 'competition-state'
export type IntegrityIssue = {
  code: string
  severity: IntegritySeverity
  entityType: IntegrityEntityType
  entityId?: string
  relatedIds: string[]
  impact: string
  safeAction: string
  matchId?: string
  message: string
}
export type IntegrityReport = { issues: IntegrityIssue[]; errors: number; warnings: number; info: number }

type IntegrityIssueDetails = { code?: string; entityType?: IntegrityEntityType; entityId?: string; relatedIds?: string[]; impact?: string; safeAction?: string }
const issueCode = (message: string) => {
  const known: Array<[string, string]> = [
    ['Duplicate stable team ID', 'team.duplicate_id'], ['Duplicate stable player ID', 'player.duplicate_id'],
    ['Duplicate stable competition state ID', 'competition-state.duplicate_id'], ['Player ', 'player.invalid_reference'],
    ['Missing stable match ID', 'match.missing_identity'], ['Duplicate stable match ID', 'match.duplicate_id'],
    ['Lineup references an unknown player', 'match.missing_player_reference'], ['Substitution references an unknown player', 'match.missing_player_reference'],
    ['Goal scorer references an unknown player', 'match.missing_player_reference'], ['Goal assister references an unknown player', 'match.missing_player_reference'],
    ['Conceded-goal attribution references an unknown player', 'match.missing_player_reference'], ['Save references an unknown player', 'match.missing_player_reference'],
    ['Duplicate League slot', 'match.duplicate_league_slot'], ['League slot gap', 'competition.league_slot_gap'],
    ['Competition state ', 'competition-state.invalid_reference'], ['Player appears more than once', 'match.duplicate_appearance'],
    ['Event references a team', 'match.invalid_event_team_reference'], ['Kickoff lineup:', 'match.invalid_kickoff_lineup'],
    ['Incomplete HT/FT Opponent SOT', 'match.incomplete_opponent_sot'], ['Opponent SOT inconsistency', 'match.invalid_opponent_sot'],
    ['Substitution does not match', 'match.invalid_substitution_reference'], ['Save recorded while', 'match.invalid_save_reference'],
    ['Event minute is outside', 'match.invalid_event_minute'], ['Unsupported match duration', 'match.unsupported_duration'],
  ]
  const match = known.find(([prefix]) => message.startsWith(prefix))
  if (match) return match[1]
  return 'integrity.review_required'
}
const add = (issues: IntegrityIssue[], severity: IntegritySeverity, match: Match | undefined, message: string, details: IntegrityIssueDetails = {}) => {
  const entityType = details.entityType ?? (match ? 'match' : 'app-state')
  const impact = details.impact ?? (severity === 'error' ? 'This record or its derived statistics may be incomplete or inconsistent.' : 'This condition may affect historical interpretation or derived results.')
  const safeAction = details.safeAction ?? 'Review the referenced source data or restore the original entity from a trusted backup; this audit does not modify data.'
  issues.push({ code: details.code ?? issueCode(message), severity, entityType, ...(details.entityId ? { entityId: details.entityId } : match ? { entityId: match.id } : {}), relatedIds: details.relatedIds ?? [], impact, safeAction, ...(match ? { matchId: match.id } : {}), message })
}

/** Read-only diagnostic pass. The Records screen memoizes this explicit-only scan. */
export function auditDataIntegrity(matches: Match[], players: Player[], teams: Team[], states: CompetitionState[] = []): IntegrityReport {
  const issues: IntegrityIssue[] = []; const playerIds = new Set(players.map(player => player.id)); const teamIds = new Set(teams.map(team => team.id)); const matchIds = new Set<string>()
  for (const [label, rows] of [['team', teams], ['player', players], ['competition state', states]] as const) {
    const seen = new Set<string>()
    for (const row of rows) {
      if (seen.has(row.id)) add(issues, 'error', undefined, `Duplicate stable ${label} ID: ${row.id}.`, { code: `${label === 'competition state' ? 'competition-state' : label}.duplicate_id`, entityType: label === 'competition state' ? 'competition-state' : label, entityId: row.id, relatedIds: [row.id] })
      seen.add(row.id)
    }
  }
  for (const player of players) {
    if (player.teamIds === undefined) {
      if (player.teamId && !teamIds.has(player.teamId)) add(issues, 'error', undefined, `Player ${player.id} has an unknown current team.`, { code: 'player.unknown_team', entityType: 'player', entityId: player.id, relatedIds: [player.teamId] })
      continue
    }
    if (!Array.isArray(player.teamIds) || player.teamIds.some(id => typeof id !== 'string' || !id)) {
      add(issues, 'error', undefined, `Player ${player.id} has malformed current teamIds.`, { code: 'player.invalid_team_ids', entityType: 'player', entityId: player.id })
      continue
    }
    if (new Set(player.teamIds).size !== player.teamIds.length) add(issues, 'error', undefined, `Duplicate current team membership for player ${player.id}.`, { code: 'player.duplicate_team_membership', entityType: 'player', entityId: player.id, relatedIds: player.teamIds })
    if (player.teamId !== (player.teamIds[0] ?? '')) add(issues, 'error', undefined, `Player ${player.id} has inconsistent teamId and teamIds.`, { code: 'player.inconsistent_primary_team', entityType: 'player', entityId: player.id, relatedIds: player.teamIds })
    if (player.teamIds.some(id => !teamIds.has(id))) add(issues, 'error', undefined, `Player ${player.id} has an unknown current team.`, { code: 'player.unknown_team', entityType: 'player', entityId: player.id, relatedIds: player.teamIds.filter(id => !teamIds.has(id)) })
  }
  const rosterCounts = new Map<string, string[]>()
  for (const player of players) {
    const validMembership = player.teamIds === undefined || Array.isArray(player.teamIds)
    if (!validMembership) continue
    for (const teamId of currentTeamIds(player)) { const ids = rosterCounts.get(teamId) ?? []; ids.push(player.id); rosterCounts.set(teamId, ids) }
  }
  for (const [teamId, ids] of rosterCounts) if (ids.length > 23) add(issues, 'warning', undefined, `Team ${teamId} has ${ids.length} current roster members; the limit is 23.`, { code: 'player.roster_capacity_exceeded', entityType: 'team', entityId: teamId, relatedIds: ids, impact: 'New membership additions for this team may be rejected until the roster is within capacity.', safeAction: 'Review current registrations and release or transfer players intentionally; the audit preserves the current roster.' })
  for (const competition of states) {
    if (!Array.isArray(competition.teamIds)) {
      add(issues, 'error', undefined, `Competition state ${competition.id} has malformed teamIds.`, { code: 'competition-state.invalid_team_ids', entityType: 'competition-state', entityId: competition.id })
      continue
    }
    const unknown = competition.teamIds.filter(id => !teamIds.has(id))
    if (unknown.length) add(issues, 'error', undefined, `Competition state ${competition.id} references an unknown team.`, { code: 'competition-state.unknown_team_reference', entityType: 'competition-state', entityId: competition.id, relatedIds: unknown })
  }
  const leagueSlots = new Map<string, Map<number, Match[]>>()
  const knockoutSlots = new Map<string, Match>()
  for (const match of matches) {
    if (!match.id || !match.season) add(issues, 'error', match, 'Missing stable match ID or season.')
    if (matchIds.has(match.id)) add(issues, 'error', match, 'Duplicate stable match ID.')
    matchIds.add(match.id)
    if (!Number.isFinite(match.duration) || match.duration <= 0 || match.duration > 99) add(issues, 'warning', match, 'Unsupported match duration.')
    if (match.competitionType !== undefined && !['league', 'cup', 'champions'].includes(match.competitionType)) add(issues, 'error', match, 'Match has an unknown competition type.')
    if (match.teamId && !teamIds.has(match.teamId)) add(issues, 'error', match, 'Match references an unknown registered team.')
    if (match.teamId && match.teamId !== match.homeTeamId && match.teamId !== match.awayTeamId) add(issues, 'error', match, 'Recorded team is not a side of this fixture.')
    const identity = competitionIdentityForMatch(match)
    if (match.competitionAssignment && identity !== match.competitionAssignment) add(issues, 'error', match, 'Invalid competition assignment snapshot.')
    if (identity.competitionType === 'league') {
      if (!Number.isInteger(identity.matchDay) || identity.matchDay < 1 || identity.matchDay > 30) add(issues, 'error', match, 'League MatchDay is out of range.')
      for (const teamId of leagueSlotTeamIds(match)) {
        const key = `${match.season}:${teamId}`
        const days = leagueSlots.get(key) ?? new Map<number, Match[]>()
        const occupants = days.get(identity.matchDay) ?? []
        if (occupants.length) add(issues, 'error', match, `Duplicate League slot for ${teamId} MD${identity.matchDay}.`, { code: 'match.duplicate_league_slot', relatedIds: [teamId, ...occupants.map(item => item.id)] })
        occupants.push(match); days.set(identity.matchDay, occupants); leagueSlots.set(key, days)
      }
    } else {
      const owner = recordedTeamId(match)
      const slot = identity.competitionType === 'champions'
        ? `${match.season}:champions:${identity.stage}:${identity.pairingId ?? ''}:${owner}:${identity.seriesGame ?? ''}`
        : `${match.season}:cup:${identity.stage}:${owner}`
      if (identity.competitionType === 'champions' && identity.stage !== 'finalReplay' && (!identity.pairingId || !Number.isInteger(identity.seriesGame) || identity.seriesGame! < 1 || identity.seriesGame! > (identity.stage === 'final' ? 2 : 3))) add(issues, 'error', match, 'Invalid Champions series game or pairing.')
      if (knockoutSlots.has(slot)) add(issues, 'error', match, `Duplicate ${identity.competitionType === 'champions' ? 'Champions' : 'Cup'} logical slot.`)
      else knockoutSlots.set(slot, match)
    }
    if ((match.halftimeOpponentSot === undefined) !== (match.fulltimeOpponentSot === undefined)) add(issues, 'warning', match, 'Incomplete HT/FT Opponent SOT pair.')
    const manualSot = validateManualOpponentSot(match)
    if (manualSot.kind === 'invalid') add(issues, 'warning', match, `Opponent SOT inconsistency: ${manualSot.message}`)
    if (!teamIds.has(match.homeTeamId) && !match.opponentName) add(issues, 'warning', match, 'Home team has no registered-team or opponent context.')
    if (!teamIds.has(match.awayTeamId) && !match.opponentName) add(issues, 'warning', match, 'Away team has no registered-team or opponent context.')
    const matchTeamIds = new Set([match.homeTeamId, match.awayTeamId].filter(Boolean))
    if (match.kickoffLineup?.length) {
      const kickoff = validateKickoffLineup(match.kickoffLineup)
      for (const message of kickoff.errors) add(issues, 'error', match, `Kickoff lineup: ${message}`)
    }
    const starters = new Set<string>(); const appearances = new Map<string, number>(); const eventIds = new Set<string>(); const goalFingerprints = new Set<string>(); const subFingerprints = new Set<string>()
    for (const appearance of match.appearances) {
      appearances.set(appearance.playerId, (appearances.get(appearance.playerId) ?? 0) + 1)
      if (!playerIds.has(appearance.playerId)) add(issues, 'error', match, 'Lineup references an unknown player.', { code: 'match.missing_player_reference', relatedIds: [appearance.playerId] })
      if (!matchTeamIds.has(appearance.teamId)) add(issues, 'error', match, 'Lineup references a team that is not in this match.', { code: 'match.invalid_team_reference', relatedIds: [appearance.teamId] })
      if (identity.competitionType === 'champions' && match.teamId && appearance.teamId !== match.teamId) add(issues, 'error', match, 'Champions independent opponent lineup is stored in another team record.')
      if (appearance.role === 'starter') { if (starters.has(appearance.playerId)) add(issues, 'error', match, 'Player is duplicated in the starting XI.'); starters.add(appearance.playerId) }
      if (!normalizeMatchPosition(appearance.matchPosition ?? appearance.position)) add(issues, 'error', match, 'Appearance has an unknown match position.')
      const window = pitchWindow(match, appearance)
      if (window && window.exit < window.enter) add(issues, 'error', match, 'Negative playing interval.')
      const history = appearance.positionHistory ?? []
      for (let index = 0; index < history.length; index++) {
        const change = history[index]
        if (!Number.isFinite(change.minute) || change.minute < 0 || change.minute > 99 || !normalizeMatchPosition(change.position)) add(issues, 'error', match, 'Malformed position-change timeline.')
        if (change.tacticalSlotId && !tacticalSlotById[change.tacticalSlotId]) add(issues, 'warning', match, 'Position change has an unknown tactical slot.')
        if (index && change.minute < history[index - 1].minute) add(issues, 'warning', match, 'Position changes are not chronological.')
      }
      const segments = matchPositionSegments(match, appearance)
      for (let index = 1; index < segments.length; index++) if (segments[index].enter < segments[index - 1].exit) add(issues, 'error', match, 'Overlapping contradictory position intervals.')
    }
    for (const count of appearances.values()) if (count > 1) add(issues, 'error', match, 'Player appears more than once in the lineup.')
    for (const event of match.events) {
      if (!event.id) add(issues, 'error', match, 'Event is missing its stable ID.')
      else if (eventIds.has(event.id)) add(issues, 'error', match, 'Duplicate stable event ID.')
      else eventIds.add(event.id)
      if (event.minute !== undefined && (!Number.isFinite(event.minute) || event.minute < 0 || event.minute > 99)) add(issues, 'error', match, 'Event minute is outside supported range.')
      if (!matchTeamIds.has(event.teamId)) add(issues, 'error', match, 'Event references a team that is not in this match.')
      if (event.type === 'sub') {
        if (event.tacticalSlotId && !tacticalSlotById[event.tacticalSlotId]) add(issues, 'warning', match, 'Substitution has an unknown tactical slot.')
        if (!playerIds.has(event.playerInId) || !playerIds.has(event.playerOutId)) add(issues, 'error', match, 'Substitution references an unknown player.', { code: 'match.missing_player_reference', relatedIds: [event.playerInId, event.playerOutId].filter(id => !playerIds.has(id)) })
        const fingerprint = [event.teamId, event.minute, event.playerOutId, event.playerInId].join('|')
        if (subFingerprints.has(fingerprint)) add(issues, 'warning', match, 'Duplicate logically identical substitution event.')
        subFingerprints.add(fingerprint)
        const incoming = match.appearances.find(appearance => appearance.playerId === event.playerInId && appearance.teamId === event.teamId)
        const outgoing = match.appearances.find(appearance => appearance.playerId === event.playerOutId && appearance.teamId === event.teamId)
        if (!incoming || !outgoing) add(issues, 'error', match, 'Substitution does not match the recorded lineup.')
        const outgoingWindow = outgoing && pitchWindow(match, outgoing)
        if (outgoing && (!outgoingWindow || event.minute < outgoingWindow.enter || event.minute > outgoingWindow.exit)) add(issues, 'error', match, 'Substitution takes off a player who is not on pitch.')
      }
      if (event.type === 'goal') {
        const fingerprint = [event.teamId, event.minute, event.playerId ?? '', event.assistPlayerId ?? '', event.ownGoal ? 'own' : 'goal'].join('|')
        if (goalFingerprints.has(fingerprint)) add(issues, 'warning', match, 'Duplicate logically identical goal event.')
        goalFingerprints.add(fingerprint)
        if (!event.ownGoal && event.teamId === match.teamId && !event.playerId) add(issues, 'warning', match, 'Tracked-team goal has no scorer.')
        for (const [label, id] of [['scorer', event.playerId], ['assister', event.assistPlayerId]] as const) if (id) {
          if (!playerIds.has(id)) add(issues, 'error', match, `Goal ${label} references an unknown player.`, { code: 'match.missing_player_reference', relatedIds: [id] })
          const appearance = match.appearances.find(item => item.playerId === id && item.teamId === event.teamId)
          if (!appearance && playerIds.has(id)) add(issues, 'warning', match, `Goal ${label} is not in the event team's lineup.`)
          if (appearance && !isOnPitchAtEvent(match, appearance, event)) add(issues, 'warning', match, `Goal ${label} is outside that player's on-pitch interval.`)
        }
        if (event.concededGoalCausePlayerId) {
          if (!playerIds.has(event.concededGoalCausePlayerId)) add(issues, 'error', match, 'Conceded-goal attribution references an unknown player.', { code: 'match.missing_player_reference', relatedIds: [event.concededGoalCausePlayerId] })
          const appearance = match.appearances.find(item => item.playerId === event.concededGoalCausePlayerId)
          if (appearance && !isOnPitchAtEvent(match, appearance, event)) add(issues, 'warning', match, 'Conceded-goal attribution is outside that player\'s on-pitch interval.')
        }
      }
      if (event.type === 'save') {
        if (event.count !== undefined && (!Number.isInteger(event.count) || event.count < 0)) add(issues, 'error', match, 'Save count is malformed; expected a non-negative whole number.')
        if (!playerIds.has(event.playerId)) add(issues, 'error', match, 'Save references an unknown player.', { code: 'match.missing_player_reference', relatedIds: [event.playerId] })
        const appearance = match.appearances.find(item => item.playerId === event.playerId && item.teamId === event.teamId)
        const goalkeeper = appearance && matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
        if (!appearance || !goalkeeper || event.minute !== undefined && !isOnPitchAtEvent(match, appearance, event)) add(issues, 'error', match, 'Save recorded while the player cannot be an on-pitch goalkeeper.')
      }
    }
    const legacy = match as Match & { homeScore?: number; awayScore?: number }
    if (Number.isFinite(legacy.homeScore) && Number.isFinite(legacy.awayScore)) { const score = matchScore(match); if (legacy.homeScore !== score.home || legacy.awayScore !== score.away) add(issues, 'warning', match, 'Stored score differs from the event-derived score.') }
  }
  for (const [key, days] of leagueSlots) {
    const validDays = [...days.keys()].filter(day => Number.isInteger(day) && day >= 1 && day <= 30)
    const latest = Math.max(0, ...validDays)
    for (let day = 1; day <= latest; day++) if (!days.has(day)) add(issues, 'warning', undefined, `League slot gap for ${key} MD${day}.`)
  }
  const report = { issues, errors: issues.filter(issue => issue.severity === 'error').length, warnings: issues.filter(issue => issue.severity === 'warning').length, info: issues.filter(issue => issue.severity === 'info').length }
  return report
}
