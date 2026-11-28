import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { AWARD_POLICY_REVISION } from './awardPolicy'
import { awardPositionFamily, AWARD_433, type AwardPositionFamily } from './awardRules'
import { arrayItemRevision } from './arrayItemRevision'
import { matchCompetitionType } from './competitionContext'
import { MOM_POLICY_REVISION } from './momPolicy'
import { officialAwardSeasons, officialAwardsForSeason, type OfficialAwardEvent } from './officialAwards'
import { buildHistoricalParticipation, buildPlayerOpportunityCounter, meetsMinutesShare, RECORDS_POLICY_REVISION, uniquePlayedMatches } from './participation'
import { careerPerformanceRows } from './playerRecords'
import { positionMinutesByPlayer, scopedAwardFamilyByPlayer } from './positionScope'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { finalizedTeamPlacements, type FinalizedTeamPlacement } from './teamCompetitionResults'

// Bonus constants use integer thousandths so the order of award events cannot
// introduce floating point differences between equivalent career scores.
export const PLAYER_HONOR_POINTS: Readonly<Record<string, number>> = {
  'season-mvp': 400, 'league-mvp': 250, 'champions-mvp': 250, 'cup-mvp': 150,
  'first-half-mvp': 100, 'second-half-mvp': 100,
  'season-scorer': 150, 'season-assists': 150, 'season-gk': 150,
  'league-scorer': 80, 'league-assists': 80, 'league-gk': 80,
  'cup-scorer': 80, 'cup-assists': 80, 'cup-gk': 80,
  'champions-scorer': 80, 'champions-assists': 80, 'champions-gk': 80,
  'season-xi': 100, 'league-xi': 60, 'cup-xi': 60, 'champions-xi': 60,
  'first-half-xi': 30, 'second-half-xi': 30,
}
export const TEAM_PLACEMENT_POINTS: Readonly<Record<CompetitionType, readonly number[]>> = {
  league: [150, 60, 30, 15], champions: [150, 60, 30, 15], cup: [90, 40, 20, 10],
}

export function selectCareerHonors(events: OfficialAwardEvent[]) {
  const seen = new Set<string>()
  const byPlayer = new Map<string, OfficialAwardEvent[]>()
  for (const event of events) {
    if (event.category !== 'individual' || !event.finalized || !Object.prototype.hasOwnProperty.call(PLAYER_HONOR_POINTS, event.kind) || seen.has(event.id)) continue
    seen.add(event.id)
    const honors = byPlayer.get(event.playerId) ?? []
    honors.push(event)
    byPlayer.set(event.playerId, honors)
  }
  return byPlayer
}

export function careerScoreFromHonors(average: number, honors: readonly OfficialAwardEvent[] = [], placements: readonly Pick<FinalizedTeamPlacement, 'competition' | 'place'>[] = []) {
  const individualPoints = honors.reduce((total, honor) => total + (PLAYER_HONOR_POINTS[honor.kind] ?? 0), 0)
  const teamPoints = placements.reduce((total, placement) => total + (TEAM_PLACEMENT_POINTS[placement.competition][placement.place - 1] ?? 0), 0)
  return { individualBonus: individualPoints / 1000, teamBonus: teamPoints / 1000, score: average + (individualPoints + teamPoints) / 1000 }
}

export type CareerScoreRow = {
  playerId: string; family: AwardPositionFamily; position: string; teamId: string; playedTeamIds: string[]
  average: number; minutes: number; availableMinutes: number; appearances: number; mom: number
  ballon: number; championships: number; score: number; individualBonus: number; teamBonus: number
  honors: OfficialAwardEvent[]; placements: FinalizedTeamPlacement[]
}

function compareCareerScore(left: CareerScoreRow, right: CareerScoreRow): number {
  return right.score - left.score || right.ballon - left.ballon || right.average - left.average
    || right.minutes - left.minutes || right.mom - left.mom || left.playerId.localeCompare(right.playerId)
}

