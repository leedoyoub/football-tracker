import type { Appearance, Match } from '../types'
import { newestMatches } from './matchChronology'
import { teamPerspectiveScore } from './matchPerspective'
import { opponentSotExposureForTeam } from './opponentSot'
import { actualAppearance, uniquePlayedMatches } from './participation'
import { isPlayerAssistEvent, isPlayerGoalEvent } from './playerMatchFacts'
import { positionFamily } from './positionScope'
import { recordsScopedMatches, type RecordsMatchFilters } from './recordsScope'
import { creditedPositionSegments, isOnPitchAtEvent, matchPositionAtEvent, scoringTeamId } from './timeline'
import { commonIntervals } from './unitRecords'

export type GoalDirection = { assisterId: string; scorerId: string; goals: number }

export function goalCreditsForTeam(match: Match, teamId: string, byPlayer: ReadonlyMap<string, Appearance>) {
  return match.events.flatMap(event => {
    if (event.type !== 'goal' || event.teamId !== teamId || event.ownGoal) return []
    const scorer = byPlayer.get(event.playerId ?? '')
    const assister = byPlayer.get(event.assistPlayerId ?? '')
    return [{
      event,
      scorerId: scorer && isPlayerGoalEvent(match, scorer, event) ? scorer.playerId : undefined,
      assisterId: assister && isPlayerAssistEvent(match, assister, event) ? assister.playerId : undefined,
    }]
  })
}

export type PartnershipGame = {
  match: Match
  teamId: string
  startedTogether: boolean
  minutesTogether: number
  winningPoints: number
  scores?: ReturnType<typeof teamPerspectiveScore>
  combinedGA: number
  directions: GoalDirection[]
  defensiveMinutes: number
  defensiveGA: number
  defensiveSot: number
}

type PartnershipSummary = {
  playerIds: string[]
  matchesTogether: number
  startsTogether: number
  minutesTogether: number
  combinedGA: number
  ppg: number | null
  directions: GoalDirection[]
}

type PartnershipDetail = PartnershipSummary & {
  games: PartnershipGame[]
  defensiveMatches: number
  defensiveMinutes: number
  defensiveGA90: number | null
  defensiveSot90: number | null
}

export type PartnerRecord = PartnershipSummary & { teamId: string }

function playedByTeam(match: Match, teamIds: string[]) {
  const teams = new Map<string, Map<string, Appearance>>()
  for (const appearance of match.appearances) {
    if (teamIds.length && !teamIds.includes(appearance.teamId)) continue
    const members = teams.get(appearance.teamId) ?? new Map()
    if (!members.has(appearance.playerId) && actualAppearance(match, appearance)) {
      members.set(appearance.playerId, appearance)
      teams.set(appearance.teamId, members)
    }
  }
  return teams
}

function teamMatchFacts(match: Match, teamId: string, members: ReadonlyMap<string, Appearance>) {
  const credits = goalCreditsForTeam(match, teamId, members)
  const positions = new Map<Appearance, ReturnType<typeof creditedPositionSegments>>()
  return {
    credits,
    scores: teamPerspectiveScore(match, teamId),
    segments(appearance: Appearance) {
      const saved = positions.get(appearance) ?? creditedPositionSegments(match, appearance)
      positions.set(appearance, saved)
      return saved
    },
  }
}

function jointMatch(match: Match, teamId: string, members: Appearance[], facts: ReturnType<typeof teamMatchFacts>, defence?: 'positions' | 'cb' | 'unit'): PartnershipGame {
  const segments = members.map(facts.segments)
  const overlapMinutes = (intervals: ReturnType<typeof commonIntervals>) => intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0)
  const shared = commonIntervals(segments)
  const minutesTogether = overlapMinutes(shared)
  const startedTogether = members.every((member, index) => member.role === 'starter' && segments[index].some(segment => segment.enter === 0))
  const names = new Set(members.map(member => member.playerId))
  const directions = new Map<string, GoalDirection>()
  let combinedGA = 0
  for (const { event, scorerId, assisterId } of facts.credits) {
    const scored = scorerId !== undefined && names.has(scorerId)
    const assisted = assisterId !== undefined && names.has(assisterId)
    if (!scored && !assisted) continue
    if (scored && assisted && assisterId !== scorerId) {
      const key = JSON.stringify([assisterId, scorerId])
      const direction = directions.get(key) ?? { assisterId, scorerId, goals: 0 }
      direction.goals++
      directions.set(key, direction)
    }
    if (minutesTogether && members.every(member => isOnPitchAtEvent(match, member, event))) combinedGA += Number(scored) + Number(assisted)
  }

  const atDefence = (position?: string) => {
    if (defence === 'unit') return position !== undefined
    const family = positionFamily(position)
    return family === 'CB' || (defence !== 'cb' && (family === 'LB' || family === 'RB'))
  }
  const defensiveIntervals = defence === 'unit' ? shared : defence ? commonIntervals(segments.map(rows => rows.filter(row => atDefence(row.position)))) : []
  const defensiveMinutes = overlapMinutes(defensiveIntervals)
  let defensiveGA = 0
  let defensiveSot = 0
  if (defensiveMinutes) {
    const exposure = opponentSotExposureForTeam(match, teamId)
    defensiveSot = defensiveIntervals.reduce((sum, interval) => sum + exposure(interval.start, interval.end), 0)
    defensiveGA = match.events.filter(event => event.type === 'goal' && event.minute <= 90 && scoringTeamId(match, event) !== teamId &&
      members.every(member => atDefence(matchPositionAtEvent(match, member, event)))).length
  }
  const { scores } = facts
  const winningPoints = scores?.outcome === 'W' ? 3 : Number(scores?.outcome === 'D')
  return { match, teamId, scores, startedTogether, minutesTogether, winningPoints, combinedGA, directions: [...directions.values()], defensiveMinutes, defensiveGA, defensiveSot }
}

