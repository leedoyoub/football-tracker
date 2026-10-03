import type { Appearance, Match, MatchEvent } from '../types'
import { creditedPositionSegments, hasPitchAppearance, isOnPitchAtEvent, matchPositionAtEvent, matchPositionSegments, scoringTeamId } from './timeline'

type GoalEvent = Extract<MatchEvent, { type: 'goal' }>
type SaveEvent = Extract<MatchEvent, { type: 'save' }>

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
