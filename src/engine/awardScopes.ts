import type { ChampionsStage, CupStage, Match } from '../types'
import { CHAMPIONS_ROUNDS, CUP_STAGES, competitionMatches } from './competition'
import { matchCompetitionStage } from './competitionContext'
import { monthlyBlockRange } from './seasonAnalytics'

/** Available presentation periods are derived from recorded canonical matches,
 * never from bracket progress or a persisted UI selection. */
export function startedMonthlyAwardBlocks(matches: Match[], season: string): number[] {
  const leagueMatches = competitionMatches(matches, season, 'league')
  return Array.from({ length: 10 }, (_, index) => index + 1).filter(blockId => {
    const range = monthlyBlockRange(blockId)!
    return leagueMatches.some(match => match.matchDay >= range.startMatchDay && match.matchDay <= range.endMatchDay)
  })
}

export function startedCupAwardStages(matches: Match[], season: string): CupStage[] {
  const cupMatches = competitionMatches(matches, season, 'cup')
  return [...CUP_STAGES, 'final'].filter(stage => {
    const stages = stage === 'final' ? ['final', 'finalReplay'] : [stage]
    return cupMatches.some(match => stages.includes(matchCompetitionStage(match)))
  }) as CupStage[]
}

export function startedChampionsAwardRounds(matches: Match[], season: string): Exclude<ChampionsStage, 'finalReplay'>[] {
  const championsMatches = competitionMatches(matches, season, 'champions')
  return CHAMPIONS_ROUNDS.filter(stage => {
    const stages = stage === 'final' ? ['final', 'finalReplay'] : [stage]
    return championsMatches.some(match => stages.includes(matchCompetitionStage(match)))
  })
}
