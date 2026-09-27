import type { Appearance, Match, MatchEvent, Position } from '../types'
import { matchPositionAtEvent, matchPositionSegments, scoringTeamId } from './timeline'

export type ManualOpponentSot =
  | { kind: 'legacy' }
  | { kind: 'manual'; halftime: number; fulltime: number }
  | { kind: 'invalid'; message: string }

const count = (value: unknown) => Number.isInteger(value) && Number(value) > 0 ? Number(value) : 0
const trackedTeam = (match: Match) => match.teamId ?? match.homeTeamId
const overlap = (start: number, end: number, rangeStart: number, rangeEnd: number) => Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart))

function concededGoals(match: Match, teamId: string) {
  return match.events.filter((event): event is Extract<MatchEvent, { type: 'goal' }> => event.type === 'goal' && scoringTeamId(match, event) !== teamId)
}

/** The sole legacy proxy. A save counts only while its author was a goalkeeper. */
export function legacyOpponentSot(match: Match, teamId: string): number {
  return teamGoalkeeperSaves(match, teamId) + concededGoals(match, teamId).length
}

/** Actual goalkeeper saves remain independent from manual Opponent SOT. */
export function teamGoalkeeperSaves(match: Match, teamId: string): number {
  return validTeamSaveEvents(match, teamId).reduce((total, event) => total + count(event.count ?? 1), 0)
}

function validTeamSaveEvents(match: Match, teamId: string): Extract<MatchEvent, { type: 'save' }>[] {
  return match.events.flatMap((event): Extract<MatchEvent, { type: 'save' }>[] => {
    if (event.type !== 'save' || event.teamId !== teamId || !count(event.count ?? 1)) return []
    const keeper = match.appearances.find(appearance => appearance.playerId === event.playerId && appearance.teamId === teamId)
    if (!keeper) return []
    const isGoalkeeper = event.minute === undefined
      ? matchPositionSegments(match, keeper).some(segment => segment.position === 'GK')
      : matchPositionAtEvent(match, keeper, event) === 'GK'
    return isGoalkeeper ? [event] : []
  })
}

/** A manual pair belongs only to the team for which this match was recorded. */
export function validateManualOpponentSot(match: Match, teamId = trackedTeam(match)): ManualOpponentSot {
  if (teamId !== trackedTeam(match)) return { kind: 'legacy' }
  const halftime = match.halftimeOpponentSot
  const fulltime = match.fulltimeOpponentSot
  if (halftime === undefined || fulltime === undefined) return { kind: 'legacy' }
  if (!Number.isInteger(halftime) || halftime < 0 || !Number.isInteger(fulltime) || fulltime < 0) return { kind: 'invalid', message: 'Opponent SOT must be non-negative whole numbers.' }
  if (fulltime < halftime) return { kind: 'invalid', message: 'Full-time Opponent SOT cannot be lower than half-time Opponent SOT.' }
  const goals = concededGoals(match, teamId)
  const firstHalf = goals.filter(event => event.minute <= 45).length
  const secondHalf = goals.length - firstHalf
  if (halftime < firstHalf) return { kind: 'invalid', message: 'Half-time Opponent SOT cannot be lower than first-half goals conceded.' }
  if (fulltime < goals.length) return { kind: 'invalid', message: 'Full-time Opponent SOT cannot be lower than goals conceded.' }
  if (fulltime - halftime < secondHalf) return { kind: 'invalid', message: 'Second-half Opponent SOT cannot be lower than second-half goals conceded.' }
  return { kind: 'manual', halftime, fulltime }
}

export function opponentSot(match: Match, teamId: string): number {
  const manual = validateManualOpponentSot(match, teamId)
  return manual.kind === 'manual' ? manual.fulltime : legacyOpponentSot(match, teamId)
}

export function firstHalfOpponentSot(match: Match, teamId: string): number {
  const manual = validateManualOpponentSot(match, teamId)
  return manual.kind === 'manual' ? manual.halftime : legacyOpponentSot(match, teamId)
}

export function secondHalfOpponentSot(match: Match, teamId: string): number {
  const manual = validateManualOpponentSot(match, teamId)
  return manual.kind === 'manual' ? manual.fulltime - manual.halftime : legacyOpponentSot(match, teamId)
}

/** Manual exposure is proportional to regulation overlap. Legacy callers use
 * the position-aware helper below to preserve historic event attribution. */
export function opponentSotExposure(match: Match, teamId: string, start: number, end: number): number {
  const manual = validateManualOpponentSot(match, teamId)
  const clippedStart = Math.max(0, Math.min(90, start)); const clippedEnd = Math.max(0, Math.min(90, end))
  if (clippedEnd <= clippedStart) return 0
  if (manual.kind !== 'manual') return legacyOpponentSot(match, teamId) * (clippedEnd - clippedStart) / 90
  return manual.halftime * overlap(clippedStart, clippedEnd, 0, 45) / 45 + (manual.fulltime - manual.halftime) * overlap(clippedStart, clippedEnd, 45, 90) / 45
}

/** Legacy exposure preserves the old timed-save/goal position attribution;
 * manual exposure is always the canonical proportional half allocation. */
export function opponentSotExposureForPositionSegment(match: Match, appearance: Appearance, position: Position, start: number, end: number): number {
  const manual = validateManualOpponentSot(match, appearance.teamId)
  if (manual.kind === 'manual') return opponentSotExposure(match, appearance.teamId, start, end)
  const saves = validTeamSaveEvents(match, appearance.teamId)
  const timedSaves = saves.filter(event => event.minute !== undefined && event.minute >= start && event.minute <= end && matchPositionAtEvent(match, appearance, event) === position).reduce((total, event) => total + count(event.count ?? 1), 0)
  const undatedSaves = saves.filter(event => event.minute === undefined).reduce((total, event) => total + count(event.count ?? 1), 0)
  const goals = concededGoals(match, appearance.teamId).filter(event => event.minute >= start && event.minute <= end && matchPositionAtEvent(match, appearance, event) === position).length
  return timedSaves + undatedSaves * overlap(start, end, 0, 90) / 90 + goals
}
