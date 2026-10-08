import type { Match, ScreenState, ScreenStateByView, View } from '../types'
import { matchCompetitionType } from '../engine/competitionContext'

/** Resolve entry context once; the resulting View carries only the entity ID. */
export function resolvePlayerDestination(target: Extract<View, { name: 'player' }>, source: View, sourceState: ScreenState, currentSeason: string, matches: Match[]): { view: Extract<View, { name: 'player' }>; screenState: ScreenStateByView['player'] } {
  const interactiveSeason = source.name === 'comparison' && sourceState.name === 'comparison' ? sourceState.season
    : source.name === 'team' && sourceState.name === 'team' && sourceState.tab === 'overview' ? sourceState.bestPlayersSeason
      : source.name === 'player' && sourceState.name === 'player' ? sourceState.season
        : source.name === 'players' && sourceState.name === 'players' && sourceState.filters.seasons.length === 1 ? sourceState.filters.seasons[0]
          : source.name === 'records' && sourceState.name === 'records' && sourceState.category === 'history' ? sourceState.historySeason
            : source.name === 'records' && sourceState.name === 'records' && ['player', 'combination', 'team'].includes(sourceState.category) && sourceState.filterSeasonIds.length === 1 ? sourceState.filterSeasonIds[0]
            : source.name === 'records-leaderboard' && sourceState.name === 'records-leaderboard' && sourceState.filterSeasonIds.length === 1 ? sourceState.filterSeasonIds[0] : null
  const sourceSeason = interactiveSeason ?? ('season' in source && typeof source.season === 'string' ? source.season : currentSeason)
  let competition: ScreenStateByView['player']['competition'] = 'all'
  if (source.name === 'competition' && sourceState.name === 'competition') competition = sourceState.competitionType
  if (source.name === 'global-ranking' && sourceState.name === 'global-ranking') competition = sourceState.scope
  if (source.name === 'records' && sourceState.name === 'records') competition = sourceState.competition
  if (source.name === 'records-leaderboard' && sourceState.name === 'records-leaderboard') competition = sourceState.competition
  if (source.name === 'team' && sourceState.name === 'team' && sourceState.tab === 'overview') competition = sourceState.bestPlayersCompetition
  if (source.name === 'comparison' && sourceState.name === 'comparison') competition = sourceState.competition
  if (source.name === 'player' && sourceState.name === 'player') competition = sourceState.competition
  if (source.name === 'match') {
    const match = matches.find(item => item.id === source.id)
    if (match) competition = matchCompetitionType(match)
  }
  if (source.name === 'season-highlight' && source.kind === 'monthly') competition = 'league'
  const season = target.season ?? (source.name === 'match' ? matches.find(item => item.id === source.id)?.season : undefined) ?? (source.name === 'player' && sourceState.name === 'player' ? sourceState.season : undefined) ?? sourceSeason
  return { view: { name: 'player', id: target.id }, screenState: { name: 'player', season, competition: target.competitionType ?? competition } }
}

/** Removes Edit Player when returning to its existing detail route. */
export function popPlayerEditHistory(history: View[], playerId: string): View[] {
  const previous = history[history.length - 2]
  return previous?.name === 'player' && previous.id === playerId ? history.slice(0, -1) : [{ name: 'player', id: playerId }]
}
