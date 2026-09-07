import type { AppState } from '../types';
import { getFromIndexedDB, saveToIndexedDB } from './db';
import { validateState } from './validation';

const STORAGE_KEY = 'football-tracker-v1';
const BACKUP_KEY = 'football-tracker-v1-backup';
const EMERGENCY_PREFIX = 'football-tracker-emergency-';
const MAX_SNAPSHOTS = 5;

export const LocalRepository = {
  async getAppState(): Promise<AppState | null> {
    const sources = [
      () => getFromIndexedDB(STORAGE_KEY),
      () => Promise.resolve(localStorage.getItem(STORAGE_KEY)),
      () => Promise.resolve(localStorage.getItem(BACKUP_KEY)),
      ...Array.from({ length: MAX_SNAPSHOTS }, (_, i) => () => Promise.resolve(localStorage.getItem(`${EMERGENCY_PREFIX}${i + 1}`)))
    ];

    for (const getSource of sources) {
      try {
        const raw = await getSource();
        if (!raw) continue;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (validateState(parsed)) {
          // If recovered from non-IDB, sync to IDB
          if (typeof raw === 'string') await saveToIndexedDB(STORAGE_KEY, parsed);
          return parsed;
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

export const SyncManager = {
  async queueOperation(op: any): Promise<void> {
    console.log('Queueing operation', op);
  },
  async sync(): Promise<void> {
    console.log('Syncing...');
  }
};
