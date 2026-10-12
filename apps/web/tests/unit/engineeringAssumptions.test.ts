import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DISCLAIMER_SHORT,
  FRAME_TYPES,
  GEOMETRY,
  GROUND_MOTION,
  MATERIALS,
  PLACEHOLDER_MARKER,
  SOLVER,
  type MaterialId,
} from '@/config/engineeringAssumptions';

// Vitest runs from the repo root (where vitest.config.ts lives).
const SOURCE_PATH = join(process.cwd(), 'apps/web/src/config/engineeringAssumptions.ts');

/** Pull the source text of a single `export const X = { ... };` block. */
function readBlock(source: string, name: string): string {
  const start = source.indexOf(`export const ${name}`);
  expect(start, `${name} should exist in engineeringAssumptions.ts`).toBeGreaterThan(-1);
  const end = source.indexOf('\n};', start);
  expect(end, `${name} should be a top-level object literal`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('engineeringAssumptions', () => {
  it('marks every assumed value with the required PLACEHOLDER comment', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    // Only these two blocks feed the solver directly, so only these carry the
    // review requirement. Slider ranges, durations and viewport constants are
    // product decisions fixed by the spec, not engineering assumptions.
    for (const name of ['MATERIALS', 'FRAME_TYPES'] as const) {
      const block = readBlock(source, name);
      const valueLines = block
        .split('\n')
        .map((line, index) => ({ line: line.trim(), number: index + 1 }))
        .filter(({ line }) => /^\w+:\s*-?[\d.]+\s*,/.test(line));

      expect(valueLines.length, `${name} should contain numeric values`).toBeGreaterThan(0);

      const unmarked = valueLines
        .filter(({ line }) => !line.includes('PLACEHOLDER'))
        .map(({ line }) => `${name}: ${line}`);

      expect(unmarked, `unmarked placeholders in ${name}:\n${unmarked.join('\n')}`).toEqual([]);
    }
  });

  it('exports the exact marker string the spec requires', () => {
    expect(PLACEHOLDER_MARKER).toBe('// PLACEHOLDER – needs engineer review');
  });

  it('keeps the disclaimer free of any claim of structural safety', () => {
    expect(DISCLAIMER_SHORT).toMatch(/educational simulation/i);
    expect(DISCLAIMER_SHORT).toMatch(/not a structural safety assessment/i);
  });

  it('defines all four materials with positive, plausible values', () => {
    const ids: MaterialId[] = ['concrete', 'steel', 'composite', 'wood'];
    expect(Object.keys(MATERIALS).sort()).toEqual([...ids].sort());

    for (const id of ids) {
      const m = MATERIALS[id];
      expect(m.label, `${id} needs a UI label`).toBeTruthy();
      expect(m.massPerAreaKgM2, `${id} mass per area`).toBeGreaterThan(0);
      expect(m.massPerAreaKgM2, `${id} mass per area upper bound`).toBeLessThanOrEqual(1000);
      expect(m.dampingRatio, `${id} damping ratio`).toBeGreaterThan(0);
      expect(m.dampingRatio, `${id} damping must stay within 2-5%`).toBeLessThanOrEqual(0.05);
      expect(m.periodCt, `${id} Ct`).toBeGreaterThan(0);
      expect(m.periodExponentX, `${id} exponent x`).toBeGreaterThan(0);
    }
  });

  it('keeps wood lighter than concrete, as a sanity check', () => {
    expect(MATERIALS.wood.massPerAreaKgM2).toBeLessThan(MATERIALS.concrete.massPerAreaKgM2);
  });

  it('defines both frame types, with braced stiffer than moment', () => {
    expect(Object.keys(FRAME_TYPES).sort()).toEqual(['braced', 'moment']);
    expect(FRAME_TYPES.braced.stiffnessFactor).toBeGreaterThan(FRAME_TYPES.moment.stiffnessFactor);
  });

  it('exposes geometry limits that match the spec (1-20 floors)', () => {
    expect(GEOMETRY.minFloors).toBe(1);
    expect(GEOMETRY.maxFloors).toBe(20);
  });

  it('exposes Newmark average-acceleration parameters from the spec', () => {
    expect(SOLVER.newmarkBeta).toBe(0.25);
    expect(SOLVER.newmarkGamma).toBe(0.5);
    expect(SOLVER.rayleighModes).toEqual([1, 2]);
  });

  it('keeps the timestep fine enough to resolve the slowest default building', () => {
    // The spec requires dt <= T1/20. Check it against the tallest, heaviest
    // default case we allow so a future value change cannot silently break it.
    const height = GEOMETRY.maxFloors * GEOMETRY.floorHeightM.max;
    const slowestPeriod =
      MATERIALS.concrete.periodCt * height ** MATERIALS.concrete.periodExponentX;
    expect(SOLVER.dtS).toBeLessThanOrEqual(slowestPeriod / 20);
  });

  it('uses the PGA range from the spec (0.05-0.6 g)', () => {
    expect(GROUND_MOTION.pgaG.min).toBe(0.05);
    expect(GROUND_MOTION.pgaG.max).toBe(0.6);
  });
});
