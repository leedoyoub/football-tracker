import type { ChampionsStage, CupStage, Match } from '../types'
import { CHAMPIONS_ROUNDS, competitionMatches } from './competition'
import { competitionIdentityForMatch, matchCompetitionStage } from './competitionContext'
import { monthlyBlockRange } from './seasonAnalytics'
import type { AwardScope } from './awards'
import { arrayItemRevision } from './arrayItemRevision'

const scopedMatchesCache = new WeakMap<Match[], Map<string, Match[]>>()

export function matchesForAwardScope(matches: Match[], season: string, scope: AwardScope | 'all'): Match[] {
  let cache = scopedMatchesCache.get(matches)
  if (!cache) { cache = new Map(); scopedMatchesCache.set(matches, cache) }
  const normalizedScope = scope === 'all' ? 'season' : scope
  const key = JSON.stringify([arrayItemRevision(matches), season, normalizedScope])
  const cached = cache.get(key)
  if (cached) return cached
  let result: Match[]
  if (normalizedScope === 'season') result = matches.filter(match => match.season === season)
  else if (normalizedScope !== 'first-half' && normalizedScope !== 'second-half') result = competitionMatches(matches, season, normalizedScope)
  else {
    const first = normalizedScope === 'first-half' ? 1 : 16
    result = competitionMatches(matches, season, 'league').filter(match => {
      const day = competitionIdentityForMatch(match).matchDay
      return day >= first && day < first + 15
    })
  }
  if (cache.size >= 48) cache.delete(cache.keys().next().value!)
  cache.set(key, result)
  return result
}

/** Available presentation periods are derived from recorded canonical matches,
 * never from bracket progress or a persisted UI selection. */
export function startedMonthlyAwardBlocks(matches: Match[], season: string): number[] {
  const leagueMatches = competitionMatches(matches, season, 'league')
  return Array.from({ length: 10 }, (_, index) => index + 1).filter(blockId => {
    const range = monthlyBlockRange(blockId)!
    return leagueMatches.some(match => {
      const day = competitionIdentityForMatch(match).matchDay
      return day >= range.startMatchDay && day <= range.endMatchDay
    })
  })
}

export function startedChampionsAwardRounds(matches: Match[], season: string): Exclude<ChampionsStage, 'finalReplay'>[] {
  const championsMatches = competitionMatches(matches, season, 'champions')
  return CHAMPIONS_ROUNDS.filter(stage => {
    const stages = stage === 'final' ? ['final', 'finalReplay'] : [stage]
    return championsMatches.some(match => stages.includes(matchCompetitionStage(match)))
  })
}

/** One full recorded Cup stage or Champions round, including an actual final replay. */
export function matchesForAwardPeriod(matches: Match[], season: string, type: 'cup' | 'champions', stage: CupStage | ChampionsStage): Match[] {
  return competitionMatches(matches, season, type).filter(match => {
    const actualStage = matchCompetitionStage(match)
    return actualStage === stage || stage === 'final' && actualStage === 'finalReplay'
  })
}
