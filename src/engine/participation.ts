import type { Match, Player } from '../types'
import { currentTeamIds, TEAM_ROSTER_LIMIT } from '../lib/roster'
import { arrayItemRevision } from './arrayItemRevision'
import { oldestMatches } from './matchChronology'
import { isRecordedForTeam } from './matchPerspective'
import { creditedMinutesPlayed, hasActualAppearance } from './timeline'

export const RECORDS_POLICY_REVISION = 1
export const REGULATION_MATCH_MINUTES = 90
export const minimumAppearances = (matches: number) => Math.ceil(matches * 2 / 5)
export const meetsMinutesShare = (minutes: number, availableMinutes: number, percent: 20 | 40) =>
  availableMinutes > 0 && minutes > 0 && minutes * 100 >= availableMinutes * percent
export const meetsAppearancesShare = (appearances: number, availableMatches: number) =>
  availableMatches > 0 && appearances >= minimumAppearances(availableMatches)

export { hasActualAppearance as actualAppearance }

export function uniquePlayedMatches(matches: Match[]): Match[] {
  const ids = new Set<string>()
  return matches.filter(match => !ids.has(match.id) && Boolean(ids.add(match.id)))
}

function recordedTeams(match: Match): string[] {
  return [...new Set([match.homeTeamId, match.awayTeamId])].filter(teamId => teamId && isRecordedForTeam(match, teamId))
}

export function officialParticipationThresholds(matches: Match[]) {
  const counts = new Map<string, number>()
  let teamMatches = 0
  for (const match of uniquePlayedMatches(matches)) {
    for (const teamId of recordedTeams(match)) {
      const count = (counts.get(teamId) ?? 0) + 1
      counts.set(teamId, count)
      teamMatches = Math.max(teamMatches, count)
    }
  }
  return { teamMatches, appearances: minimumAppearances(teamMatches), minutes: teamMatches * 18 }
}

export function actualParticipation(matches: Match[]) {
  const totals = new Map<string, { appearances: number; minutes: number }>()
  for (const match of uniquePlayedMatches(matches)) {
    const byPlayer = new Map<string, number>()
    for (const appearance of match.appearances) {
      if (!hasActualAppearance(match, appearance)) continue
      const minutes = Math.min(REGULATION_MATCH_MINUTES, creditedMinutesPlayed(match, appearance))
      byPlayer.set(appearance.playerId, Math.max(minutes, byPlayer.get(appearance.playerId) ?? 0))
    }
    for (const [id, minutes] of byPlayer) {
      const total = totals.get(id) ?? { appearances: 0, minutes: 0 }
      total.appearances++
      total.minutes += minutes
      totals.set(id, total)
    }
  }
  return totals
}

type TeamRow = { match: Match; index: number }
type Registration = { season: string; teamId: string; index: number }
type Stint = { season: string; teamId: string; first: number; end: number }
export type HistoricalParticipation = {
  byTeam: Map<string, TeamRow[]>
  registrations: Map<string, Registration[]>
  seasons: Map<string, { first: number; end: number }>
  fullRosters: Map<string, number[]>
  stints: WeakMap<Player, Stint[]>
}
const historyCache = new WeakMap<Match[], { revision: number; value: HistoricalParticipation }>()

export function buildHistoricalParticipation(matches: Match[]): HistoricalParticipation {
  const revision = arrayItemRevision(matches)
  const cached = historyCache.get(matches)
  if (cached?.revision === revision) return cached.value
  const value: HistoricalParticipation = { byTeam: new Map(), registrations: new Map(), seasons: new Map(), fullRosters: new Map(), stints: new WeakMap() }
  oldestMatches(uniquePlayedMatches(matches)).forEach((match, index) => {
    const season = value.seasons.get(match.season) ?? { first: index, end: index + 1 }
    season.end = index + 1
    value.seasons.set(match.season, season)
    const teamIds = new Set(recordedTeams(match))
    for (const teamId of teamIds) {
      const rows = value.byTeam.get(teamId) ?? []
      rows.push({ match, index })
      value.byTeam.set(teamId, rows)
    }
    const teamsByPlayer = new Map<string, string>()
    for (const appearance of match.appearances) {
      if (teamIds.has(appearance.teamId) && !teamsByPlayer.has(appearance.playerId)) teamsByPlayer.set(appearance.playerId, appearance.teamId)
    }
    for (const [id, teamId] of teamsByPlayer) {
      const rows = value.registrations.get(id) ?? []
      rows.push({ season: match.season, teamId, index })
      value.registrations.set(id, rows)
    }
    if (teamsByPlayer.size >= TEAM_ROSTER_LIMIT) {
      const sizes = new Map<string, number>()
      for (const teamId of teamsByPlayer.values()) sizes.set(teamId, (sizes.get(teamId) ?? 0) + 1)
      for (const [teamId, count] of sizes) {
        if (count < TEAM_ROSTER_LIMIT) continue
        const copies = value.fullRosters.get(teamId) ?? []
        copies.push(index)
        value.fullRosters.set(teamId, copies)
      }
    }
  })
  historyCache.set(matches, { revision, value })
  return value
}

