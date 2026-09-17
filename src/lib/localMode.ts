/** A device preference only. It must never share a namespace with football data. */
export const LOCAL_MODE_PREFERENCE_KEY = 'football-tracker-local-mode'

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function loadLocalModePreference(): boolean {
  try { return storage()?.getItem(LOCAL_MODE_PREFERENCE_KEY) === 'true' } catch { return false }
}

export function saveLocalModePreference(): void {
  try { storage()?.setItem(LOCAL_MODE_PREFERENCE_KEY, 'true') } catch { /* local mode remains usable for this launch */ }
}

