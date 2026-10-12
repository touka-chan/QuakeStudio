import { exportRunJson, parseRunJson } from '@/lib/runJson';
import type { RunRecord } from '@/types';
import { toSummary, type RunStorage } from './types';
import { STORAGE_KEYS } from '@/config/engineeringAssumptions';

/* =========================================================================
   localStorage fallback
   -------------------------------------------------------------------------
   Used when IndexedDB is unavailable — Safari private mode, a locked-down
   browser, some embedded webviews. It keeps the app usable rather than
   disabling saving entirely.

   The honest limitation: localStorage holds about 5 MB, and one 20-floor,
   60-second run is roughly 120,000 displacement values. Rather than let a
   save fail with a raw quota error, this backend THINS the time series —
   keeping every floor's peak, the periods, and a downsampled history.

   A thinned run can still show its summary numbers, but it cannot replay the
   animation faithfully. `isDegraded` is true when that has happened, and the
   UI says so rather than quietly presenting a truncated run as a complete one.
   ========================================================================= */

const KEY = STORAGE_KEYS.runs;

/** Target sample count when thinning. 2000 points per floor is still smooth. */
const THINNED_POINTS = 2000;

export class LocalRunStorage implements RunStorage {
  readonly backendName = 'browser storage';
  private thinned = false;

  get isDegraded(): boolean {
    return this.thinned;
  }

  private readAll(): RunRecord[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
    } catch {
      return [];
    }
  }

  private writeAll(records: RunRecord[]): void {
    localStorage.setItem(KEY, JSON.stringify(records));
  }

  async saveRun(record: RunRecord): Promise<RunRecord> {
    const records = this.readAll().filter((r) => r.id !== record.id);
    records.push(this.fit(record));
    this.writeAll(records);
    return record;
  }

  async listRuns() {
    return this.readAll()
      .map(toSummary)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async loadRun(id: string): Promise<RunRecord | null> {
    return this.readAll().find((record) => record.id === id) ?? null;
  }

  async deleteRun(id: string): Promise<void> {
    this.writeAll(this.readAll().filter((record) => record.id !== id));
  }

  async exportAll(): Promise<string> {
    return exportRunJson(this.readAll());
  }

  async importAll(json: string): Promise<number> {
    const records = parseRunJson(json);
    for (const record of records) {
      await this.saveRun(record);
    }
    return records.length;
  }

  /**
   * Make a record small enough to store.
   *
   * Tries the record untouched first, and only thins it if that overflows the
   * quota — most runs are short enough to keep in full.
   */
  private fit(record: RunRecord): RunRecord {
    try {
      localStorage.setItem(`${KEY}:probe`, JSON.stringify(record));
      localStorage.removeItem(`${KEY}:probe`);
      this.thinned = false;
      return record;
    } catch {
      // Too big. Thin it, then try once more.
      const thinned = thinRecord(record);
      try {
        localStorage.setItem(`${KEY}:probe`, JSON.stringify(thinned));
        localStorage.removeItem(`${KEY}:probe`);
        this.thinned = true;
        return thinned;
      } catch {
        throw new Error(
          'This browser has no room left to save runs. Delete an old run and try again.',
        );
      }
    }
  }
}

/**
 * Reduce a run to what localStorage can hold.
 *
 * Peaks and periods are exact. The history is resampled uniformly in time, so
 * it still shows the shape of the response — it just cannot reproduce it
 * frame for frame.
 */
export function thinRecord(record: RunRecord): RunRecord {
  const points = record.result.time.length;
  if (points <= THINNED_POINTS) return record;

  const stride = Math.ceil(points / THINNED_POINTS);
  const keep = (series: number[]) => series.filter((_, index) => index % stride === 0);

  return {
    ...record,
    result: {
      ...record.result,
      time: keep(record.result.time),
      floorDisp: record.result.floorDisp.map(keep),
      groundAccel: keep(record.result.groundAccel),
      // Peaks are maxima over the WHOLE record; resampling would change them,
      // so they are carried over untouched.
      peakDisp: record.result.peakDisp,
      driftRatio: record.result.driftRatio,
      maxDisp: record.result.maxDisp,
      maxDriftRatio: record.result.maxDriftRatio,
      periodsS: record.result.periodsS,
    },
  };
}
