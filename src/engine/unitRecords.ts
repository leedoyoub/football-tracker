import type { Appearance, Match, Player } from '../types'
import { oldestMatches } from './matchChronology'
import { opponentSotExposure } from './opponentSot'
import { playerGoalEvents } from './playerMatchFacts'
import { positionFamily, scopedPositionFamilyByPlayer, type PositionFamily } from './positionScope'
import { teamPerspectiveScore } from './matchPerspective'
import { creditedPositionSegments, isOnPitchAtEvent, matchPositionAtEvent, scoringTeamId } from './timeline'

export type UnitPosition = 'attack' | 'midfield' | 'defence' | 'cb'
export type UnitRecord = {
  key: string; teamId: string; playerIds: string[]; position: UnitPosition; size: number
  starts: number; minutes: number; wins: number; draws: number
  memberGoals: number; teamGF: number; teamGA: number
  intervalGA: number; intervalSOT: number
}

const groupOf = (family?: PositionFamily): Exclude<UnitPosition, 'cb'> | undefined => {
  if (family === 'ST' || family === 'SS' || family === 'LW' || family === 'RW') return 'attack'
  if (family === 'CAM' || family === 'LM' || family === 'RM' || family === 'CM' || family === 'CDM') return 'midfield'
  if (family === 'LB' || family === 'RB' || family === 'CB') return 'defence'
}

function combinations<T>(items: T[], size: number): T[][] {
  if (!size) return [[]]
  const result: T[][] = []
  for (let index = 0; index <= items.length - size; index++) for (const rest of combinations(items.slice(index + 1), size - 1)) result.push([items[index], ...rest])
  return result
}

function commonIntervals(segments: ReturnType<typeof creditedPositionSegments>[]) {
  const bounds = [...new Set(segments.flatMap(rows => rows.flatMap(row => [row.enter, row.exit])))].sort((a, b) => a - b)
  const intervals: { start: number; end: number }[] = []
  for (let index = 0; index < bounds.length - 1; index++) {
    const start = bounds[index], end = bounds[index + 1], midpoint = (start + end) / 2
    if (segments.every(rows => rows.some(row => row.enter <= midpoint && midpoint < row.exit))) intervals.push({ start, end })
  }
  return intervals
}

/** One scoped pass builds all 2/3/4-player unit facts from actual same-team appearances. */
export function buildUnitRecords(players: Player[], matches: Match[], teamIds: string[], requested?: ReadonlySet<string>): UnitRecord[] {
  if (requested?.size === 0) return []
  const families = scopedPositionFamilyByPlayer(players, matches, { teams: teamIds })
  const known = new Set(players.map(player => player.id))
  const totals = new Map<string, UnitRecord>()
  for (const match of oldestMatches(matches)) {
    const teamAppearances = new Map<string, Appearance[]>()
    for (const appearance of match.appearances) {
      if (!known.has(appearance.playerId) || (teamIds.length && !teamIds.includes(appearance.teamId))) continue
      const rows = teamAppearances.get(appearance.teamId) ?? []
      rows.push(appearance); teamAppearances.set(appearance.teamId, rows)
    }
    for (const [teamId, appearances] of teamAppearances) {
      const segments = new Map(appearances.map(appearance => [appearance.playerId, creditedPositionSegments(match, appearance)]))
      const candidate = (position: UnitPosition) => appearances.filter(appearance => segments.get(appearance.playerId)?.length && (position === 'cb' ? segments.get(appearance.playerId)!.some(segment => positionFamily(segment.position) === 'CB') : groupOf(families.get(appearance.playerId)) === position)).sort((a, b) => a.playerId.localeCompare(b.playerId))
      for (const position of ['attack', 'midfield', 'defence', 'cb'] as const) {
        if (requested && ![2, 3, 4].some(size => requested.has(`${position}:${size}`))) continue
        const eligible = candidate(position)
        for (const size of position === 'cb' ? [2] : [2, 3, 4]) {
          if (requested && !requested.has(`${position}:${size}`)) continue
          for (const members of combinations(eligible, size)) {
            const playerIds = members.map(member => member.playerId)
            const intervals = commonIntervals(members.map(member => position === 'cb' ? segments.get(member.playerId)!.filter(segment => positionFamily(segment.position) === 'CB') : segments.get(member.playerId)!))
            const minutes = intervals.reduce((total, interval) => total + interval.end - interval.start, 0)
            if (!minutes) continue
            const key = `${position}:${teamId}:${playerIds.join(':')}`
            const row = totals.get(key) ?? { key, teamId, playerIds, position, size, starts: 0, minutes: 0, wins: 0, draws: 0, memberGoals: 0, teamGF: 0, teamGA: 0, intervalGA: 0, intervalSOT: 0 }
            row.minutes += minutes
            row.intervalSOT += intervals.reduce((total, interval) => total + opponentSotExposure(match, teamId, interval.start, interval.end), 0)
            row.intervalGA += match.events.filter(event => event.type === 'goal' && event.minute <= 90 && scoringTeamId(match, event) !== teamId && members.every(member => isOnPitchAtEvent(match, member, event) && (position !== 'cb' || positionFamily(matchPositionAtEvent(match, member, event)) === 'CB'))).length
            if (members.every(member => member.role === 'starter' && segments.get(member.playerId)!.some(segment => segment.enter === 0 && (position !== 'cb' || positionFamily(segment.position) === 'CB')))) {
              row.starts++
              const perspective = teamPerspectiveScore(match, teamId)
              const ours = perspective?.goalsFor ?? 0
              const against = perspective?.goalsAgainst ?? 0
              row.wins += Number(ours > against); row.draws += Number(ours === against)
              row.teamGF += ours; row.teamGA += against
              row.memberGoals += members.reduce((total, member) => total + playerGoalEvents(match, member).length, 0)
            }
            totals.set(key, row)
          }
        }
      }
    }
  }
  return [...totals.values()].sort((a, b) => a.key.localeCompare(b.key))
}