/** Hall of Fame selects the same families and formation as official XI. */
export function selectCareerBestXI(candidates: CareerScoreRow[]) {
  const sorted = candidates.slice().sort(compareCareerScore)
  const used = new Set<string>()
  const bestXI = AWARD_433.map(role => {
    const player = sorted.find(row => row.family === role.family && !used.has(row.playerId))
    if (!player) return { slot: role.slot, position: role.position, playerId: null, avgRating: 0, matches: 0 }
    used.add(player.playerId)
    return { slot: role.slot, position: role.position, playerId: player.playerId, avgRating: player.average, matches: player.appearances, teamId: player.teamId }
  })
  return { bestXI, greatest: sorted.find(row => used.has(row.playerId)) }
}

type CareerModel = { rankings: CareerScoreRow[] } & ReturnType<typeof selectCareerBestXI>
const cache = new WeakMap<Match[], { teams: Team[]; players: Player[]; states: CompetitionState[]; revision: string; model: CareerModel }>()
const placementKey = (season: string, competition: CompetitionType, teamId: string) => JSON.stringify([season, competition, teamId])

export function hallOfFameCareer(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[]): CareerModel {
  const revision = [RECORDS_POLICY_REVISION, AWARD_POLICY_REVISION, RATING_ENGINE_REVISION, MOM_POLICY_REVISION, ...[teams, players, matches, states].map(value => arrayItemRevision<unknown>(value))].join(':')
  const cached = cache.get(matches)
  if (cached?.teams === teams && cached.players === players && cached.states === states && cached.revision === revision) return cached.model

  const history = buildHistoricalParticipation(matches)
  const available = buildPlayerOpportunityCounter(history, matches)
  const playerById = new Map(players.map(player => [player.id, player]))
  const unique = uniquePlayedMatches(matches)
  const families = scopedAwardFamilyByPlayer(players, unique, {})
  const positionMinutes = positionMinutesByPlayer(players, unique, {})
  const marks = careerPerformanceRows(players, matches).flatMap(row => {
    const availableMinutes = available(playerById.get(row.playerId)!) * 90
    const family = families.get(row.playerId)
    return family && row.average > 0 && meetsMinutesShare(row.minutes, availableMinutes, 40) ? [{ row, family, availableMinutes }] : []
  })
  const honorsByPlayer = selectCareerHonors(marks.length ? officialAwardSeasons(matches, states).flatMap(season => officialAwardsForSeason(teams, players, matches, states, season)) : [])
  const resultByKey = new Map((marks.length ? finalizedTeamPlacements(teams, players, matches, states) : []).map(row => [placementKey(row.season, row.competition, row.teamId), row]))
  const rankings = marks.map(({ row, family, availableMinutes }): CareerScoreRow => {
    const placementKeys = new Set<string>()
    const teamMinutes = new Map<string, number>()
    for (const { match, teamId, minutes } of row.matches) {
      placementKeys.add(placementKey(match.season, matchCompetitionType(match), teamId))
      teamMinutes.set(teamId, (teamMinutes.get(teamId) ?? 0) + minutes)
    }
    const playedTeamIds = [...teamMinutes.keys()].sort((a, b) => teamMinutes.get(b)! - teamMinutes.get(a)! || a.localeCompare(b))
    const placements = [...placementKeys].flatMap(key => {
      const placement = resultByKey.get(key)
      return placement && placement.place <= 4 ? [placement] : []
    })
    const honors = honorsByPlayer.get(row.playerId) ?? []
    const score = careerScoreFromHonors(row.average, honors, placements)
    const position = [...(positionMinutes.get(row.playerId) ?? [])]
      .filter(([position]) => awardPositionFamily(position) === family)
      .sort(([a, aMinutes], [b, bMinutes]) => bMinutes - aMinutes || a.localeCompare(b))[0]?.[0] ?? family
    return { playerId: row.playerId, family, position, teamId: playedTeamIds[0], playedTeamIds, average: row.average, minutes: row.minutes, availableMinutes,
      appearances: row.appearances, mom: row.mom, ballon: honors.filter(event => event.kind === 'season-mvp').length,
      championships: placements.filter(result => result.place === 1).length, honors, placements, ...score }
  }).sort(compareCareerScore)
  const model = { rankings, ...selectCareerBestXI(rankings) }
  cache.set(matches, { teams, players, states, revision, model })
  return model
}
