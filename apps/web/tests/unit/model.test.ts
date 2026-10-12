/* ==========================================================================
   Data model, templates and the drift scale.
   --------------------------------------------------------------------------
   The engine itself is covered in matrix / buildingModel / solver tests.
   ========================================================================== */

import { describe, expect, it } from 'vitest';

import { DEFAULT_BUILDING } from '@/config/engineeringAssumptions';
import { BUILDING_TEMPLATES, DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { DRIFT_BANDS, driftBand } from '@/lib/driftScale';
import { simulate } from '@/engine/solver';
import {
  buildingConfigSchema,
  runRecordSchema,
  validateBuilding,
  validateMotion,
  type GroundMotionConfig,
} from '@/types';

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
    const result = simulate(building, motion);

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
