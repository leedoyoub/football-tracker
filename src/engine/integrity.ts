import type { Match, Player, Team } from '../types'
import { matchScore } from './rating'
import { isOnPitchAtEvent, matchPositionSegments, normalizeMatchPosition, pitchWindow } from './timeline'

export type IntegritySeverity = 'error' | 'warning' | 'info'
export type IntegrityIssue = { severity: IntegritySeverity; matchId?: string; message: string }
export type IntegrityReport = { issues: IntegrityIssue[]; errors: number; warnings: number; info: number }

const add = (issues: IntegrityIssue[], severity: IntegritySeverity, match: Match | undefined, message: string) => issues.push({ severity, ...(match ? { matchId: match.id } : {}), message })

/** Read-only diagnostic pass. The Records screen memoizes this explicit-only scan. */
export function auditDataIntegrity(matches: Match[], players: Player[], teams: Team[]): IntegrityReport {
  const issues: IntegrityIssue[] = []; const playerIds = new Set(players.map(player => player.id)); const teamIds = new Set(teams.map(team => team.id)); const matchIds = new Set<string>()
  for (const match of matches) {
    if (!match.id || !match.season) add(issues, 'error', match, 'Missing stable match ID or season.')
    if (matchIds.has(match.id)) add(issues, 'error', match, 'Duplicate stable match ID.')
    matchIds.add(match.id)
    if (!Number.isFinite(match.duration) || match.duration <= 0 || match.duration > 99) add(issues, 'warning', match, 'Unsupported match duration.')
    if (match.competitionType !== undefined && !['league', 'cup', 'champions'].includes(match.competitionType)) add(issues, 'error', match, 'Match has an unknown competition type.')
    if (match.teamId && !teamIds.has(match.teamId)) add(issues, 'error', match, 'Match references an unknown registered team.')
    if (!teamIds.has(match.homeTeamId) && !match.opponentName) add(issues, 'warning', match, 'Home team has no registered-team or opponent context.')
    if (!teamIds.has(match.awayTeamId) && !match.opponentName) add(issues, 'warning', match, 'Away team has no registered-team or opponent context.')
    const matchTeamIds = new Set([match.homeTeamId, match.awayTeamId].filter(Boolean))
    const starters = new Set<string>(); const appearances = new Map<string, number>(); const eventIds = new Set<string>(); const goalFingerprints = new Set<string>(); const subFingerprints = new Set<string>()
    for (const appearance of match.appearances) {
      appearances.set(appearance.playerId, (appearances.get(appearance.playerId) ?? 0) + 1)
      if (!playerIds.has(appearance.playerId)) add(issues, 'error', match, 'Lineup references an unknown player.')
      if (!matchTeamIds.has(appearance.teamId)) add(issues, 'error', match, 'Lineup references a team that is not in this match.')
      if (appearance.role === 'starter') { if (starters.has(appearance.playerId)) add(issues, 'error', match, 'Player is duplicated in the starting XI.'); starters.add(appearance.playerId) }
      if (!normalizeMatchPosition(appearance.matchPosition ?? appearance.position)) add(issues, 'error', match, 'Appearance has an unknown match position.')
      const window = pitchWindow(match, appearance)
      if (window && window.exit < window.enter) add(issues, 'error', match, 'Negative playing interval.')
      const history = appearance.positionHistory ?? []
      for (let index = 0; index < history.length; index++) {
        const change = history[index]
        if (!Number.isFinite(change.minute) || change.minute < 0 || change.minute > match.duration || !normalizeMatchPosition(change.position)) add(issues, 'error', match, 'Malformed position-change timeline.')
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
        if (!playerIds.has(event.playerInId) || !playerIds.has(event.playerOutId)) add(issues, 'error', match, 'Substitution references an unknown player.')
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
          if (!playerIds.has(id)) add(issues, 'error', match, `Goal ${label} references an unknown player.`)
          const appearance = match.appearances.find(item => item.playerId === id && item.teamId === event.teamId)
          if (!appearance && playerIds.has(id)) add(issues, 'warning', match, `Goal ${label} is not in the event team's lineup.`)
          if (appearance && !isOnPitchAtEvent(match, appearance, event)) add(issues, 'warning', match, `Goal ${label} is outside that player's on-pitch interval.`)
        }
        if (event.concededGoalCausePlayerId) {
          if (!playerIds.has(event.concededGoalCausePlayerId)) add(issues, 'error', match, 'Conceded-goal attribution references an unknown player.')
          const appearance = match.appearances.find(item => item.playerId === event.concededGoalCausePlayerId)
          if (appearance && !isOnPitchAtEvent(match, appearance, event)) add(issues, 'warning', match, 'Conceded-goal attribution is outside that player\'s on-pitch interval.')
        }
      }
      if (event.type === 'save') {
        if (!playerIds.has(event.playerId)) add(issues, 'error', match, 'Save references an unknown player.')
        const appearance = match.appearances.find(item => item.playerId === event.playerId && item.teamId === event.teamId)
        const goalkeeper = appearance && matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
        if (!appearance || !goalkeeper || event.minute !== undefined && !isOnPitchAtEvent(match, appearance, event)) add(issues, 'error', match, 'Save recorded while the player cannot be an on-pitch goalkeeper.')
      }
    }
    const legacy = match as Match & { homeScore?: number; awayScore?: number }
    if (Number.isFinite(legacy.homeScore) && Number.isFinite(legacy.awayScore)) { const score = matchScore(match); if (legacy.homeScore !== score.home || legacy.awayScore !== score.away) add(issues, 'warning', match, 'Stored score differs from the event-derived score.') }
  }
  const report = { issues, errors: issues.filter(issue => issue.severity === 'error').length, warnings: issues.filter(issue => issue.severity === 'warning').length, info: issues.filter(issue => issue.severity === 'info').length }
  return report
}
