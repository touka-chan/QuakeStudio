import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { simulate } from '@/engine/solver';
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportRunJson,
  isPartialImport,
  parseRunJson,
  RunImportError,
} from '@/lib/runJson';
import { useConfigStore } from '@/store/configStore';
import { LocalRunStorage, thinRecord } from '@/storage/localRunStorage';
import { createRunRecord, toSummary } from '@/storage/types';
import { APP_VERSION, type RunRecord, type SimulationResult } from '@/types';

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

  it('writes version 2 with the current app version', () => {
    const bundle = JSON.parse(exportRunJson([makeRecord()])) as {
      version: number;
      appVersion: string;
      runs: RunRecord[];
    };
    expect(EXPORT_VERSION).toBe(2);
    expect(bundle.version).toBe(2);
    expect(bundle.appVersion).toBe(APP_VERSION);
    // The loads travel with the building; the weights travel with the result.
    expect(bundle.runs[0]!.building.floorLoads).toHaveLength(bundle.runs[0]!.building.floors);
    expect(bundle.runs[0]!.building.loadsEnabled).toBe(true);
    expect(bundle.runs[0]!.result.totalWeightKN).toBeGreaterThan(0);
  });

  it('migrates a v1 run to all-Office loads and leaves its weights empty', () => {
    const record = makeRecord();

    // Strip the floor-loads and weight fields that v1 did not have, then
    // re-import. The schemas fill the loads from defaults and leave weights
    // empty, which the UI reads as "not recorded".
    const oldBuilding = { ...record.building };
    delete oldBuilding.floorLoads;
    delete oldBuilding.liveLoadParticipation;
    const oldResult = { ...record.result };
    delete oldResult.floorWeightsKN;
    delete oldResult.floorDeadKN;
    delete oldResult.floorLiveCountedKN;
    delete oldResult.totalWeightKN;
    delete oldResult.floorMassesKg;

    const json = JSON.stringify({
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: '0.1.0',
      runs: [{ ...record, building: oldBuilding, result: oldResult }],
    });

    const [restored] = parseRunJson(json);
    expect(restored!.building.floorLoads).toHaveLength(record.building.floors);
    expect(
      restored!.building.floorLoads.every(
        (load) => load.occupancy === 'office' && load.deadLoadKPa === 4.8,
      ),
    ).toBe(true);
    expect(restored!.building.liveLoadParticipation).toBe(0.25);
    // A record older than the switch counted its loads; migration keeps it so.
    expect(restored!.building.loadsEnabled).toBe(true);
    expect(restored!.result.floorWeightsKN).toEqual([]);
    expect(restored!.result.floorDeadKN).toEqual([]);
    expect(restored!.result.totalWeightKN).toBe(0);
  });

  it('carries a loads-off building through the round trip', () => {
    const record = makeRecord();
    const json = JSON.stringify({
      format: EXPORT_FORMAT,
      version: 2,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      runs: [{ ...record, building: { ...record.building, loadsEnabled: false } }],
    });

    const [restored] = parseRunJson(json);
    // The switch is exactly what the receiving side must not second-guess: it
    // decides whether those weights are occupancy loads or bare structure.
    expect(restored!.building.loadsEnabled).toBe(false);
  });

  it('reads a v2 building written before the switch as loads-on', () => {
    const record = makeRecord();
    const building = { ...record.building } as { loadsEnabled?: boolean };
    delete building.loadsEnabled;

    const json = JSON.stringify({
      format: EXPORT_FORMAT,
      version: 2,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      runs: [{ ...record, building }],
    });

    const [restored] = parseRunJson(json);
    expect(restored!.building.loadsEnabled).toBe(true);
  });
});

describe('loading a saved run', () => {
  it('shows the recorded result instead of solving it again', () => {
    const record = makeRecord();
    // A v1 result: parsed defaults give it empty weights, which is exactly
    // what an old saved run has.
    const oldResult: SimulationResult = {
      ...record.result,
      floorWeightsKN: [],
      floorDeadKN: [],
      floorLiveCountedKN: [],
      totalWeightKN: 0,
      floorMassesKg: [],
    };

    useConfigStore.getState().loadRun(record.building, record.motion, oldResult);
    const state = useConfigStore.getState();

    expect(state.result).toBe(oldResult);
    expect(state.building).toBe(record.building);
    expect(state.motion).toBe(record.motion);
    expect(state.status).toBe('idle');
    expect(state.compareBuildings).toEqual([]);
    expect(state.results).toEqual([]);
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
