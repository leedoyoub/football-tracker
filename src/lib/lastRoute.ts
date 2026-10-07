import { POSITIONS, type AppState, type NavigationEntry, type ScreenState, type ScreenStateByView, type View } from '../types'
import { draftContext, isResumableDraft } from './draftLifecycle'
import { createNavigationEntry, defaultScreenState } from './navigation'

/** Device-only UI state. It is deliberately never part of the sync queue. */
export const LAST_ROUTE_STORAGE_KEY = 'football-tracker-last-route'

const competitionTypes = ['league', 'cup', 'champions'] as const
const rankingMetrics = new Set(['rating', 'goals', 'assists', 'g+a', 'minutes', 'mom', 'goodMatches', 'goals/90', 'assists/90', 'g+a/90', 'sotAllowed', 'cleanSheets', 'saves', 'goalsConceded', 'savePercentage'])
const positionFilters = new Set(['all', 'st-ss', 'lw-rw', 'cam', 'lm-rm', 'cm', 'cdm', 'lb-rb', 'fb', 'cb', 'gk'])

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    // Safari privacy modes can throw merely when accessing the property.
    return null
  }
}

/** New Match needs an explicit team to be a useful cold-start destination. */
export function restorableView(view: View, draftMatch?: AppState['draftMatch']): View {
  if (view.name !== 'new-match' || view.teamId) return view
  const context = draftContext(draftMatch)
  return context ? { name: 'new-match', ...context, ...(view.season ? { season: view.season } : {}) } : view
}

export function saveLastRoute(view: View, draftMatch?: AppState['draftMatch'], target = storage(), screenState?: ScreenState) {
  if (!target) return
  try {
    const restored = restorableView(view, draftMatch)
    const identity = restored.name === 'player' ? { name: 'player', id: restored.id } as View : restored
    target.setItem(LAST_ROUTE_STORAGE_KEY, JSON.stringify(screenState ? { version: 2, view: identity, screenState } : identity))
  } catch {
    // Storage can be unavailable in private browsing; navigation must still work.
  }
}

export function clearLastRoute(target = storage()) {
  try { target?.removeItem(LAST_ROUTE_STORAGE_KEY) } catch { /* no-op */ }
}

