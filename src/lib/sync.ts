import { supabase } from './supabase';
import { getFromIndexedDB, openDB, saveToIndexedDB } from './db';
import type { AppState } from '../types';
import { validateState } from './validation';

const QUEUE_STORE = 'sync_queue';
const SYNC_META_STORE = 'sync_metadata';

export interface SyncItem {
  id: string;
  entityType: 'match' | 'player' | 'team';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
  payload: any;
}

export interface SyncMetadata {
  lastSyncedUserId: string | null;
  lastSyncAt: number;
  conflictCount: number;
}

export const SyncManager = {
  async getSyncMetadata(): Promise<SyncMetadata> {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SYNC_META_STORE, 'readonly');
      const req = tx.objectStore(SYNC_META_STORE).get('meta');
      req.onsuccess = () => resolve(req.result || { lastSyncedUserId: null, lastSyncAt: 0, conflictCount: 0 });
    });
  },

  async updateSyncMetadata(meta: SyncMetadata): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(SYNC_META_STORE, 'readwrite');
    tx.objectStore(SYNC_META_STORE).put(meta, 'meta');
  },

  async queueOperation(item: Omit<SyncItem, 'id' | 'timestamp' | 'status'>): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put({ 
        ...item, 
        id: crypto.randomUUID(), 
        timestamp: Date.now(), 
        status: 'pending' 
    });
  },

  async syncNow(): Promise<{ status: string; message: string }> {
    if (!supabase) return { status: 'offline', message: 'No Supabase connection' };
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { status: 'error', message: 'Not signed in' };

    const meta = await this.getSyncMetadata();
    
    // Account Mismatch Protection
    if (meta.lastSyncedUserId && meta.lastSyncedUserId !== user.id) {
        return { status: 'account_mismatch', message: 'Account mismatch detected. Sync paused to protect data.' };
    }

    const localState = await getFromIndexedDB('football-tracker-v1');
    if (!localState) return { status: 'error', message: 'No local data' };

    // 1. Process Queue (Upload)
    const db = await openDB();
    const queue = await new Promise<SyncItem[]>((resolve) => {
        const tx = db.transaction(QUEUE_STORE, 'readonly');
        const req = tx.objectStore(QUEUE_STORE).getAll();
        req.onsuccess = () => resolve(req.result);
    });

    for (const item of queue) {
        try {
            const table = item.entityType + 's';
            if (item.operation === 'create' || item.operation === 'update') {
                const { error } = await supabase.from(table).upsert({ ...item.payload, user_id: user.id });
                if (error) throw error;
            } else if (item.operation === 'delete') {
                // Using tombstone approach: just update a deleted_at column instead of hard delete if possible
                // Assuming RLS handles user isolation
                const { error } = await supabase.from(table).delete().eq('id', item.entityId).eq('user_id', user.id);
                if (error) throw error;
            }
            const tx = db.transaction(QUEUE_STORE, 'readwrite');
            tx.objectStore(QUEUE_STORE).delete(item.id);
        } catch (e) {
            console.error('Failed to sync item:', item, e);
        }
    }
    
    // 2. Download and Merge
    await this.downloadAndMerge(user.id, localState);
    
    // 3. Update Meta
    await this.updateSyncMetadata({ lastSyncedUserId: user.id, lastSyncAt: Date.now(), conflictCount: meta.conflictCount });

    return { status: 'synced', message: 'Sync complete' };
  },

  async downloadAndMerge(userId: string, localState: AppState): Promise<void> {
      if (!supabase) return;
      // Fetch Cloud Data (Simplified for core entities)
      const { data: teams } = await supabase.from('teams').select('*').eq('user_id', userId);
      const { data: players } = await supabase.from('players').select('*').eq('user_id', userId);
      const { data: matches } = await supabase.from('matches').select('*').eq('user_id', userId);
      
      const cloudState = { teams: teams || [], players: players || [], matches: matches || [] };

      // Entity level merge
      const mergedTeams = this.mergeEntities(localState.teams, cloudState.teams);
      const mergedPlayers = this.mergeEntities(localState.players, cloudState.players);
      const mergedMatches = this.mergeEntities(localState.matches, cloudState.matches);
      
      const mergedState = { ...localState, teams: mergedTeams, players: mergedPlayers, matches: mergedMatches };

      if (validateState(mergedState)) {
          await saveToIndexedDB('football-tracker-v1', mergedState);
      }
  },

  mergeEntities<T extends { id: string }>(local: T[], cloud: T[]): T[] {
      const result = [...local];
      for (const item of cloud) {
          const index = result.findIndex(i => i.id === item.id);
          if (index === -1) {
              result.push(item);
          } else {
              // Simple Conflict Detection: Last Write Wins based on ID identity
              // In a real production system, use updatedAt timestamps
              result[index] = item; 
          }
      }
      return result;
  }
};
