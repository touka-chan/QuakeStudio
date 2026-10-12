import { describe, expect, it } from 'vitest';

import { DEFAULT_BUILDING } from '@/config/engineeringAssumptions';
import { BUILDING_TEMPLATES, DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { generateMockResult } from '@/mock/mockResult';
import { DRIFT_BANDS, driftBand } from '@/lib/driftScale';
import {
  buildingConfigSchema,
  runRecordSchema,
  validateBuilding,
  validateMotion,
  type GroundMotionConfig,
} from '@/types';

/* ==========================================================================
   Phase 1 — data model, templates and the mock generator.
   ========================================================================== */

describe('building templates', () => {
  it('all validate against the schema', () => {
    for (const tpl of BUILDING_TEMPLATES) {
      const candidate = { id: tpl.id, name: tpl.label, ...tpl.building };
      expect(validateBuilding(candidate), `template ${tpl.id}`).toEqual([]);
    }
  });

  it('every template carries a student-friendly description', () => {
    for (const tpl of BUILDING_TEMPLATES) {
      expect(tpl.description.length, `${tpl.id} needs a description`).toBeGreaterThan(20);
      // A description that reads as a spec line is not student-friendly.
      expect(tpl.description, `${tpl.id}`).not.toMatch(/^[A-Z]+\d/);
    }
  });

  it('template ids are unique', () => {
    const ids = BUILDING_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the floors the brief asks to be easy to try', () => {
    const floorCounts = BUILDING_TEMPLATES.map((t) => t.building.floors);
    for (const floors of [3, 5, 10, 15]) {
      expect(floorCounts).toContain(floors);
    }
  });

  it('the default config matches the 5-story concrete template', () => {
    expect(DEFAULT_BUILDING_CONFIG.floors).toBe(DEFAULT_BUILDING.floors);
    expect(DEFAULT_BUILDING_CONFIG.material).toBe(DEFAULT_BUILDING.material);
  });
});

describe('validation', () => {
  it('rejects a floor count outside the allowed range, in plain language', () => {
    const issues = validateBuilding({ ...DEFAULT_BUILDING_CONFIG, floors: 50 });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe('floors');
    expect(issues[0]!.message).toMatch(/20 or fewer/i);
  });

  it('rejects a non-integer floor count', () => {
    const issues = validateBuilding({ ...DEFAULT_BUILDING_CONFIG, floors: 4.5 });
    expect(issues[0]!.message).toMatch(/whole number/i);
  });

  it('rejects a PGA outside the brief range', () => {
    const motion = { preset: 'harmonic', pgaG: 0.9, durationS: 20, dt: 0.01 };
    const issues = validateMotion(motion);
    expect(issues[0]!.field).toBe('pgaG');
    expect(issues[0]!.message).toMatch(/0\.6 g or less/i);
  });

  it('accepts a well-formed config', () => {
    expect(validateBuilding(DEFAULT_BUILDING_CONFIG)).toEqual([]);
  });

  it('names the offending field for nested problems', () => {
    const result = buildingConfigSchema.safeParse({ ...DEFAULT_BUILDING_CONFIG, floors: 'many' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toContain('floors');
  });
});

describe('run record schema', () => {
  it('round-trips a full record', () => {
    const building = DEFAULT_BUILDING_CONFIG;
    const motion = {
      preset: 'harmonic',
      pgaG: 0.3,
      frequencyHz: 1.4,
      durationS: 20,
      dt: 0.01,
    } satisfies GroundMotionConfig;
    const result = generateMockResult(building, motion);

    const record = {
      id: 'run-1',
      createdAt: new Date().toISOString(),
      building,
      motion,
      result,
      appVersion: '0.1.0',
    };

    expect(runRecordSchema.safeParse(record).success).toBe(true);
  });
});

/* ========================================================================== */

describe('drift scale', () => {
  it('maps a zero drift to the lowest band', () => {
    expect(driftBand(0).token).toBe(DRIFT_BANDS[0]!.token);
  });

  it('maps a very large drift to the highest band', () => {
    expect(driftBand(0.5).token).toBe(DRIFT_BANDS[DRIFT_BANDS.length - 1]!.token);
  });

  it('is monotonic: a bigger drift never lands in a lower band', () => {
    let previous = -1;
    for (let ratio = 0; ratio < 0.02; ratio += 0.0002) {
      const index = DRIFT_BANDS.indexOf(driftBand(ratio));
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });

  it('has no gaps or overlaps between bands', () => {
    for (let i = 1; i < DRIFT_BANDS.length; i++) {
      expect(DRIFT_BANDS[i]!.max).toBeGreaterThan(DRIFT_BANDS[i - 1]!.max);
    }
  });

  it('never labels a band with safety language', () => {
    for (const band of DRIFT_BANDS) {
      expect(`${band.label} ${band.note}`).not.toMatch(/safe|unsafe|danger|fail|collapse/i);
    }
  });
});

/* ========================================================================== */

describe('mock result generator (Phase 1 placeholder)', () => {
  const building = DEFAULT_BUILDING_CONFIG;
  const motion = {
    preset: 'harmonic',
    pgaG: 0.3,
    frequencyHz: 1.4,
    durationS: 20,
    dt: 0.01,
  } as const;

  it('returns one displacement series per floor', () => {
    const result = generateMockResult(building, motion);
    expect(result.floorDisp).toHaveLength(building.floors);
    expect(result.peakDisp).toHaveLength(building.floors);
    expect(result.driftRatio).toHaveLength(building.floors);
  });

  it('produces arrays of consistent length', () => {
    const result = generateMockResult(building, motion);
    const expected = result.time.length;
    expect(result.floorDisp.every((s) => s.length === expected)).toBe(true);
    expect(result.groundAccel).toHaveLength(expected);
  });

  it('is deterministic: the same input gives the same output', () => {
    const a = generateMockResult(building, motion);
    const b = generateMockResult(building, motion);
    expect(a).toEqual(b);
  });

  it('peak displacement equals the largest magnitude in the series', () => {
    const result = generateMockResult(building, motion);
    for (const [index, series] of result.floorDisp.entries()) {
      const actual = Math.max(...series.map(Math.abs));
      expect(result.peakDisp[index]).toBeCloseTo(actual, 10);
    }
  });

  it('maxDisp is the largest peak in the building', () => {
    const result = generateMockResult(building, motion);
    expect(result.maxDisp).toBeCloseTo(Math.max(...result.peakDisp), 10);
  });

  it('maxDriftRatio is the largest drift ratio', () => {
    const result = generateMockResult(building, motion);
    expect(result.maxDriftRatio).toBeCloseTo(Math.max(...result.driftRatio), 10);
  });

  it('drift ratio equals peak displacement over floor height', () => {
    const result = generateMockResult(building, motion);
    for (const [index, drift] of result.driftRatio.entries()) {
      expect(drift).toBeCloseTo(result.peakDisp[index]! / building.floorHeightM, 10);
    }
  });

  it('reports periods in ascending order', () => {
    const result = generateMockResult(building, motion);
    expect(result.periodsS).toHaveLength(3);
    for (let i = 1; i < result.periodsS.length; i++) {
      expect(result.periodsS[i]!).toBeLessThan(result.periodsS[i - 1]!);
    }
  });

  it('a stronger earthquake produces more movement', () => {
    const gentle = generateMockResult(building, { ...motion, pgaG: 0.1 });
    const strong = generateMockResult(building, { ...motion, pgaG: 0.5 });
    expect(strong.maxDisp).toBeGreaterThan(gentle.maxDisp);
  });

  it('a braced frame sways less than a moment frame', () => {
    const moment = generateMockResult(building, motion);
    const braced = generateMockResult({ ...building, frameType: 'braced' }, motion);
    expect(braced.maxDisp).toBeLessThan(moment.maxDisp);
  });

  it('handles the single-floor edge case', () => {
    const result = generateMockResult({ ...building, floors: 1 }, motion);
    expect(result.floorDisp).toHaveLength(1);
    expect(result.driftRatio).toHaveLength(1);
    expect(Number.isFinite(result.maxDisp)).toBe(true);
  });

  it('handles the maximum floor count', () => {
    const result = generateMockResult({ ...building, floors: 20 }, motion);
    expect(result.floorDisp).toHaveLength(20);
    expect(Number.isFinite(result.maxDisp)).toBe(true);
  });
});
