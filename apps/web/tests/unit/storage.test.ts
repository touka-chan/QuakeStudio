import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { simulate } from '@/engine/solver';
import { EXPORT_FORMAT, isPartialImport, parseRunJson, RunImportError } from '@/lib/runJson';
import { LocalRunStorage, thinRecord } from '@/storage/localRunStorage';
import { createRunRecord, toSummary } from '@/storage/types';
import { APP_VERSION, type RunRecord } from '@/types';

/* ==========================================================================
   Phase 4 — persistence and run transfer.
   --------------------------------------------------------------------------
   The MVP has no server, so a saved run travels as JSON. That makes
   validation the load-bearing part: a file may be hand-edited, truncated, or
   simply the wrong file entirely, and importing half of it would be worse than
   rejecting it.
   ========================================================================= */

const MOTION = {
  preset: 'harmonic' as const,
  pgaG: 0.3,
  frequencyHz: 1.4,
  durationS: 5,
  dt: 0.01,
};

function makeRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  const result = simulate(DEFAULT_BUILDING_CONFIG, MOTION);
  return {
    ...createRunRecord({
      building: DEFAULT_BUILDING_CONFIG,
      motion: MOTION,
      result,
      appVersion: APP_VERSION,
    }),
    ...overrides,
  };
}

describe('run records', () => {
  it('gets an id and a timestamp', () => {
    const record = makeRecord();
    expect(record.id).toMatch(/^run-/);
    expect(Date.parse(record.createdAt)).not.toBeNaN();
  });

  it('summarises for the list view', () => {
    const record = makeRecord();
    const summary = toSummary(record);
    expect(summary.name).toBe(record.building.name);
    expect(summary.floors).toBe(record.building.floors);
    expect(summary.maxDisp).toBe(record.result.maxDisp);
  });
});

describe('export / import round trip', () => {
  it('survives a round trip unchanged', () => {
    const record = makeRecord();
    const json = JSON.stringify({
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      runs: [record],
    });

    const [restored] = parseRunJson(json);

    // Everything but two documented JSON quirks must match exactly.
    //
    // 1. `dampingRatio: undefined` is dropped — JSON has no undefined.
    // 2. JSON has no negative zero, so `-0` reloads as `0`. They compare
    //    equal numerically and format identically, so nothing downstream can
    //    tell the difference. Worth knowing rather than being surprised by.
    expect(restored.id).toBe(record.id);
    expect(restored.createdAt).toBe(record.createdAt);
    expect(restored.appVersion).toBe(record.appVersion);
    expect(restored.motion).toEqual(record.motion);
    expect(restored.result.periodsS).toEqual(record.result.periodsS);
    expect(restored.result.peakDisp).toEqual(record.result.peakDisp);
    expect(restored.building).toEqual(record.building);

    for (const [index, series] of record.result.floorDisp.entries()) {
      const restoredSeries = restored.result.floorDisp[index]!;
      expect(restoredSeries.length).toBe(series.length);
      series.forEach((value, i) => {
        expect(restoredSeries[i]! + 0).toBe(value + 0); // `+0` normalises -0
      });
    }
  });

  it('round-trips several runs', () => {
    const runs = [makeRecord(), makeRecord(), makeRecord()];
    const json = JSON.stringify({
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      runs,
    });
    expect(parseRunJson(json)).toHaveLength(3);
  });
});

