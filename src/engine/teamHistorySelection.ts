import type { Best11Slot, FormationSlot, Match, Player } from '../types'
import { validateKickoffLineup } from './kickoffLineup'
import { newestMatches } from './matchChronology'
import { isRecordedForTeam, recordedTeamId } from './matchPerspective'
import { dominantPositionFamily, positionFamily, positionMinutesByPlayer, type PositionFamily } from './positionScope'
import { tacticalSlotById, tacticalSlotsForFormation } from './tacticalSlots'
import { kickoffFormation } from './formation'
import { buildGlobalRankingData } from './stats'
import { REGULATION_MINUTES } from './timeline'

export type TeamHistoryFormation = { label: string; defenders: number; midfielders: number; forwards: number }
export type TeamHistoryFormationUsage = TeamHistoryFormation & { matches: number }

/** Saved tactical lines remain distinct when selecting the most-used shape. */
export function normalizeTeamHistoryFormation(value: unknown): TeamHistoryFormation | null {
  if (typeof value !== 'string' || !/^\d+(?:-\d+){2,}$/.test(value.trim())) return null
  const counts = value.trim().split('-').map(Number)
  if (counts.some(count => !Number.isSafeInteger(count) || count < 0) || counts.reduce((total, count) => total + count, 0) !== 10) return null
  const defenders = counts[0], forwards = counts[counts.length - 1]
  const midfielders = counts.slice(1, -1).reduce((total, count) => total + count, 0)
  return { label: counts.join('-'), defenders, midfielders, forwards }
}

function savedKickoffSnapshot(match: Match): FormationSlot[] | undefined {
  // Only an explicit complete kickoff snapshot can recover absent/invalid metadata.
  // Legacy reconstruction can guess slot assignments, so it is deliberately excluded.
  const snapshot = match.kickoffLineup
  if (!snapshot?.length || !validateKickoffLineup(snapshot).valid) return undefined
  let goalkeepers = 0
  for (const slot of snapshot.filter(slot => slot.playerId)) {
    const family = positionFamily(slot.ratingPosition ?? slot.matchPosition)
    if (!family || family !== positionFamily(tacticalSlotById[slot.id].ratingPosition)) return undefined
    if (family === 'GK') goalkeepers++
  }
  return goalkeepers === 1 ? snapshot.filter(slot => slot.playerId) : undefined
}

function savedKickoffFormation(match: Match): TeamHistoryFormation | null {
  const numeric = normalizeTeamHistoryFormation(match.formation)
  if (numeric) return numeric
  const snapshot = savedKickoffSnapshot(match)
  return snapshot ? normalizeTeamHistoryFormation(kickoffFormation(snapshot)) : null
}

export function mostUsedTeamHistoryFormation(games: Match[], teamId: string): TeamHistoryFormationUsage | null {
  const usages = new Map<string, TeamHistoryFormationUsage & { latest: number }>()
  for (const [latest, match] of newestMatches(games).entries()) {
    // match.formation and kickoffLineup describe the recorded roster, not its opponent.
    if (recordedTeamId(match) !== teamId) continue
    const formation = savedKickoffFormation(match)
    if (!formation) continue
    const usage = usages.get(formation.label)
    if (usage) usage.matches++
    else usages.set(formation.label, { ...formation, matches: 1, latest })
  }
  const winner = [...usages.values()].sort((left, right) => right.matches - left.matches || left.latest - right.latest || left.label.localeCompare(right.label))[0]
  return winner ? { label: winner.label, defenders: winner.defenders, midfielders: winner.midfielders, forwards: winner.forwards, matches: winner.matches } : null
}

