import { POSITIONS, type AppState, type Player } from '../types';
import { getFromIndexedDB, saveToIndexedDB } from './db';
import { validateState } from './validation';

// This is a durable data namespace, deliberately independent from app and
// derived-engine versions.  Never turn a release number into a storage key.
export const STORAGE_KEY = 'football-tracker-v1';
// Read-only compatibility aliases for early/local development builds.  A valid
// payload is never deleted or rewritten at its original key during recovery.
export const LEGACY_STORAGE_KEYS = ['football-tracker-data', 'football-tracker', 'football-tracker-v2'] as const;
const BACKUP_KEY = 'football-tracker-v1-backup';
const EMERGENCY_PREFIX = 'football-tracker-emergency-';
const MAX_SNAPSHOTS = 5;
export type DurableSaveResult = { primarySaved: true; mirrorSaved: boolean; mirrorError?: string }

function safelyRead(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function preserveRecoveryCopies(current: string | null) {
  if (!current) return
  // Recovery copies are best-effort. Their failure must never prevent the
  // primary write that makes the user's new match durable.
  try {
    for (let i = MAX_SNAPSHOTS - 1; i > 0; i--) {
      const old = safelyRead(`${EMERGENCY_PREFIX}${i}`)
      if (old) localStorage.setItem(`${EMERGENCY_PREFIX}${i + 1}`, old)
    }
    localStorage.setItem(`${EMERGENCY_PREFIX}1`, current)
    localStorage.setItem(BACKUP_KEY, current)
  } catch { /* Primary storage verification below remains authoritative. */ }
}
export const LocalRepository = {
  async getAppState(): Promise<AppState | null> {
    // localStorage is written synchronously before IndexedDB. Prefer it on a
    // cold restart so the last user action also survives an iOS/PWA kill while
    // an IndexedDB transaction was still settling.
    const sources = [
      () => Promise.resolve(localStorage.getItem(STORAGE_KEY)),
      () => getFromIndexedDB(STORAGE_KEY),
      () => Promise.resolve(localStorage.getItem(BACKUP_KEY)),
      ...Array.from({ length: MAX_SNAPSHOTS }, (_, i) => () => Promise.resolve(localStorage.getItem(`${EMERGENCY_PREFIX}${i + 1}`))),
      ...LEGACY_STORAGE_KEYS.map(key => () => Promise.resolve(localStorage.getItem(key))),
    ];

    for (const getSource of sources) {
      try {
        const raw = await getSource();
        if (!raw) continue;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (validateState(parsed)) {
          // Migration: Ensure player position is valid
          const migratedState: AppState = {
            ...parsed,
            teams: parsed.teams,
            players: parsed.players.map((player: Player) => ({
              ...player,
              position: POSITIONS.includes(player.position) ? player.position : 'CM',
              teamIds: player.teamIds ?? (player.teamId ? [player.teamId] : [])
            })),
          };
          // Mirroring a recovered browser-storage payload into IndexedDB is a
          // resilience enhancement, never a prerequisite for reading history.
          // Private mode, quota pressure, or a blocked database must not make a
          // valid local Match history look like an empty app.
          if (typeof raw === 'string') {
            try { await saveToIndexedDB(STORAGE_KEY, migratedState); }
            catch { /* The already-validated source remains the durable read. */ }
          }
          return migratedState;
        }
      } catch (e) {
        console.error('Recovery attempt failed for a source', e);
      }
    }
    return null;
  },

  async saveAppState(state: AppState): Promise<DurableSaveResult> {
    // Serialize and validate before touching any durable source. This makes a
    // reported successful match save mean primary browser storage was proven.
    if (!validateState(state)) throw new Error('Invalid state structure, saving aborted.');
    let serialized: string
    try { serialized = JSON.stringify(state) } catch { throw new Error('Primary storage serialization failed.') }

    const current = safelyRead(STORAGE_KEY)
    preserveRecoveryCopies(current)
    try {
      localStorage.setItem(STORAGE_KEY, serialized)
      const readBack = localStorage.getItem(STORAGE_KEY)
      if (readBack !== serialized) throw new Error('Primary storage read-back did not match the saved state.')
      const parsed = JSON.parse(readBack)
      if (!validateState(parsed)) throw new Error('Primary storage verification failed.')
    } catch (error) {
      throw new Error(error instanceof Error ? `Primary storage save failed: ${error.message}` : 'Primary storage save failed.')
    }

    // IndexedDB is a mirror only. A blocked transaction must not turn an
    // already verified localStorage save into a user-visible failed save.
    try {
      await saveToIndexedDB(STORAGE_KEY, state)
      return { primarySaved: true, mirrorSaved: true }
    } catch (error) {
      return { primarySaved: true, mirrorSaved: false, mirrorError: error instanceof Error ? error.message : 'IndexedDB mirror unavailable.' }
    }
  },

  async exportData(): Promise<string> {
    const state = await this.getAppState();
    return JSON.stringify(state);
  },

  async importData(jsonString: string): Promise<void> {
    const parsed = JSON.parse(jsonString);
    if (!validateState(parsed)) throw new Error('Invalid JSON structure');
    await this.saveAppState(parsed);
  }
};
