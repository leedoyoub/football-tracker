import type { AppState, View } from '../types'

/** Device-only UI state. It is deliberately never part of the sync queue. */
export const LAST_ROUTE_STORAGE_KEY = 'football-tracker-last-route'

const competitionTypes = ['league', 'cup', 'champions'] as const

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
  const teamId = draftMatch?.teamId ?? draftMatch?.homeTeamId
  return teamId ? { name: 'new-match', teamId, ...(view.season ? { season: view.season } : {}) } : view
}

export function saveLastRoute(view: View, draftMatch?: AppState['draftMatch'], target = storage()) {
  if (!target) return
  try {
    target.setItem(LAST_ROUTE_STORAGE_KEY, JSON.stringify(restorableView(view, draftMatch)))
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

  switch (view.name) {
    case 'home': case 'results': case 'records': case 'standings': case 'chemistry': case 'comparison': case 'teams': case 'players': case 'data-management':
      return { name: view.name }
    case 'competition':
      return (view.competitionType === undefined || competitionTypes.includes(view.competitionType)) && (view.season === undefined || typeof view.season === 'string') ? { name: 'competition', ...(view.season ? { season: view.season } : {}), ...(view.competitionType ? { competitionType: view.competitionType } : {}) } : null
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
      const teamId = view.teamId ?? state.draftMatch?.teamId ?? state.draftMatch?.homeTeamId
      return hasTeam(teamId) ? { name: 'new-match', teamId, ...(typeof view.season === 'string' ? { season: view.season } : {}) } : null
    }
    default:
      return null
  }
}

export function loadLastRoute(state: AppState, target = storage()): View {
  if (!target) return { name: 'home' }
  try {
    const raw = target.getItem(LAST_ROUTE_STORAGE_KEY)
    if (!raw) return { name: 'home' }
    return validRestoredView(JSON.parse(raw), state) ?? { name: 'home' }
  } catch {
    return { name: 'home' }
  }
}
