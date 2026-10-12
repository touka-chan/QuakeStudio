import { IndexedDbRunStorage, isIndexedDbAvailable } from './idbRunStorage';
import { LocalRunStorage } from './localRunStorage';
import type { RunStorage } from './types';

/* =========================================================================
   Storage backend selection
   -------------------------------------------------------------------------
   IndexedDB where available, localStorage otherwise. One instance for the
   app's lifetime.

   If IndexedDB exists but fails at runtime (a corrupt database, a blocked
   upgrade), we fall back rather than losing saving entirely. That is decided
   once at first use so the UI does not have to handle a backend changing
   underneath it.
   ========================================================================= */

let instance: RunStorage | null = null;

export function getRunStorage(): RunStorage {
  if (instance) return instance;

  if (isIndexedDbAvailable()) {
    try {
      instance = new IndexedDbRunStorage();
    } catch {
      instance = new LocalRunStorage();
    }
  } else {
    instance = new LocalRunStorage();
  }

  return instance;
}

/** Only for tests — lets a test inject a fake backend. */
export function setRunStorage(storage: RunStorage | null): void {
  instance = storage;
}

export { IndexedDbRunStorage, LocalRunStorage };
export type { RunStorage };