describe('import rejects bad input', () => {
  const wrap = (runs: unknown, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      runs,
      ...extra,
    });

  it('rejects text that is not JSON at all', () => {
    expect(() => parseRunJson('this is not json')).toThrow(/not valid JSON/i);
  });

  it('rejects a file that is not a QuakeStudio export', () => {
    expect(() => parseRunJson(JSON.stringify({ hello: 'world' }))).toThrow(
      /not exported from QuakeStudio/i,
    );
  });

  it('rejects a file from a newer format version', () => {
    const json = JSON.stringify({
      format: EXPORT_FORMAT,
      version: 99,
      runs: [makeRecord()],
    });
    expect(() => parseRunJson(json)).toThrow(/newer version/i);
  });

  it('rejects an empty run list', () => {
    expect(() => parseRunJson(wrap([]))).toThrow(/no runs/i);
  });

  it('rejects a run missing required fields', () => {
    const broken = { ...makeRecord(), building: undefined };
    expect(() => parseRunJson(wrap([broken]))).toThrow(RunImportError);
  });

  it('rejects a run whose floors are out of range', () => {
    const broken = makeRecord();
    broken.building = { ...broken.building, floors: 500 };
    expect(() => parseRunJson(wrap([broken]))).toThrow(/none of the 1 runs/i);
  });

  it('writes NOTHING when every run is bad', () => {
    const broken = { ...makeRecord(), building: undefined };
    // A PartialImportError would mean something was accepted; we want none.
    let thrown: unknown;
    try {
      parseRunJson(wrap([broken]));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RunImportError);
    expect(isPartialImport(thrown)).toBe(false);
  });

  it('keeps the good runs when only some are bad, and says so', () => {
    const good = makeRecord();
    const bad = makeRecord();
    bad.building = { ...bad.building, floors: 500 };

    let thrown: unknown;
    try {
      parseRunJson(wrap([good, bad]));
    } catch (error) {
      thrown = error;
    }

    expect(isPartialImport(thrown)).toBe(true);
    if (!isPartialImport(thrown)) throw new Error('expected a partial import');
    expect(thrown.accepted).toHaveLength(1);
    expect(thrown.accepted[0]!.id).toBe(good.id);
    expect(thrown.rejected).toHaveLength(1);
  });
});

describe('localStorage fallback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves, lists, loads and deletes', async () => {
    const storage = new LocalRunStorage();
    const record = makeRecord();

    await storage.saveRun(record);
    const runs = await storage.listRuns();
    expect(runs).toHaveLength(1);

    const loaded = await storage.loadRun(record.id);
    expect(loaded?.id).toBe(record.id);

    await storage.deleteRun(record.id);
    expect(await storage.listRuns()).toHaveLength(0);
    expect(await storage.loadRun(record.id)).toBeNull();
  });

  it('replaces a run saved twice under the same id', async () => {
    const storage = new LocalRunStorage();
    const record = makeRecord();
    await storage.saveRun(record);
    await storage.saveRun({ ...record, building: { ...record.building, name: 'renamed' } });
    expect(await storage.listRuns()).toHaveLength(1);
  });

  it('lists newest first', async () => {
    const storage = new LocalRunStorage();
    const older = makeRecord();
    const newer = makeRecord();
    older.createdAt = '2026-01-01T00:00:00.000Z';
    newer.createdAt = '2026-06-01T00:00:00.000Z';

    await storage.saveRun(older);
    await storage.saveRun(newer);

    const runs = await storage.listRuns();
    expect(runs[0]!.createdAt > runs[1]!.createdAt).toBe(true);
  });

  it('round-trips through JSON export', async () => {
    const storage = new LocalRunStorage();
    await storage.saveRun(makeRecord());

    const json = await storage.exportAll();
    expect(() => parseRunJson(json)).not.toThrow();
  });
});

describe('thinning large runs', () => {
  it('leaves small runs untouched', () => {
    const record = makeRecord();
    expect(thinRecord(record)).toBe(record);
  });

  it('shortens a large run but keeps its exact peaks', () => {
    const long = simulate(DEFAULT_BUILDING_CONFIG, { ...MOTION, durationS: 60 });
    const record = makeRecord({ result: long });

    const thinned = thinRecord(record);
    expect(thinned.result.time.length).toBeLessThan(long.time.length);

    // Peaks are maxima over the whole record; resampling would change them,
    // so they must survive thinning exactly.
    expect(thinned.result.peakDisp).toEqual(long.peakDisp);
    expect(thinned.result.maxDisp).toBe(long.maxDisp);
    expect(thinned.result.driftRatio).toEqual(long.driftRatio);
    expect(thinned.result.maxDriftRatio).toBe(long.maxDriftRatio);
    expect(thinned.result.periodsS).toEqual(long.periodsS);
  });

  it('keeps every floor at the same reduced length', () => {
    const long = simulate(DEFAULT_BUILDING_CONFIG, { ...MOTION, durationS: 60 });
    const thinned = thinRecord(makeRecord({ result: long }));

    const lengths = new Set(thinned.result.floorDisp.map((s) => s.length));
    expect(lengths.size).toBe(1);
    expect(thinned.result.groundAccel.length).toBe(thinned.result.time.length);
  });

  it('leaves time and displacement aligned', () => {
    const long = simulate(DEFAULT_BUILDING_CONFIG, { ...MOTION, durationS: 60 });
    const thinned = thinRecord(makeRecord({ result: long }));

    for (const series of thinned.result.floorDisp) {
      expect(series.length).toBe(thinned.result.time.length);
    }
  });
});
