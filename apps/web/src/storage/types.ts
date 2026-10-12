import type { RunRecord, RunSummary } from '@/types';

/* =========================================================================
   RunStorage — the persistence contract
   -------------------------------------------------------------------------
   The MVP persists to IndexedDB. A FastAPI + PostgreSQL backend is
   deliberately deferred, but the UI must not know that: everything goes
   through this interface, so an HTTP implementation can replace the IndexedDB
   one later without touching a single component.

   Every method is async even though the local implementation is not, precisely
   so the swap stays cheap.
   ========================================================================= */

export interface RunStorage {
  /** Persist a run. Returns the stored record, with an id assigned if absent. */
  saveRun(record: RunRecord): Promise<RunRecord>;

  /** Saved runs, newest first. */
  listRuns(): Promise<RunSummary[]>;

  /** Fetch one run in full, or null if it is not there. */
  loadRun(id: string): Promise<RunRecord | null>;

  deleteRun(id: string): Promise<void>;

  /** Every run as one JSON document, for backup or sharing. */
  exportAll(): Promise<string>;

  /**
   * Import a JSON document.
   * Returns the number of runs imported. Throws with a friendly message if the
   * file is not valid — see `lib/runJson.ts`, which validates with Zod before
   * anything is written.
   */
  importAll(json: string): Promise<number>;

  /** Short name for the UI, e.g. "IndexedDB" or "browser storage". */
  readonly backendName: string;

  /**
   * True when this backend had to trim the time series to fit its quota.
   * The UI warns about this, because a trimmed run cannot reproduce the
   * animation — only its summary numbers.
   */
  readonly isDegraded: boolean;
}

/** Create a new run record from the current app state. */
export function createRunRecord(input: {
  building: RunRecord['building'];
  motion: RunRecord['motion'];
  result: RunRecord['result'];
  appVersion: string;
  id?: string;
}): RunRecord {
  return {
    id: input.id ?? `run-${Date.now().toString(36)}-${randomSuffix()}`,
    createdAt: new Date().toISOString(),
    building: input.building,
    motion: input.motion,
    result: input.result,
    appVersion: input.appVersion,
  };
}

/** Derive the lightweight list row the UI renders. */
export function toSummary(record: RunRecord): RunSummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    appVersion: record.appVersion,
    name: record.building.name,
    floors: record.building.floors,
    maxDisp: record.result.maxDisp,
    maxDriftRatio: record.result.maxDriftRatio,
  };
}

function randomSuffix(): string {
  return Math.floor(Math.random() * 1e6)
    .toString(36)
    .padStart(4, '0');
}