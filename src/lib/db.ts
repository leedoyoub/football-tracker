import type { AppState } from '../types';

const DB_NAME = 'FootballTrackerDB';
const DB_VERSION = 2;
const DATA_STORE = 'data';
const QUEUE_STORE = 'sync_queue';
const METADATA_STORE = 'sync_metadata';
let connection: { factory: IDBFactory; promise: Promise<IDBDatabase> } | undefined;

export interface SyncItem {
  id: string;
  entityType: 'match' | 'player' | 'team';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
}

export function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'));
  if (connection?.factory === indexedDB) return connection.promise;
  const factory = indexedDB;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let failed = false;
    const fail = (error: unknown) => { failed = true; reject(error); };
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      fail(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      // Version 2 is additive: existing local data and the durable queue survive.
      if (!db.objectStoreNames.contains(METADATA_STORE)) db.createObjectStore(METADATA_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // A blocked request can succeed after its caller has already retried.
      // Close that orphan instead of retaining an unobserved connection.
      if (failed) { db.close(); return; }
      const invalidate = () => { if (connection?.promise === shared) connection = undefined; };
      // Explicit close does not dispatch the abnormal-closure event.
      const close = db.close.bind(db);
      db.close = () => { invalidate(); close(); };
      db.onversionchange = () => { invalidate(); db.close(); };
      db.onclose = invalidate;
      resolve(db);
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error('IndexedDB is blocked'));
  });
  const shared = pending.catch(error => {
    if (connection?.promise === shared) connection = undefined;
    throw error;
  });
  connection = { factory, promise: shared };
  return shared;
}

export async function saveToIndexedDB(key: string, data: AppState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, 'readwrite');
    tx.objectStore(DATA_STORE).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
  });
}

export async function getFromIndexedDB(key: string): Promise<AppState | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, 'readonly');
    const request = tx.objectStore(DATA_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB read aborted'));
  });
}
