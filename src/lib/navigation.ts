import type { NavigationEntry, ScreenStateByView, View } from '../types'

export function defaultScreenState<V extends View>(view: V): ScreenStateByView[V['name']] {
  let state: ScreenStateByView[keyof ScreenStateByView]
  switch (view.name) {
    case 'home': state = { name: 'home', leaderMetric: 'rating', positionFilter: 'all' }; break
    case 'competition': state = {
      name: 'competition', competitionType: view.competitionType ?? 'league', tab: 'players', rankingMetric: view.rankingMetric ?? 'rating',
      positionFilter: 'all', bestXiMode: 'season', viewAllMetric: null, cupViewAll: false, compareMode: false, comparedPlayerIds: [], rankingTeamIds: [],
      historyMatchday: null, historyComparedTeamIds: [],
    }; break
    case 'global-ranking': state = { name: 'global-ranking', metric: view.rankingMetric ?? 'rating', scope: view.competitionType ?? 'all', positionFilter: 'all', viewAll: false }; break
    case 'records': state = { name: 'records', category: 'player', competition: 'all', positionFilter: 'all', filterSeasonIds: [], filterTeamIds: [], expandedLeaderboardId: null, historyPanel: null, historySeason: null, historyBlock: null }; break
    case 'comparison': state = { name: 'comparison', leftId: view.leftId ?? null, rightId: view.rightId ?? null, season: view.season ?? null, competition: view.competitionType ?? 'all', teamId: null }; break
    case 'team': state = { name: 'team', tab: 'overview', bestPlayersSeason: null, bestPlayersCompetition: 'all', bestPlayersMetric: 'rating', matchesCompetition: 'all', expandedContext: null }; break
    case 'players': state = { name: 'players', search: '' }; break
    case 'player': state = { name: 'player', season: null, competition: 'all' }; break
    case 'match': state = { name: 'match', tab: 'facts' }; break
    default: state = { name: view.name } as ScreenStateByView[keyof ScreenStateByView]
  }
  return state as ScreenStateByView[V['name']]
}

export function createNavigationEntry<V extends View>(view: V, screenState: ScreenStateByView[V['name']] = defaultScreenState(view), scrollTop = 0): NavigationEntry<V> {
  return { view, screenState, scrollTop }
}

export function snapshotScroll(entries: NavigationEntry[], index: number, scrollTop: number): NavigationEntry[] {
  return entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, scrollTop } : entry)
}

export function pushNavigationEntry<V extends View>(entries: NavigationEntry[], view: V, currentScrollTop: number, screenState?: ScreenStateByView[V['name']]): NavigationEntry[] {
  const snapped = snapshotScroll(entries, entries.length - 1, currentScrollTop)
  return [...snapped, createNavigationEntry(view, screenState ?? defaultScreenState(view))]
}

export function popNavigationEntry(entries: NavigationEntry[]): NavigationEntry[] {
  return entries.length > 1 ? entries.slice(0, -1) : [createNavigationEntry({ name: 'home' })]
}

export function replaceNavigationEntry<V extends View>(entries: NavigationEntry[], view: V, screenState?: ScreenStateByView[V['name']]): NavigationEntry[] {
  const entry = createNavigationEntry(view, screenState ?? defaultScreenState(view))
  return entries.length ? [...entries.slice(0, -1), entry] : [entry]
}

export function resetNavigationEntries<V extends View>(view: V, screenState?: ScreenStateByView[V['name']]): NavigationEntry[] {
  return [createNavigationEntry(view, screenState ?? defaultScreenState(view))]
}

/** The Team Detail page-level back affordance intentionally returns to the Teams hub. */
export function teamDetailBackEntries() {
  return resetNavigationEntries({ name: 'teams' })
}

export function updateCurrentScreenState(entries: NavigationEntry[], screenState: NavigationEntry['screenState']): NavigationEntry[] {
  if (!entries.length) return entries
  return entries.map((entry, index) => index === entries.length - 1 ? { ...entry, screenState } : entry)
}

export type SameTeamBackTarget = { action: 'pop' } | { action: 'replace'; entry: NavigationEntry<Extract<View, { name: 'team' }>> }

export function sameTeamBackTarget(entries: NavigationEntry[], teamId: string): SameTeamBackTarget {
  const previous = entries[entries.length - 2]?.view
  if (previous?.name === 'team' && previous.id === teamId) return { action: 'pop' }
  return { action: 'replace', entry: createNavigationEntry({ name: 'team', id: teamId }) }
}
