/** Pure startup policy so auth callback and route-restore ordering stays testable. */
export type StartupState = {
  authLoading: boolean
  authError: boolean
  isSupabaseConfigured: boolean
  hasUser: boolean
  localOnly: boolean
  routeRestored: boolean
}

export function canUseApp({ isSupabaseConfigured, hasUser, localOnly }: StartupState): boolean {
  return !isSupabaseConfigured || hasUser || localOnly
}

export function shouldRestoreLastRoute(state: StartupState): boolean {
  return !state.authLoading && !state.authError && canUseApp(state) && !state.routeRestored
}

export function startupScreen(state: StartupState): 'loading' | 'error' | 'auth-entry' | 'app' {
  if (state.authLoading) return 'loading'
  if (state.authError) return 'error'
  if (!canUseApp(state)) return 'auth-entry'
  if (!state.routeRestored) return 'loading'
  return 'app'
}