function summarize(playerIds: string[], games: PartnershipGame[]): PartnershipSummary {
  let startsTogether = 0
  let minutesTogether = 0
  let combinedGA = 0
  let points = 0
  let results = 0
  const directions = new Map<string, GoalDirection>()
  for (const game of games) {
    startsTogether += Number(game.startedTogether)
    minutesTogether += game.minutesTogether
    combinedGA += game.combinedGA
    if (game.startedTogether && game.scores) {
      points += game.winningPoints
      results++
    }
    for (const direction of game.directions) {
      const key = JSON.stringify([direction.assisterId, direction.scorerId])
      const goals = (directions.get(key)?.goals ?? 0) + direction.goals
      directions.set(key, { ...direction, goals })
    }
  }
  return { playerIds, matchesTogether: games.length, startsTogether, minutesTogether, combinedGA, ppg: results ? points / results : null, directions: [...directions.values()].sort((a, b) => a.assisterId.localeCompare(b.assisterId) || a.scorerId.localeCompare(b.scorerId)) }
}

export function findPartners(players: readonly { id: string }[], matches: Match[], scope: RecordsMatchFilters, playerId: string): PartnerRecord[] {
  if (!playerId) return []
  const known = new Set(players.map(player => player.id))
  const partners = new Map<string, { teamId: string; partnerId: string; games: PartnershipGame[] }>()
  const scoped = recordsScopedMatches(matches, scope, 'combination')
  for (const match of uniquePlayedMatches(scoped)) {
    if (!match.appearances.some(appearance => appearance.playerId === playerId)) continue
    for (const [teamId, teammates] of playedByTeam(match, scope.teamIds)) {
      const player = teammates.get(playerId)
      if (!player || teammates.size < 2) continue
      const facts = teamMatchFacts(match, teamId, teammates)
      for (const [partnerId, appearance] of teammates) {
        if (partnerId === playerId || !known.has(partnerId)) continue
        const key = JSON.stringify([teamId, partnerId])
        const record = partners.get(key) ?? { teamId, partnerId, games: [] }
        record.games.push(jointMatch(match, teamId, [player, appearance], facts))
        partners.set(key, record)
      }
    }
  }
  return [...partners.values()].map(({ teamId, partnerId, games }) => ({ teamId, ...summarize([playerId, partnerId], games) })).sort((a, b) =>
    b.matchesTogether - a.matchesTogether || b.minutesTogether - a.minutesTogether || a.playerIds[1].localeCompare(b.playerIds[1]) || a.teamId.localeCompare(b.teamId))
}

export function partnershipDetail(matches: Match[], scope: RecordsMatchFilters, ids: string[], recordId?: string): PartnershipDetail {
  const playerIds = [...new Set(ids)]
  const games: PartnershipGame[] = []
  if (playerIds.length > 1) {
    const scoped = recordsScopedMatches(matches, scope, 'combination')
    const defence = recordId?.startsWith('best-unit:defence:') ? 'unit' : recordId === 'cb-ga' || recordId === 'cb-suppression' ? 'cb' : 'positions'
    for (const match of newestMatches(uniquePlayedMatches(scoped))) {
      if (!playerIds.every(id => match.appearances.some(appearance => appearance.playerId === id))) continue
      for (const [teamId, teammates] of playedByTeam(match, scope.teamIds)) {
        if (!playerIds.every(id => teammates.has(id))) continue
        games.push(jointMatch(match, teamId, playerIds.map(id => teammates.get(id)!), teamMatchFacts(match, teamId, teammates), defence))
      }
    }
  }
  const defensiveMatches = games.filter(game => game.defensiveMinutes > 0).length
  const defensiveMinutes = games.reduce((total, game) => total + game.defensiveMinutes, 0)
  const rate = (key: 'defensiveGA' | 'defensiveSot') => defensiveMinutes ? games.reduce((total, game) => total + game[key], 0) * 90 / defensiveMinutes : null
  return { ...summarize(playerIds, games), games, defensiveMatches, defensiveMinutes, defensiveGA90: rate('defensiveGA'), defensiveSot90: rate('defensiveSot') }
}
