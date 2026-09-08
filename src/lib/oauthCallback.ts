/**
 * Supabase normally removes an implicit OAuth callback hash itself. This is a
 * small, value-blind fallback for browsers which retain the visible fragment
 * after Supabase has already reported a valid session.
 */
const AUTH_CALLBACK_KEYS = ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type']

export function hasSupabaseAuthCallbackHash(hash: string): boolean {
  if (!hash.startsWith('#')) return false
  const params = new URLSearchParams(hash.slice(1))
  return AUTH_CALLBACK_KEYS.some(key => params.has(key))
}

export function clearSupabaseAuthCallbackHash(
  location: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location,
  browserHistory: Pick<History, 'state' | 'replaceState'> = window.history,
): boolean {
  if (!hasSupabaseAuthCallbackHash(location.hash)) return false
  // Preserve the GitHub Pages pathname and any non-auth query parameters.
  try {
    browserHistory.replaceState(browserHistory.state, '', `${location.pathname}${location.search}`)
    return true
  } catch {
    // Hash cleanup is security hygiene after session confirmation, never a
    // reason to interrupt a successfully authenticated Safari startup.
    return false
  }
}