export function validRestoredView(value: unknown, state: AppState): View | null {
  if (!value || typeof value !== 'object' || typeof (value as { name?: unknown }).name !== 'string') return null
  const view = value as View
  const hasTeam = (id: unknown) => typeof id === 'string' && state.teams.some(team => team.id === id)
  const hasPlayer = (id: unknown) => typeof id === 'string' && state.players.some(player => player.id === id)
  const hasMatch = (id: unknown) => typeof id === 'string' && state.matches.some(match => match.id === id)
  const hasSeason = (season: unknown) => typeof season === 'string' && (state.matches.some(match => match.season === season) || state.competitionStates?.some(item => item.season === season))
  const season = (value: unknown) => hasSeason(value) ? value as string : undefined
  const scope = (value: unknown) => competitionTypes.includes(value as typeof competitionTypes[number]) || value === 'all'

  switch (view.name) {
    case 'home': case 'results': case 'records': case 'standings': case 'chemistry': case 'teams': case 'players': case 'data-management':
      return { name: view.name }
    case 'competition':
      return { name: 'competition', ...(season(view.season) ? { season: season(view.season) } : {}), ...(competitionTypes.includes(view.competitionType as typeof competitionTypes[number]) ? { competitionType: view.competitionType } : {}) }
    case 'global-ranking':
      return { name: 'global-ranking', ...(season(view.season) ? { season: season(view.season) } : {}), ...(scope(view.competitionType) ? { competitionType: view.competitionType } : {}), ...(rankingMetrics.has(view.rankingMetric ?? '') ? { rankingMetric: view.rankingMetric } : {}), ...(hasTeam(view.teamId) ? { teamId: view.teamId } : {}) }
    case 'comparison':
      return { name: 'comparison', ...(hasPlayer(view.leftId) ? { leftId: view.leftId } : {}), ...(hasPlayer(view.rightId) ? { rightId: view.rightId } : {}), ...(season(view.season) ? { season: season(view.season) } : {}), ...(scope(view.competitionType) ? { competitionType: view.competitionType } : {}) }
    case 'records-leaderboard':
      return { name: 'records-leaderboard', category: ['player', 'team', 'combination'].includes(view.category) ? view.category : 'player', leaderboardId: typeof view.leaderboardId === 'string' && view.leaderboardId ? view.leaderboardId : 'rating', ...(scope(view.competition) ? { competition: view.competition } : {}), ...(positionFilters.has(view.positionFilter ?? '') ? { positionFilter: view.positionFilter } : {}), seasonIds: Array.isArray(view.seasonIds) ? view.seasonIds.filter(hasSeason) : [], teamIds: Array.isArray(view.teamIds) ? view.teamIds.filter(hasTeam) : [] }
    case 'latest-changes':
      return { name: 'latest-changes', ...(season(view.season) ? { season: season(view.season) } : {}) }
    case 'season-highlight':
      return { name: 'season-highlight', season: season(view.season) ?? state.matches[0]?.season ?? 'Season 1', kind: ['monthly', 'review', 'news'].includes(view.kind) ? view.kind : 'review' }
    case 'season-recap':
      return typeof view.season === 'string' && view.season.length > 0 && state.matches.some(match => match.season === view.season) ? { name: 'season-recap', season: view.season } : null
    case 'team':
      return hasTeam(view.id) ? { name: 'team', id: view.id } : null
    case 'import-squad':
      return hasTeam(view.teamId) ? { name: 'import-squad', teamId: view.teamId } : null
    case 'player': case 'edit-player':
      return hasPlayer(view.id) ? { name: view.name, id: view.id } : null
    case 'match': case 'edit-match':
      return hasMatch(view.id) ? { name: view.name, id: view.id } : null
    case 'new-player':
      return view.teamId === undefined || hasTeam(view.teamId) ? { name: 'new-player', ...(view.teamId ? { teamId: view.teamId } : {}) } : null
    case 'new-match': {
      const context = isResumableDraft(state) ? draftContext(state.draftMatch) : undefined
      const teamId = view.teamId ?? context?.teamId
      const season = typeof view.season === 'string' ? view.season : context?.season
      const competitionType = view.competitionType ?? context?.competitionType
      return hasTeam(teamId) ? { name: 'new-match', teamId, ...(season ? { season } : {}), ...(competitionType ? { competitionType } : {}), ...(view.resumeDraft ? { resumeDraft: true } : {}) } : null
    }
    default:
      return null
  }
}

