import type { Best11Slot, Match, Player, Position } from '../types'
import { awardCandidatesForScope } from './awards'
import { validateKickoffLineup } from './kickoffLineup'
import { newestMatches } from './matchChronology'
import { isRecordedForTeam, recordedTeamId } from './matchPerspective'
import { scopedTeamHistoryGroupByPlayer, teamHistoryPositionGroup, type TeamHistoryPositionGroup } from './positionScope'
import { tacticalSlotById } from './tacticalSlots'

export type TeamHistoryFormation = { label: string; defenders: number; midfielders: number; forwards: number }
export type TeamHistoryFormationUsage = TeamHistoryFormation & { matches: number }

/** Numeric saved kickoff lines are merged before mode selection, never after it. */
export function normalizeTeamHistoryFormation(value: unknown): TeamHistoryFormation | null {
  if (typeof value !== 'string' || !/^\d+(?:-\d+){2,}$/.test(value.trim())) return null
  const counts = value.trim().split('-').map(Number)
  if (counts.some(count => !Number.isSafeInteger(count) || count < 0) || counts.reduce((total, count) => total + count, 0) !== 10) return null
  const defenders = counts[0], forwards = counts[counts.length - 1]
  const midfielders = counts.slice(1, -1).reduce((total, count) => total + count, 0)
  return { label: `${defenders}-${midfielders}-${forwards}`, defenders, midfielders, forwards }
}

function savedKickoffFormation(match: Match): TeamHistoryFormation | null {
  const numeric = normalizeTeamHistoryFormation(match.formation)
  if (numeric) return numeric
  // Only an explicit complete kickoff snapshot can recover absent/invalid metadata.
  // Legacy reconstruction can guess slot assignments, so it is deliberately excluded.
  const snapshot = match.kickoffLineup
  if (!snapshot?.length || !validateKickoffLineup(snapshot).valid) return null
  const counts = { GK: 0, DEF: 0, MID: 0, FW: 0 }
  for (const slot of snapshot.filter(slot => slot.playerId)) {
    const group = teamHistoryPositionGroup(slot.ratingPosition ?? slot.matchPosition)
    if (!group || group !== teamHistoryPositionGroup(tacticalSlotById[slot.id].ratingPosition)) return null
    counts[group]++
  }
  if (counts.GK !== 1) return null
  return normalizeTeamHistoryFormation(`${counts.DEF}-${counts.MID}-${counts.FW}`)
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

/** Team-only display projection. Shared cumulative scoring and eligibility remain official;
 * only the formation quotas and grouping differ from the official AWARD_433 selector. */
export function selectTeamHistoryBestXI(players: Player[], games: Match[], teamId: string) {
  const teamGames = games.every(match => isRecordedForTeam(match, teamId)) ? games : games.filter(match => isRecordedForTeam(match, teamId))
  const teamMatches = teamGames.length, minimumAppearances = Math.ceil(teamMatches * .4)
  const formation = mostUsedTeamHistoryFormation(teamGames, teamId)
  const statsByPlayer: Record<string, { goals: number; assists: number; avgRating?: number }> = {}
  if (!formation) return { bestXI: [] as Best11Slot[], statsByPlayer, bestPlayerId: undefined, teamMatches, minimumAppearances, formation }
  const candidates = awardCandidatesForScope(players, teamGames).filter(candidate => candidate.teamId === teamId)
  const groups = scopedTeamHistoryGroupByPlayer(players, teamGames, { teams: [teamId] })
  const used = new Set<string>()
  const quotas: { group: TeamHistoryPositionGroup; position: Position; count: number }[] = [
    { group: 'GK', position: 'GK', count: 1 },
    { group: 'DEF', position: 'CB', count: formation.defenders },
    { group: 'MID', position: 'CM', count: formation.midfielders },
    { group: 'FW', position: 'ST', count: formation.forwards },
  ]
  const bestXI: Best11Slot[] = quotas.flatMap(({ group, position, count }) => Array.from({ length: count }, (_, index) => {
    const base = { slot: `${group}-${index + 1}`, position, displayPosition: group }
    const candidate = candidates.find(candidate => !used.has(candidate.playerId) && groups.get(candidate.playerId) === group)
    if (!candidate) return { ...base, playerId: null, avgRating: 0, matches: 0 }
    used.add(candidate.playerId)
    statsByPlayer[candidate.playerId] = { goals: candidate.goals, assists: candidate.assists, avgRating: candidate.average }
    return { ...base, playerId: candidate.playerId, teamId, avgRating: candidate.average, matches: candidate.appearances }
  }))
  return { bestXI, statsByPlayer, bestPlayerId: candidates[0]?.playerId, teamMatches, minimumAppearances, formation }
}