function slotsForSavedFormation(games: Match[], teamId: string, label: string): Best11Slot[] {
  for (const match of newestMatches(games)) {
    if (recordedTeamId(match) !== teamId || savedKickoffFormation(match)?.label !== label) continue
    const snapshot = savedKickoffSnapshot(match)
    if (!snapshot || kickoffFormation(snapshot) !== label) continue
    return snapshot.map(slot => {
      const definition = tacticalSlotById[slot.id]
      return { slot: slot.id, position: slot.ratingPosition ?? slot.matchPosition, matchPosition: slot.ratingPosition ?? slot.matchPosition, displayPosition: slot.displayPosition ?? definition.displayPosition, x: slot.x ?? definition.x, y: slot.y ?? definition.y, playerId: null, avgRating: 0, matches: 0 }
    })
  }
  // A known saved name has canonical tactical slots. Unknown numeric shapes
  // require a real snapshot; broad row counts cannot prove their exact roles.
  return (tacticalSlotsForFormation(label) ?? []).map(id => {
    const definition = tacticalSlotById[id]
    return { slot: id, position: definition.ratingPosition, matchPosition: definition.ratingPosition, displayPosition: definition.displayPosition, x: definition.x, y: definition.y, playerId: null, avgRating: 0, matches: 0 }
  })
}

/** Team History has its own minutes/role policy and never uses official bonuses. */
export function selectTeamHistoryBestXI(players: Player[], games: Match[], teamId: string) {
  const teamGames = games.every(match => isRecordedForTeam(match, teamId)) ? games : games.filter(match => isRecordedForTeam(match, teamId))
  const teamMatches = teamGames.length
  const availableTeamMinutes = teamMatches * REGULATION_MINUTES
  const minimumMinutes = availableTeamMinutes * .3
  // Retain the former metadata property for older derived-model consumers.
  // Eligibility is determined exclusively by minimumMinutes.
  const minimumAppearances = Math.ceil(teamMatches * .4)
  const formation = mostUsedTeamHistoryFormation(teamGames, teamId)
  const statsByPlayer: Record<string, { goals: number; assists: number; avgRating?: number }> = {}
  const empty = { bestXI: [] as Best11Slot[], statsByPlayer, bestPlayerId: undefined, teamMatches, minimumAppearances, availableTeamMinutes, minimumMinutes, formation }
  if (!formation) return empty
  const slots = slotsForSavedFormation(teamGames, teamId, formation.label)
  if (!slots.length) return empty
  const positionMinutes = positionMinutesByPlayer(players, teamGames, { teams: [teamId] })
  const candidates = buildGlobalRankingData(players, teamGames, { seasons: [], teams: [teamId], positions: [] }, 'rating').flatMap(row => {
    const minutesByRole = new Map<PositionFamily, number>()
    for (const [position, minutes] of positionMinutes.get(row.playerId) ?? []) {
      const role = positionFamily(position)
      if (role && minutes > 0) minutesByRole.set(role, (minutesByRole.get(role) ?? 0) + minutes)
    }
    const minutes = [...minutesByRole.values()].reduce((sum, value) => sum + value, 0)
    const ratings = row.ratings.filter(rating => rating.minutes > 0)
    const mainRole = dominantPositionFamily(minutesByRole)
    if (!mainRole || minutes <= 0 || minutes < minimumMinutes || !ratings.length) return []
    const average = ratings.reduce((sum, rating) => sum + rating.raw, 0) / ratings.length
    const secondaryRoles = new Set([...minutesByRole].filter(([role, value]) => role !== mainRole && value >= minutes * .2).map(([role]) => role))
    return [{ playerId: row.playerId, average, appearances: ratings.length, minutes, goals: row.goals, assists: row.assists, mainRole, secondaryRoles }]
  }).sort((left, right) => right.average - left.average || right.minutes - left.minutes || right.appearances - left.appearances || left.playerId.localeCompare(right.playerId))
  const used = new Set<string>()
  // Fill every available main-role place before any secondary-role placement.
  // Both passes retain score order and never move a player already selected.
  for (const secondary of [false, true]) for (const candidate of candidates) {
    if (used.has(candidate.playerId)) continue
    const slot = slots.find(slot => {
      const role = positionFamily(slot.position)
      return !slot.playerId && role && (secondary ? candidate.secondaryRoles.has(role) : candidate.mainRole === role)
    })
    if (!slot) continue
    used.add(candidate.playerId)
    Object.assign(slot, { playerId: candidate.playerId, teamId, avgRating: candidate.average, matches: candidate.appearances })
    statsByPlayer[candidate.playerId] = { goals: candidate.goals, assists: candidate.assists, avgRating: candidate.average }
  }
  return { ...empty, bestXI: slots, bestPlayerId: candidates.find(candidate => used.has(candidate.playerId))?.playerId }
}