/** Saved starters and benches establish registration. Legacy saves have no
 * transfer dates: a new team's first registration closes the prior stint.
 * For the last evidenced season, a former team stops at its last registration. */
function playerStints(history: HistoricalParticipation, player: Player): Stint[] {
  const cached = history.stints.get(player)
  if (cached) return cached
  const rows = history.registrations.get(player.id) ?? []
  const bySeason = new Map<string, Registration[]>()
  const assigned = new Set(currentTeamIds(player))
  for (const row of rows) {
    const registrations = bySeason.get(row.season) ?? []
    registrations.push(row)
    bySeason.set(row.season, registrations)
  }
  const stints: Stint[] = []
  let previous: Registration | undefined
  for (const [season, bounds] of history.seasons) {
    const registrations = bySeason.get(season)
    if (!registrations) {
      if (!previous) continue
      const last = rows[rows.length - 1]
      const next = last.index >= bounds.end ? rows.find(row => row.index >= bounds.end) : undefined
      if (next?.teamId === previous.teamId || !next && assigned.has(previous.teamId)) {
        stints.push({ season, teamId: previous.teamId, first: bounds.first, end: bounds.end })
      }
      continue
    }
    let teamId = registrations[0].teamId
    let first = bounds.first
    const initial = registrations[0]
    if (!previous || previous.teamId !== teamId) {
      const fullRosters = history.fullRosters.get(teamId) ?? []
      // A full recorded roster before the first registration is stronger
      // evidence of non-membership than an absent name in a partial sheet.
      for (let i = fullRosters.length - 1; i >= 0; i--) {
        const index = fullRosters[i]
        if (index >= initial.index) continue
        first = Math.max(first, index + 1)
        break
      }
    }
    for (const row of registrations) {
      if (row.teamId === teamId) continue
      stints.push({ season, teamId, first, end: row.index })
      teamId = row.teamId
      first = row.index
    }
    const last = registrations[registrations.length - 1]
    const ended = last === rows[rows.length - 1] && !assigned.has(teamId)
    stints.push({ season, teamId, first, end: ended ? last.index + 1 : bounds.end })
    previous = last
  }
  history.stints.set(player, stints)
  return stints
}

function lowerBound(rows: readonly TeamRow[], index: number): number {
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (rows[middle].index < index) low = middle + 1
    else high = middle
  }
  return low
}

function scopedTeamRows(history: HistoricalParticipation, selected: readonly Match[]) {
  const selection = new Set(selected)
  return new Map([...history.byTeam].map(([teamId, rows]) => [teamId, rows.filter(row => selection.has(row.match))]))
}

export function buildPlayerOpportunityCounter(history: HistoricalParticipation, selected: readonly Match[]) {
  const scoped = scopedTeamRows(history, selected)
  return (player: Player): number => {
    const games = new Set<string>()
    for (const stint of playerStints(history, player)) {
      const rows = scoped.get(stint.teamId) ?? []
      const start = lowerBound(rows, stint.first)
      const end = lowerBound(rows, stint.end)
      for (let i = start; i < end; i++) if (rows[i].match.season === stint.season) games.add(rows[i].match.id)
    }
    return games.size
  }
}

export function playerAvailableMatches(history: HistoricalParticipation, player: Player, selected: readonly Match[]): number {
  return buildPlayerOpportunityCounter(history, selected)(player)
}

export function buildSharedOpportunityCounter(history: HistoricalParticipation, players: readonly Player[], selected: readonly Match[]) {
  const scoped = scopedTeamRows(history, selected)
  const playerById = new Map(players.map(player => [player.id, player]))
  const counts = new Map<string, number>()
  return (playerIds: readonly string[], teamId: string): number => {
    const key = JSON.stringify([teamId, [...playerIds].sort()])
    const cached = counts.get(key)
    if (cached !== undefined) return cached
    const rows = scoped.get(teamId) ?? []
    const byPlayer = playerIds.map(id => {
      const player = playerById.get(id)
      return player ? playerStints(history, player).filter(stint => stint.teamId === teamId) : []
    })
    const count = playerIds.length ? rows.reduce((total, row) => total + Number(byPlayer.every(stints =>
      stints.some(stint => row.match.season === stint.season && row.index >= stint.first && row.index < stint.end))), 0) : 0
    counts.set(key, count)
    return count
  }
}

export function sharedAvailableMatches(history: HistoricalParticipation, players: readonly Player[], teamId: string, selected: readonly Match[]): number {
  return buildSharedOpportunityCounter(history, players, selected)(players.map(player => player.id), teamId)
}
