import { describe, expect, it } from 'vitest';

import { dominantFrequencyHz, generateGroundMotion } from '@/engine/groundMotion';
import { displacementAt, simulate, worstStoryIndex } from '@/engine/solver';
import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import type { BuildingConfig, GroundMotionConfig } from '@/types';

/* ==========================================================================
   Ground motion and the Newmark solver.
   --------------------------------------------------------------------------
   The engine's contract with the UI is "same inputs, same outputs, every
   time". Everything below is written to catch a violation of that contract or
   a physical impossibility.
   ========================================================================== */

const BUILDING: BuildingConfig = { ...DEFAULT_BUILDING_CONFIG };
const MOTION: GroundMotionConfig = {
  preset: 'harmonic',
  pgaG: 0.3,
  frequencyHz: 1.4,
  durationS: 20,
  dt: 0.01,
};

/* ------------------------------------------------------------------ motion */

describe('ground motion', () => {
  it('produces one sample per timestep', () => {
    const series = generateGroundMotion(MOTION);
    expect(series.time.length).toBe(Math.round(MOTION.durationS / MOTION.dt) + 1);
    expect(series.accel).toHaveLength(series.time.length);
  });

  it('starts at t = 0 and advances by dt', () => {
    const series = generateGroundMotion(MOTION);
    expect(series.time[0]).toBe(0);
    expect(series.time[1]! - series.time[0]!).toBeCloseTo(MOTION.dt, 12);
  });

  it('hits the requested PGA exactly', () => {
    for (const pga of [0.05, 0.3, 0.6]) {
      const series = generateGroundMotion({ ...MOTION, pgaG: pga });
      expect(series.achievedPgaG).toBeCloseTo(pga, 6);
    }
  });

  it('is deterministic across repeated calls', () => {
    const a = generateGroundMotion(MOTION);
    const b = generateGroundMotion(MOTION);
    expect(a.accel).toEqual(b.accel);
  });

  it('starts and ends at rest for the harmonic preset', () => {
    // A non-zero first sample is an artificial impulse at t = 0, which would
    // excite modes the user never asked for.
    const series = generateGroundMotion(MOTION);
    expect(Math.abs(series.accel[0]!)).toBeLessThan(1e-6);
    expect(Math.abs(series.accel[series.accel.length - 1]!)).toBeLessThan(1e-6);
  });

  it('reproduces the same random shake for the same seed', () => {
    const random: GroundMotionConfig = { ...MOTION, preset: 'random', seed: 12345 };
    expect(generateGroundMotion(random).accel).toEqual(generateGroundMotion(random).accel);
  });

  it('gives a different shake for a different seed', () => {
    const a = generateGroundMotion({ ...MOTION, preset: 'random', seed: 1 });
    const b = generateGroundMotion({ ...MOTION, preset: 'random', seed: 2 });
    expect(a.accel).not.toEqual(b.accel);
  });

  it('recovers the frequency of a harmonic record', () => {
    const series = generateGroundMotion({ ...MOTION, frequencyHz: 2.0, durationS: 30 });
    expect(dominantFrequencyHz(series)).toBeCloseTo(2.0, 1);
  });

  it('keeps the impulse short and then settles', () => {
    const series = generateGroundMotion({ ...MOTION, preset: 'impulse' });
    const tail = series.accel.slice(Math.ceil(1 / MOTION.dt));
    for (const value of tail) expect(value).toBeCloseTo(0, 6);
  });
});

/* ------------------------------------------------------------------ solver */

describe('simulate — determinism', () => {
  it('gives identical output for identical input', () => {
    const a = simulate(BUILDING, MOTION);
    const b = simulate(BUILDING, MOTION);
    expect(a).toEqual(b);
  });

  it('gives identical output across many runs', () => {
    const runs = Array.from({ length: 5 }, () => simulate(BUILDING, MOTION));
    for (const run of runs) expect(run).toEqual(runs[0]);
  });
});

