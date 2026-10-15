import type { Appearance, Match, MatchEvent } from '../types'
import { creditedPositionSegments, hasPitchAppearance, isOnPitchAtEvent, matchDisplayPositionSegments, matchPositionAtEvent, matchPositionSegments, scoringTeamId } from './timeline'

type GoalEvent = Extract<MatchEvent, { type: 'goal' }>
type SaveEvent = Extract<MatchEvent, { type: 'save' }>

/** Longest actual display role; equal durations retain first-played order.
 * A missing match role falls back to the saved registration, never a guess. */
export function representativeMatchPosition(match: Match, appearance: Appearance): string {
  const minutes = new Map<string, number>()
  for (const segment of matchDisplayPositionSegments(match, appearance)) minutes.set(segment.position, (minutes.get(segment.position) ?? 0) + segment.exit - segment.enter)
  return [...minutes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? appearance.matchPosition ?? appearance.position
}

const appearanceMatchIndex = new WeakMap<Match[], { matches: Match[]; appearances: Appearance[][]; playerIds: string[][]; byPlayer: Map<string, Match[]> }>()

/** Historical membership is indexed from recorded appearances, including
 * unused substitutes and IDs no longer present in the current roster. */
function appearanceIndex(matches: Match[], inspectPlayerIds: boolean): ReadonlyMap<string, readonly Match[]> {
  let index = appearanceMatchIndex.get(matches)
  if (!index || index.matches.length !== matches.length || matches.some((match, position) => match !== index!.matches[position] || match.appearances !== index!.appearances[position] || inspectPlayerIds && (match.appearances.length !== index!.playerIds[position].length || match.appearances.some((appearance, i) => appearance.playerId !== index!.playerIds[position][i])))) {
    const byPlayer = new Map<string, Match[]>()
    for (const match of matches) for (const id of new Set(match.appearances.map(appearance => appearance.playerId))) {
      const rows = byPlayer.get(id) ?? []
      rows.push(match); byPlayer.set(id, rows)
    }
    index = { matches: matches.slice(), appearances: matches.map(match => match.appearances), playerIds: matches.map(match => match.appearances.map(appearance => appearance.playerId)), byPlayer }; appearanceMatchIndex.set(matches, index)
  }
  return index.byPlayer
}

/** Validate legacy membership edits once for an entire directory query. */
export function playerAppearanceMatchIndex(matches: Match[]): ReadonlyMap<string, readonly Match[]> {
  return appearanceIndex(matches, true)
}

export function matchesWithPlayerAppearance(playerId: string, matches: Match[]): Match[] {
  return appearanceIndex(matches, false).get(playerId)?.slice() ?? []
}

/** These are read-time player facts; raw events and lineup records are never changed. */
export function isPlayerGoalEvent(match: Match, appearance: Appearance, event: MatchEvent): event is GoalEvent {
  return event.type === 'goal' && !event.ownGoal && event.teamId === appearance.teamId && event.playerId === appearance.playerId && isOnPitchAtEvent(match, appearance, event)
}

export function isPlayerAssistEvent(match: Match, appearance: Appearance, event: MatchEvent): event is GoalEvent {
  return event.type === 'goal' && !event.ownGoal && event.teamId === appearance.teamId && event.assistPlayerId === appearance.playerId && isOnPitchAtEvent(match, appearance, event)
}

export function playerGoalEvents(match: Match, appearance: Appearance): GoalEvent[] {
  return match.events.filter(event => isPlayerGoalEvent(match, appearance, event))
}

export function playerAssistEvents(match: Match, appearance: Appearance): GoalEvent[] {
  return match.events.filter(event => isPlayerAssistEvent(match, appearance, event))
}

export function saveEventCount(event: SaveEvent): number {
  if (event.count === undefined) return 1
  return Number.isInteger(event.count) && event.count > 0 ? event.count : 0
}

export function validPlayerSaveEvents(match: Match, appearance: Appearance): SaveEvent[] {
  if (!match.appearances.some(row => row === appearance || row.playerId === appearance.playerId && row.teamId === appearance.teamId)) return []
  return match.events.filter((event): event is SaveEvent => {
    if (event.type !== 'save' || event.playerId !== appearance.playerId || event.teamId !== appearance.teamId || !saveEventCount(event)) return false
    return event.minute === undefined
      ? matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
      : matchPositionAtEvent(match, appearance, event) === 'GK'
  })
}

export function playerSaveCount(match: Match, appearance: Appearance): number {
  return validPlayerSaveEvents(match, appearance).reduce((total, event) => total + saveEventCount(event), 0)
}

export type PlayerGoalkeeperFacts = { minutes: number; appearances: number; saves: number; conceded: number; cleanSheet: boolean; savePercentage: number | null }

export function playerGoalkeeperFacts(match: Match, appearance: Appearance): PlayerGoalkeeperFacts {
  const minutes = creditedPositionSegments(match, appearance).reduce((total, segment) => total + (segment.position === 'GK' ? segment.exit - segment.enter : 0), 0)
  const appeared = hasPitchAppearance(match, appearance) && matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
  const saves = playerSaveCount(match, appearance)
  const conceded = match.events.filter(event => event.type === 'goal' && scoringTeamId(match, event) !== appearance.teamId && matchPositionAtEvent(match, appearance, event) === 'GK').length
  const denominator = saves + conceded
  return { minutes, appearances: Number(appeared), saves, conceded, cleanSheet: appeared && conceded === 0, savePercentage: denominator ? saves / denominator * 100 : null }
}
