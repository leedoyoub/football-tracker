import type { AwardCandidate } from './awardRules'
import { rankAwardCandidates } from './awardRules'
import type { CompetitionType, Match, Player, PositionFilterKey } from '../types'
import type { CompetitionSeasonStatus } from './competition'
import { matchCompetitionType } from './competitionContext'
import { positionFilterFamilies, scopedPositionFamilyByPlayer, type PositionFamily } from './positionScope'
import { isRecordedForTeam } from './matchPerspective'

/** A race is a player leaderboard; official award candidates retain team stints. */
export function awardRaceCandidates(candidates: AwardCandidate[]): AwardCandidate[] {
  const seen = new Set<string>()
  return rankAwardCandidates(candidates, 'cumulative').filter(candidate => {
    if (seen.has(candidate.playerId)) return false
    seen.add(candidate.playerId)
    return true
  })
}

export type AwardRacePresentationRow = { candidate: AwardCandidate; rank: number; position: PositionFamily | undefined }

/** Official positions are fixed before the two presentation-only filters run. */
export function awardRacePresentationRows(candidates: AwardCandidate[], players: Player[], matches: Match[], season: string, competition: CompetitionType | 'all', positionFilter: PositionFilterKey = 'all', teamId: string | null = null): AwardRacePresentationRow[] {
  const scoped = matches.filter(match => match.season === season && (competition === 'all' || matchCompetitionType(match) === competition))
  const familiesByTeam = new Map<string, Map<string, PositionFamily>>()
  const familyFor = (candidate: AwardCandidate) => {
    let families = familiesByTeam.get(candidate.teamId)
    if (!families) {
      families = scopedPositionFamilyByPlayer(players, scoped, { teams: [candidate.teamId] })
      familiesByTeam.set(candidate.teamId, families)
    }
    return families.get(candidate.playerId)
  }
  const allowed = new Set(positionFilterFamilies(positionFilter))
  return awardRaceCandidates(candidates).map((candidate, index) => ({ candidate, rank: index + 1, position: familyFor(candidate) }))
    .filter(row => (!teamId || row.candidate.teamId === teamId) && (!allowed.size || row.position && allowed.has(row.position)))
}

/** Abbreviate canonical team progress for Award Race rows; bonuses stay internal. */
export function awardTeamPerformanceLabel(status: Pick<CompetitionSeasonStatus, 'league' | 'cup' | 'champions'>, teamId: string, scope: CompetitionType | 'all'): string {
  const league = () => {
    if (!status.league.matches.some(match => isRecordedForTeam(match, teamId))) return ''
    const rank = status.league.standings.find(row => row.teamId === teamId)?.rank
    return rank ? `L${rank}` : ''
  }
  const cup = () => {
    if (status.cup.championId === teamId) return 'W'
    if (status.cup.runnerUpId === teamId) return 'RU'
    const eliminated = status.cup.eliminatedAtByTeam[teamId]
    if (eliminated) return `S${eliminated}`
    if (!status.cup.activeTeamIds.includes(teamId)) return ''
    const stage = status.cup.stage
    return stage === 'final' || stage === 'finalReplay' ? 'F' : stage ? `S${stage.replace('stage', '')}` : ''
  }
  const champions = () => {
    if (status.champions.championId === teamId) return 'W'
    if (status.champions.runnerUpId === teamId) return 'RU'
    const stages = ['semiFinal', 'quarterFinal', 'roundOf16'] as const
    const eliminated = stages.find(stage => status.champions.rounds[stage].some(pair => pair.teamIds.includes(teamId) && pair.winnerId && pair.winnerId !== teamId))
    const reached = eliminated ?? (['final', ...stages] as const).find(stage => status.champions.rounds[stage].some(pair => pair.teamIds.includes(teamId)))
    return reached === 'final' ? 'F' : reached === 'semiFinal' ? 'SF' : reached === 'quarterFinal' ? 'QF' : reached === 'roundOf16' ? 'R16' : ''
  }
  if (scope === 'league') return league()
  if (scope === 'cup') return cup()
  if (scope === 'champions') return champions()
  const championsProgress = champions()
  const cupProgress = cup()
  return [league(), championsProgress && `C ${championsProgress}`, cupProgress && `Cup ${cupProgress}`].filter(Boolean).join(' · ')
}