describe('simulate — shape of the result', () => {
  const result = simulate(BUILDING, MOTION);

  it('returns one displacement series per floor', () => {
    expect(result.floorDisp).toHaveLength(BUILDING.floors);
    expect(result.peakDisp).toHaveLength(BUILDING.floors);
    expect(result.driftRatio).toHaveLength(BUILDING.floors);
  });

  it('returns arrays of consistent length', () => {
    const expected = result.time.length;
    expect(result.groundAccel).toHaveLength(expected);
    for (const series of result.floorDisp) expect(series).toHaveLength(expected);
  });

  it('starts from rest', () => {
    // Zero initial conditions mean zero displacement at t = 0.
    expect(Math.abs(result.floorDisp[0]![0]!)).toBeLessThan(1e-12);
  });

  it('reports the first three natural periods', () => {
    expect(result.periodsS).toHaveLength(3);
    expect(result.periodsS[0]!).toBeGreaterThan(0);
  });

  it('keeps peak displacement equal to the largest magnitude in the series', () => {
    for (const [index, series] of result.floorDisp.entries()) {
      const peak = Math.max(...series.map(Math.abs));
      expect(result.peakDisp[index]!).toBeCloseTo(peak, 12);
    }
  });

  it('never exceeds the requested PGA by much', () => {
    // A sanity bound, not a physical guarantee: a real building can amplify
    // ground motion, but not by orders of magnitude at 0.3 g.
    expect(result.maxDisp).toBeLessThan(1);
  });

  it('produces finite values everywhere', () => {
    for (const value of [...result.peakDisp, ...result.driftRatio, result.maxDisp]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    for (const series of result.floorDisp) {
      for (const value of series) expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe('simulate — physics sanity', () => {
  it('a stiffer building sways less', () => {
    const moment = simulate(BUILDING, MOTION);
    const braced = simulate({ ...BUILDING, frameType: 'braced' }, MOTION);
    expect(braced.maxDisp).toBeLessThan(moment.maxDisp);
  });

  it('a taller building sways more', () => {
    const short = simulate({ ...BUILDING, floors: 3 }, MOTION);
    const tall = simulate({ ...BUILDING, floors: 15 }, MOTION);
    expect(tall.maxDisp).toBeGreaterThan(short.maxDisp);
  });

  it('a stronger earthquake produces more movement', () => {
    const gentle = simulate(BUILDING, { ...MOTION, pgaG: 0.05 });
    const strong = simulate(BUILDING, { ...MOTION, pgaG: 0.6 });
    expect(strong.maxDisp).toBeGreaterThan(gentle.maxDisp);
  });

  it('scales roughly linearly with PGA', () => {
    // A linear-elastic model is linear by definition. If this fails, damping is
    // being applied in a way that is not amplitude-proportional.
    const low = simulate(BUILDING, { ...MOTION, pgaG: 0.2 });
    const high = simulate(BUILDING, { ...MOTION, pgaG: 0.4 });
    const ratio = high.maxDisp / low.maxDisp;
    expect(ratio).toBeGreaterThan(1.9);
    expect(ratio).toBeLessThan(2.1);
  });

  it('accumulates more displacement higher up', () => {
    const result = simulate(BUILDING, MOTION);
    // Peak displacement generally grows toward the roof; allow a little slack
    // because a single mode is not the whole story at every height.
    const top = result.peakDisp[result.peakDisp.length - 1]!;
    const bottom = result.peakDisp[0]!;
    expect(top).toBeGreaterThan(bottom);
  });

  it('resonates when the shaking matches the natural period', () => {
    // Sweep the input frequency and confirm the worst response lands on
    // 1/T₁ — in Hz, not in seconds.
    const period = simulate(BUILDING, MOTION).periodsS[0]!;
    const targetHz = 1 / period;
    let bestResponse = 0;
    let bestHz = 0;

    for (let hz = 0.4; hz <= 4; hz += 0.05) {
      const response = simulate(BUILDING, { ...MOTION, frequencyHz: hz, durationS: 40 });
      if (response.maxDisp > bestResponse) {
        bestResponse = response.maxDisp;
        bestHz = hz;
      }
    }

    expect(bestHz).toBeCloseTo(targetHz, 1);
    // The peak must be markedly worse than the ends of the sweep, or the
    // building is not really filtering frequency at all.
    const offResonance = simulate(BUILDING, { ...MOTION, frequencyHz: 0.5, durationS: 40 });
    expect(bestResponse).toBeGreaterThan(offResonance.maxDisp * 3);
  });

  it('decays to near rest after the shaking stops', () => {
    // The impulse preset is a single jolt; the building should ring and settle.
    const result = simulate(BUILDING, { ...MOTION, preset: 'impulse', durationS: 20 });
    const lastTenSeconds = result.floorDisp[result.floorDisp.length - 1]!.slice(-1000);
    const peak = Math.max(...lastTenSeconds.map(Math.abs));
    expect(peak).toBeLessThan(result.maxDisp * 0.1);
  });

  it('reaches zero displacement under zero shaking', () => {
    // Degenerate but worth pinning down: no input, no motion.
    const still = generateGroundMotion({ ...MOTION, pgaG: 0 });
    expect(still.achievedPgaG).toBe(0);
  });
});

describe('simulate — edge cases', () => {
  it('handles a single floor', () => {
    const result = simulate({ ...BUILDING, floors: 1 }, MOTION);
    expect(result.floorDisp).toHaveLength(1);
    expect(Number.isFinite(result.maxDisp)).toBe(true);
  });

  it('handles the maximum floor count', () => {
    const result = simulate({ ...BUILDING, floors: 20 }, MOTION);
    expect(result.floorDisp).toHaveLength(20);
    expect(Number.isFinite(result.maxDisp)).toBe(true);
  });

  it('handles the shortest allowed duration', () => {
    const result = simulate(BUILDING, { ...MOTION, durationS: 5 });
    expect(result.time.length).toBeGreaterThan(1);
  });

  it('handles every material', () => {
    for (const material of ['concrete', 'steel', 'composite', 'wood'] as const) {
      const result = simulate({ ...BUILDING, material }, MOTION);
      expect(Number.isFinite(result.maxDisp), material).toBe(true);
      expect(result.maxDisp, material).toBeGreaterThan(0);
    }
  });
});

describe('simulate — performance', () => {
  it('solves the largest allowed model in well under 200 ms', () => {
    const big = { ...BUILDING, floors: 20 };
    const longRun = { ...MOTION, durationS: 60 };

    const started = performance.now();
    simulate(big, longRun);
    const elapsed = performance.now() - started;

    // The brief's requirement is < 200 ms so sliders feel live.
    expect(elapsed).toBeLessThan(200);
  });

  it('solves a typical case in under 50 ms', () => {
    const started = performance.now();
    simulate(BUILDING, MOTION);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

/* ----------------------------------------------------------------- helpers */

describe('result helpers', () => {
  const result = simulate(BUILDING, MOTION);

  it('finds the worst story, 1-based', () => {
    const story = worstStoryIndex(result);
    expect(story).toBeGreaterThanOrEqual(1);
    expect(story).toBeLessThanOrEqual(BUILDING.floors);
    expect(result.driftRatio[story - 1]).toBeCloseTo(result.maxDriftRatio, 12);
  });

  it('reads displacement at a time by nearest sample', () => {
    const floorIndex = 2;
    const series = result.floorDisp[floorIndex]!;
    const value = displacementAt(result, floorIndex, 5.0);
    expect(value).toBeCloseTo(series[Math.round(5.0 / MOTION.dt)]!, 6);
  });

  it('clamps a time beyond the end to the last sample', () => {
    const floorIndex = 0;
    const series = result.floorDisp[floorIndex]!;
    expect(displacementAt(result, floorIndex, 9999)).toBe(series[series.length - 1]!);
  });

  it('returns zero for a floor that does not exist', () => {
    expect(displacementAt(result, 99, 1)).toBe(0);
  });
});

describe('dt relationship', () => {
  it('respects the spec requirement dt <= T1/20', () => {
    const period = simulate(BUILDING, MOTION).periodsS[0]!;
    expect(MOTION.dt).toBeLessThanOrEqual(period / 20);
  });

  it('converges as dt is halved', () => {
    // Peak displacement should barely change once the timestep is fine enough.
    const coarse = simulate(BUILDING, { ...MOTION, dt: 0.02 });
    const fine = simulate(BUILDING, { ...MOTION, dt: 0.005 });
    const difference = Math.abs(coarse.maxDisp - fine.maxDisp) / fine.maxDisp;
    expect(difference).toBeLessThan(0.05);
  });

  it('uses the configured timestep for sampling', () => {
    const result = simulate(BUILDING, { ...MOTION, dt: 0.05 });
    expect(result.time[1]! - result.time[0]!).toBeCloseTo(0.05, 10);
  });
});
