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

  async saveAppState(state: AppState): Promise<void> {
    // 1. Validation before any write
    if (!validateState(state)) throw new Error('Invalid state structure, saving aborted.');

    // 2. Rotate Emergency Snapshots
    for (let i = MAX_SNAPSHOTS - 1; i > 0; i--) {
        const old = localStorage.getItem(`${EMERGENCY_PREFIX}${i}`);
        if (old) localStorage.setItem(`${EMERGENCY_PREFIX}${i + 1}`, old);
    }
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) localStorage.setItem(`${EMERGENCY_PREFIX}1`, current);
    
    // 3. Backup current
    if (current) localStorage.setItem(BACKUP_KEY, current);
    
    // 4. Atomic Save
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    await saveToIndexedDB(STORAGE_KEY, state);
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