function restoredScreenState(view: View, value: unknown, state: AppState): ScreenState {
  const fallback = defaultScreenState(view)
  if (!value || typeof value !== 'object' || (value as { name?: unknown }).name !== view.name) return fallback
  const saved = value as Record<string, unknown>
  if (view.name === 'player') {
    const validSeason = typeof saved.season === 'string' && state.matches.some(match => match.season === saved.season)
    return { name: 'player', season: validSeason ? saved.season as string : null, competition: competitionTypes.includes(saved.competition as typeof competitionTypes[number]) ? saved.competition as typeof competitionTypes[number] : 'all', teamId: null }
  }
  const validScope = (scope: unknown) => scope === 'all' || competitionTypes.includes(scope as typeof competitionTypes[number])
  const validMetric = (metric: unknown) => typeof metric === 'string' && rankingMetrics.has(metric)
  const validPosition = (position: unknown) => typeof position === 'string' && positionFilters.has(position)
  const validSeason = (season: unknown) => typeof season === 'string' && state.matches.some(match => match.season === season)
  const seasonIds = (ids: unknown) => Array.isArray(ids) ? [...new Set(ids.filter(validSeason))] as string[] : []
  const teamIds = (ids: unknown) => Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && state.teams.some(team => team.id === id)))] as string[] : []
  const playerIds = (ids: unknown) => Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && state.players.some(player => player.id === id)))] as string[] : []
  const leagueDay = (day: unknown) => Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 30 ? day as number : null
  if (view.name === 'home') {
    const base = fallback as ScreenStateByView['home']
    return { ...base, leaderMetric: validMetric(saved.leaderMetric) ? saved.leaderMetric as typeof base.leaderMetric : base.leaderMetric, positionFilter: validPosition(saved.positionFilter) ? saved.positionFilter as typeof base.positionFilter : base.positionFilter }
  }
  if (view.name === 'competition') {
    const base = fallback as ScreenStateByView['competition']
    return { ...base,
      competitionType: competitionTypes.includes(saved.competitionType as typeof competitionTypes[number]) ? saved.competitionType as typeof competitionTypes[number] : base.competitionType,
      tab: ['players', 'table', 'form', 'history'].includes(saved.tab as string) ? saved.tab as typeof base.tab : base.tab,
      rankingMetric: validMetric(saved.rankingMetric) ? saved.rankingMetric as typeof base.rankingMetric : base.rankingMetric,
      positionFilter: validPosition(saved.positionFilter) ? saved.positionFilter as typeof base.positionFilter : base.positionFilter,
      bestXiMode: saved.bestXiMode === 'monthly' ? 'monthly' : 'season',
      monthlyAwardBlock: Number.isInteger(saved.monthlyAwardBlock) && (saved.monthlyAwardBlock as number) >= 1 && (saved.monthlyAwardBlock as number) <= 10 ? saved.monthlyAwardBlock as number : null,
      cupAwardStage: ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'final', 'finalReplay'].includes(saved.cupAwardStage as string) ? saved.cupAwardStage as typeof base.cupAwardStage : null,
      championsAwardRound: ['roundOf16', 'quarterFinal', 'semiFinal', 'final'].includes(saved.championsAwardRound as string) ? saved.championsAwardRound as typeof base.championsAwardRound : null,
      viewAllMetric: validMetric(saved.viewAllMetric) ? saved.viewAllMetric as typeof base.viewAllMetric : null,
      cupViewAll: saved.cupViewAll === true, compareMode: saved.compareMode === true,
      comparedPlayerIds: playerIds(saved.comparedPlayerIds), rankingTeamIds: teamIds(saved.rankingTeamIds),
      historyMatchday: leagueDay(saved.historyMatchday), historyComparedTeamIds: teamIds(saved.historyComparedTeamIds),
    }
  }
  if (view.name === 'global-ranking') {
    const base = fallback as ScreenStateByView['global-ranking']
    return { ...base, metric: validMetric(saved.metric) ? saved.metric as typeof base.metric : base.metric, scope: validScope(saved.scope) ? saved.scope as typeof base.scope : base.scope, positionFilter: validPosition(saved.positionFilter) ? saved.positionFilter as typeof base.positionFilter : base.positionFilter, teamId: typeof saved.teamId === 'string' && state.teams.some(team => team.id === saved.teamId) ? saved.teamId : null, viewAll: saved.viewAll === true }
  }
  if (view.name === 'comparison') {
    const base = fallback as ScreenStateByView['comparison']
    const playerId = (id: unknown) => typeof id === 'string' && state.players.some(player => player.id === id) ? id : null
    return { ...base, leftId: playerId(saved.leftId), rightId: playerId(saved.rightId), season: validSeason(saved.season) ? saved.season as string : null, competition: validScope(saved.competition) ? saved.competition as typeof base.competition : base.competition, teamId: typeof saved.teamId === 'string' && state.teams.some(team => team.id === saved.teamId) ? saved.teamId : null }
  }
  if (view.name === 'records-leaderboard') {
    const base = fallback as ScreenStateByView['records-leaderboard']
    return { ...base, competition: validScope(saved.competition) ? saved.competition as typeof base.competition : base.competition, positionFilter: validPosition(saved.positionFilter) ? saved.positionFilter as typeof base.positionFilter : base.positionFilter, filterSeasonIds: seasonIds(saved.filterSeasonIds), filterTeamIds: teamIds(saved.filterTeamIds) }
  }
  if (view.name === 'records') {
    const base = fallback as ScreenStateByView['records']
    return { ...base,
      category: ['player', 'combination', 'team', 'history', 'insights', 'integrity'].includes(saved.category as string) ? saved.category as typeof base.category : base.category,
      competition: validScope(saved.competition) ? saved.competition as typeof base.competition : base.competition,
      positionFilter: validPosition(saved.positionFilter) ? saved.positionFilter as typeof base.positionFilter : base.positionFilter,
      filterSeasonIds: seasonIds(saved.filterSeasonIds), filterTeamIds: teamIds(saved.filterTeamIds),
      combinationPosition: ['attack', 'midfield', 'defence'].includes(saved.combinationPosition as string) ? saved.combinationPosition as typeof base.combinationPosition : base.combinationPosition,
      combinationPlayers: [2, 3, 4].includes(saved.combinationPlayers as number) ? saved.combinationPlayers as typeof base.combinationPlayers : base.combinationPlayers,
      combinationMetric: ['starts', 'minutes', 'ppg'].includes(saved.combinationMetric as string) ? saved.combinationMetric as typeof base.combinationMetric : base.combinationMetric,
      bestUnitId: typeof saved.bestUnitId === 'string' && saved.bestUnitId.startsWith('best-unit:') ? saved.bestUnitId : base.bestUnitId,
      historyPanel: saved.historyPanel === 'timeline' || saved.historyPanel === 'awards' ? saved.historyPanel : null,
      historySeason: validSeason(saved.historySeason) ? saved.historySeason as string : null,
      historyBlock: Number.isInteger(saved.historyBlock) && (saved.historyBlock as number) >= 1 && (saved.historyBlock as number) <= 10 ? saved.historyBlock as number : null,
    }
  }
  if (view.name === 'team') {
    const base = fallback as ScreenStateByView['team']
    return { ...base,
      tab: ['overview', 'matches', 'players'].includes(saved.tab as string) ? saved.tab as typeof base.tab : base.tab,
      bestPlayersSeason: validSeason(saved.bestPlayersSeason) ? saved.bestPlayersSeason as string : null,
      bestPlayersCompetition: validScope(saved.bestPlayersCompetition) ? saved.bestPlayersCompetition as typeof base.bestPlayersCompetition : base.bestPlayersCompetition,
      bestPlayersMetric: validMetric(saved.bestPlayersMetric) ? saved.bestPlayersMetric as typeof base.bestPlayersMetric : base.bestPlayersMetric,
      matchesCompetition: validScope(saved.matchesCompetition) ? saved.matchesCompetition as typeof base.matchesCompetition : base.matchesCompetition,
    }
  }
  if (view.name === 'match') return { name: 'match', tab: ['facts', 'lineup', 'ratings'].includes(saved.tab as string) ? saved.tab as ScreenStateByView['match']['tab'] : 'facts' }
  if (view.name === 'players') {
    const filters = saved.filters && typeof saved.filters === 'object' ? saved.filters as Record<string, unknown> : {}
    const validTeams = Array.isArray(filters.teams) ? [...new Set(filters.teams.filter(id => id === '__no-team__' || typeof id === 'string' && state.teams.some(team => team.id === id)))] as string[] : []
    const positions = Array.isArray(filters.positions) ? [...new Set(filters.positions.filter(position => POSITIONS.includes(position)))] as ScreenStateByView['players']['filters']['positions'] : []
    return { name: 'players', search: typeof saved.search === 'string' ? saved.search : '', filters: { seasons: seasonIds(filters.seasons), teams: validTeams, positions } }
  }
  return fallback
}

export function loadLastNavigationEntry(state: AppState, target = storage()): NavigationEntry {
  if (!target) return createNavigationEntry({ name: 'home' })
  try {
    const raw = target.getItem(LAST_ROUTE_STORAGE_KEY)
    if (!raw) return createNavigationEntry({ name: 'home' })
    const parsed = JSON.parse(raw)
    const wrapped = parsed?.version === 2 && parsed.view && typeof parsed.view === 'object'
    const view = validRestoredView(wrapped ? parsed.view : parsed, state) ?? { name: 'home' }
    return createNavigationEntry(view, restoredScreenState(view, wrapped ? parsed.screenState : null, state))
  } catch {
    return createNavigationEntry({ name: 'home' })
  }
}

export function loadLastRoute(state: AppState, target = storage()): View {
  return loadLastNavigationEntry(state, target).view
}
