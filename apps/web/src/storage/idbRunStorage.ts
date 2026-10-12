import { exportRunJson, parseRunJson } from '@/lib/runJson';
import type { RunRecord } from '@/types';
import { toSummary, type RunStorage } from './types';

/* =========================================================================
   IndexedDB backend
   -------------------------------------------------------------------------
   The real store. IndexedDB rather than localStorage because a single run's
   displacement history is large — 20 floors x 60 s at dt = 0.01 is 120,000
   numbers, comfortably past localStorage's ~5 MB quota after a few saves.

   Uses the raw IndexedDB API rather than a wrapper library. The surface we
   need is small (one object store, four operations) and keeping it explicit
   means a student can read exactly what is stored and how.

   Every operation is wrapped in a Promise, because the native API is
   event-based and the UI should never have to care.
   ========================================================================= */

const DB_NAME = 'quakestudio';
const DB_VERSION = 1;
const STORE = 'runs';

/** Internal shape: the record plus the fields needed for listing. */
type StoredRun = RunRecord & { name: string };

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);

    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        // Listing reads every run but only needs a few fields.
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('name', 'name');
      }
    };

    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('Could not open IndexedDB'));
    open.onblocked = () =>
      reject(new Error('IndexedDB upgrade blocked — close other QuakeStudio tabs and retry'));
  });
}

/** Run `fn` inside a transaction and resolve when it commits. */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);

    // Attach the commit listeners BEFORE running `fn`. A transaction can
    // auto-commit as soon as its last request completes, and awaiting `fn`
    // yields to the event loop — so handlers attached afterwards could miss
    // `complete` entirely and the promise would never settle.
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });

    const result = await fn(store);
    await committed;
    return result;
  } finally {
    db.close();
  }
}

export class IndexedDbRunStorage implements RunStorage {
  readonly backendName = 'IndexedDB';
  readonly isDegraded = false;

  async saveRun(record: RunRecord): Promise<RunRecord> {
    const stored: StoredRun = { ...record, name: record.building.name };
    await withStore('readwrite', (store) => request(store.put(stored)));
    return record;
  }

  async listRuns() {
    const all = await withStore('readonly', (store) =>
      request<StoredRun[]>(store.getAll() as IDBRequest<StoredRun[]>),
    );

    return all.map(toSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async loadRun(id: string): Promise<RunRecord | null> {
    const stored = await withStore('readonly', (store) =>
      request<StoredRun | undefined>(store.get(id) as IDBRequest<StoredRun | undefined>),
    );
    if (!stored) return null;
    // Drop the denormalised name; the UI reads it from building.name.
    const { name: _name, ...record } = stored;
    return record;
  }

  async deleteRun(id: string): Promise<void> {
    await withStore('readwrite', (store) => request(store.delete(id)));
  }

  async exportAll(): Promise<string> {
    const all = await withStore('readonly', (store) =>
      request<StoredRun[]>(store.getAll() as IDBRequest<StoredRun[]>),
    );
    return exportRunJson(all.map(stripName));
  }

  async importAll(json: string): Promise<number> {
    const records = parseRunJson(json);
    for (const record of records) {
      await this.saveRun(record);
    }
    return records.length;
  }
}

function stripName(stored: StoredRun): RunRecord {
  const { name: _name, ...record } = stored;
  return record;
}

/** True when IndexedDB can actually be used in this browser context. */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Safari in private mode throws on access rather than returning undefined.
    return false;
  }
}
