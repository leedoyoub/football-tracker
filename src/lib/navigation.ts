import type { NavigationEntry, ScreenStateByView, View } from '../types'

export function defaultScreenState<V extends View>(view: V): ScreenStateByView[V['name']] {
  let state: ScreenStateByView[keyof ScreenStateByView]
  switch (view.name) {
    case 'home': state = { name: 'home', leaderMetric: 'rating', positionFilter: 'all' }; break
    case 'latest-changes': state = { name: 'latest-changes' }; break
    case 'competition': state = {
      name: 'competition', competitionType: view.competitionType ?? 'league', tab: 'players', rankingMetric: view.rankingMetric ?? 'rating',
      positionFilter: 'all', bestXiMode: 'season', monthlyAwardBlock: null, cupAwardStage: null, championsAwardRound: null, viewAllMetric: null, cupViewAll: false, compareMode: false, comparedPlayerIds: [], rankingTeamIds: [],
      historyMatchday: null, historyComparedTeamIds: [],
    }; break
    case 'global-ranking': state = { name: 'global-ranking', metric: view.rankingMetric ?? 'rating', scope: view.competitionType ?? 'all', positionFilter: 'all', teamId: view.teamId ?? null, viewAll: false }; break
    case 'records': state = { name: 'records', category: 'player', competition: 'all', positionFilter: 'all', filterSeasonIds: [], filterTeamIds: [], historyPanel: null, historySeason: null, historyBlock: null }; break
    case 'records-leaderboard': state = { name: 'records-leaderboard', category: view.category, leaderboardId: view.leaderboardId, competition: view.competition ?? 'all', positionFilter: view.positionFilter ?? 'all', filterSeasonIds: view.seasonIds ?? [], filterTeamIds: view.teamIds ?? [] }; break
    case 'comparison': state = { name: 'comparison', leftId: view.leftId ?? null, rightId: view.rightId ?? null, season: view.season ?? null, competition: view.competitionType ?? 'all', teamId: null }; break
    case 'team': state = { name: 'team', tab: 'overview', bestPlayersSeason: null, bestPlayersCompetition: 'all', bestPlayersMetric: 'rating', matchesCompetition: 'all' }; break
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

type DetailView = Extract<View, { name: 'team' | 'player' | 'match' }>
const isDetailView = (view: View): view is DetailView => view.name === 'team' || view.name === 'player' || view.name === 'match'
const isTransientWorkflow = (view: View) => view.name === 'new-match' || view.name === 'edit-match'
const sameDetailDestination = (left: View, right: View) => isDetailView(left) && isDetailView(right) && left.name === right.name && left.id === right.id

/** Returns the nearest prior instance of an exact Team, Player, or Match detail. */
export function popToExistingNavigationEntry(entries: NavigationEntry[], view: View, currentScrollTop: number): NavigationEntry[] | undefined {
  if (!isDetailView(view)) return undefined
  for (let index = entries.length - 1; index >= 0; index--) {
    if (!sameDetailDestination(entries[index].view, view)) continue
    return index === entries.length - 1 ? snapshotScroll(entries, index, currentScrollTop) : entries.slice(0, index + 1)
  }
  return undefined
}

/** Browse navigation preserves an existing exact detail entry instead of pushing a duplicate. */
export function navigateBrowseEntry<V extends View>(entries: NavigationEntry[], view: V, currentScrollTop: number): NavigationEntry[] {
  return popToExistingNavigationEntry(entries, view, currentScrollTop) ?? pushNavigationEntry(entries, view, currentScrollTop)
}

/** Editors live above their browse parent only while the workflow is active. */
export function enterTransientWorkflow<V extends Extract<View, { name: 'new-match' | 'edit-match' }>>(entries: NavigationEntry[], view: V, currentScrollTop: number): NavigationEntry[] {
  return pushNavigationEntry(entries, view, currentScrollTop)
}

/** Cancel and successful completion consume a transient editor; an orphan uses its destination fallback. */
export function closeTransientWorkflow<V extends View>(entries: NavigationEntry[], fallback: V): NavigationEntry[] {
  const current = entries[entries.length - 1]
  return current && isTransientWorkflow(current.view) && entries.length > 1 ? entries.slice(0, -1) : replaceNavigationEntry(entries, fallback)
}

/** Successful New Match saves consume the editor, then open the persisted match as browse history. */
export function completeTransientWorkflowToBrowse<V extends View>(entries: NavigationEntry[], destination: V): NavigationEntry[] {
  const browseEntries = closeTransientWorkflow(entries, destination)
  return navigateBrowseEntry(browseEntries, destination, browseEntries[browseEntries.length - 1]?.scrollTop ?? 0)
}

/** Team Back returns to its actual browse source, with Teams only for an orphan detail entry. */
export function backFromTeamDetailEntries(entries: NavigationEntry[]): NavigationEntry[] {
  const browseEntries = entries.slice(0, -1).filter(entry => !isTransientWorkflow(entry.view))
  return browseEntries.length ? browseEntries : resetNavigationEntries({ name: 'teams' })
}

export function updateCurrentScreenState(entries: NavigationEntry[], screenState: NavigationEntry['screenState']): NavigationEntry[] {
  if (!entries.length) return entries
  return entries.map((entry, index) => index === entries.length - 1 ? { ...entry, screenState } : entry)
}
