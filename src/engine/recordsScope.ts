import type { CompetitionType, Match } from '../types'
import { matchCompetitionType } from './competitionContext'
import { teamsCreditedWithResult } from './matchPerspective'

export type RecordsMatchFilters = { seasons: string[]; teamIds: string[]; competition: CompetitionType | 'all' }

export function recordsScopedMatches(matches: Match[], filters: RecordsMatchFilters, category: 'player' | 'team' | 'combination' | 'insights'): Match[] {
  return matches.filter(match => {
    if (filters.competition !== 'all' && matchCompetitionType(match) !== filters.competition) return false
    if (category === 'insights') return true
    if (filters.seasons.length && !filters.seasons.includes(match.season)) return false
    if (!filters.teamIds.length) return true
    if (category === 'team') return filters.teamIds.some(teamId => teamsCreditedWithResult(match).includes(teamId))
    return filters.teamIds.some(teamId => match.appearances.some(appearance => appearance.teamId === teamId))
  })
}
