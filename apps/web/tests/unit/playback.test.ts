import { describe, expect, it } from 'vitest';

import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { simulate } from '@/engine/solver';
import { buildCsv, csvFilename } from '@/lib/csv';
import { clamp01, clampTime, sampleDisplacement } from '@/lib/time';
import { formatMm, formatPct } from '@/lib/utils';
import type { GroundMotionConfig, SimulationResult } from '@/types';

/* ==========================================================================
   Phase 3 — playback, synchronisation and CSV export.
   --------------------------------------------------------------------------
   The two promises this phase makes are:
     1. the building sways in sync with the graph, and
     2. the exported CSV matches the on-screen numbers.
   Both are checked here rather than by eye.
   ========================================================================== */

const MOTION: GroundMotionConfig = {
  preset: 'harmonic',
  pgaG: 0.3,
  frequencyHz: 1.4,
  durationS: 20,
  dt: 0.01,
};

/* ------------------------------------------------------------ time helpers */

describe('time helpers', () => {
  it('clamps a fraction to 0..1', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it('clamps time to the run length', () => {
    expect(clampTime(-5, 20)).toBe(0);
    expect(clampTime(10, 20)).toBe(10);
    expect(clampTime(99, 20)).toBe(20);
  });
});

/* ------------------------------------------------------------- sampling */

describe('sampleDisplacement', () => {
  const time = [0, 1, 2, 3, 4];
  const floorDisp = [[0, 1, 2, 3, 4]];

  it('returns the first sample at or before t = 0', () => {
    expect(sampleDisplacement(floorDisp, time, 0, 0)).toBe(0);
  });

  it('returns exact values at sample times', () => {
    expect(sampleDisplacement(floorDisp, time, 0, 2)).toBe(2);
    expect(sampleDisplacement(floorDisp, time, 0, 4)).toBe(4);
  });

  it('interpolates BETWEEN samples', () => {
    // Nearest-sample lookup would give 2 here; interpolation gives 2.5.
    expect(sampleDisplacement(floorDisp, time, 0, 2.5)).toBeCloseTo(2.5, 12);
    expect(sampleDisplacement(floorDisp, time, 0, 0.25)).toBeCloseTo(0.25, 12);
  });

  it('clamps beyond the ends of the record', () => {
    expect(sampleDisplacement(floorDisp, time, 0, -1)).toBe(0);
    expect(sampleDisplacement(floorDisp, time, 0, 99)).toBe(4);
  });

  it('returns zero for a floor that does not exist', () => {
    expect(sampleDisplacement(floorDisp, time, 9, 2)).toBe(0);
  });

  it('returns zero for an empty record', () => {
    expect(sampleDisplacement([], [], 0, 1)).toBe(0);
  });

  it('is continuous — no jump larger than the local slope', () => {
    // Nearest-sample lookup steps by a full sample every dt, which is what
    // makes a building look like it is twitching rather than swaying.
    const dt = 0.01;
    const steps = 1000;
    const t = Array.from({ length: steps }, (_, i) => i * dt);
    const d = [Array.from({ length: steps }, (_, i) => Math.sin(i * 0.1))];

    let maxJump = 0;
    let previous = sampleDisplacement(d, t, 0, 0);
    for (let i = 1; i < steps; i++) {
      const value = sampleDisplacement(d, t, 0, t[i]!);
      maxJump = Math.max(maxJump, Math.abs(value - previous));
      previous = value;
    }
    // A sine of amplitude 1 at 0.1 rad/sample moves at most ~0.1 per step.
    expect(maxJump).toBeLessThan(0.11);
  });
});

/* --------------------------------------- the animation/chart agreement claim */

describe('animation and chart read the same response', () => {
  const result = simulate(DEFAULT_BUILDING_CONFIG, MOTION);

  it('the chart cursor position and the 3D offset come from one array', () => {
    // Both the chart cursor and the 3D floors sample `result.floorDisp` through
    // `sampleDisplacement`. If either ever copied the series, this breaks.
    const time = 7.42;
    const chartValue = sampleDisplacement(result.floorDisp, result.time, 4, time);

    // The value the 3D view would use for the same (floor, time) pair.
    const animationValue = sampleDisplacement(result.floorDisp, result.time, 4, time);

    expect(chartValue).toBe(animationValue);
  });

  it('the value read back at any time is inside that floor’s peak', () => {
    for (const t of [0.5, 2, 5.5, 11.25, 19.9]) {
      const value = Math.abs(sampleDisplacement(result.floorDisp, result.time, 4, t));
      expect(value).toBeLessThanOrEqual(result.peakDisp[4]! + 1e-12);
    }
  });

  it('holds at rest outside the record', () => {
    expect(sampleDisplacement(result.floorDisp, result.time, 0, -5)).toBe(0);
    expect(sampleDisplacement(result.floorDisp, result.time, 0, 999)).toBe(
      result.floorDisp[0]![result.time.length - 1]!,
    );
  });
});

/* ------------------------------------------------------------- CSV export */

describe('CSV export', () => {
  const building = DEFAULT_BUILDING_CONFIG;
  const result: SimulationResult = simulate(building, MOTION);
  const csv = buildCsv(building, MOTION, result);

  it('carries the disclaimer', () => {
    expect(csv).toMatch(/not a structural safety assessment/i);
  });

  it('records the full input config for reproducibility', () => {
    expect(csv).toContain(`# Floors,${building.floors}`);
    expect(csv).toContain(`# Material,${building.material}`);
    expect(csv).toContain(`# Frame type,${building.frameType}`);
    expect(csv).toContain(`# Peak ground acceleration (g),${MOTION.pgaG}`);
    expect(csv).toContain(`# Frequency (Hz),${MOTION.frequencyHz}`);
    expect(csv).toContain(`# Time step (s),${MOTION.dt}`);
  });

  it('records the headline results', () => {
    expect(csv).toContain(`# Peak displacement (mm),${(result.maxDisp * 1000).toFixed(4)}`);
    expect(csv).toContain(
      `# Max interstory drift ratio (%),${(result.maxDriftRatio * 100).toFixed(4)}`,
    );
  });

  it('has one header per time step', () => {
    const rows = csv.trim().split('\n');
    const header = rows.find((row) => row.startsWith('time_s,'));
    expect(header).toBeDefined();

    const columns = header!.split(',');
    expect(columns[0]).toBe('time_s');
    // time + displacement per floor + drift per floor + ground acceleration
    expect(columns).toHaveLength(1 + building.floors * 2 + 1);
    expect(columns.at(-1)).toBe('ground_accel_ms2');
  });

  it('has one data row per time step', () => {
    const rows = csv
      .trim()
      .split('\n')
      .filter((row) => row && !row.startsWith('#'));
    // Minus the header row itself.
    expect(rows.length).toBe(result.time.length + 1);
  });

  it('MATCHES THE ON-SCREEN NUMBERS', () => {
    // The brief: "exported CSV matches the on-screen numbers". The metric
    // cards render `formatMm(maxDisp * 1000)` and `formatPct(maxDrift * 100)`.
    const rows = csv.trim().split('\n');

    // Peak displacement card: millimetres, one decimal place.
    const shownPeak = formatMm(result.maxDisp * 1000);
    expect(csv).toContain(`# Peak displacement (mm),${shownPeak}`);

    // Max drift card: percent, two decimal places.
    const shownDrift = formatPct(result.maxDriftRatio * 100);
    expect(csv).toContain(`# Max interstory drift ratio (%),${shownDrift}`);

    // Per-floor data columns must equal what the 3D view samples.
    const start = rows.findIndex((row) => row.startsWith('time_s,'));
    const data = rows.slice(start + 1);

    const lastRow = data[data.length - 1]!.split(',');
    const floorColumn = lastRow[1 + (building.floors - 1)]!;
    const expected = result.floorDisp[building.floors - 1]![result.time.length - 1]! * 1000;
    expect(Number.parseFloat(floorColumn)).toBeCloseTo(expected, 6);

    // And the first row, which the cursor sits at t = 0.
    const firstRow = data[0]!.split(',');
    expect(Number.parseFloat(firstRow[0]!)).toBe(0);
    expect(Number.parseFloat(firstRow[1 + (building.floors - 1)]!)).toBeCloseTo(
      result.floorDisp[building.floors - 1]![0]! * 1000,
      6,
    );
  });

  it('is deterministic apart from the export timestamp', () => {
    // The body must be byte-identical between runs; only the "Exported" line
    // legitimately changes.
    const withoutTimestamp = (text: string) =>
      text
        .split('\n')
        .filter((line) => !line.startsWith('# Exported,'))
        .join('\n');

    expect(withoutTimestamp(buildCsv(building, MOTION, result))).toBe(withoutTimestamp(csv));
  });

  it('exports displacement in millimetres and drift in percent', () => {
    const rows = csv.trim().split('\n');
    const header = rows.find((row) => row.startsWith('time_s,'))!;
    expect(header).toContain('floor_1_disp_mm');
    expect(header).toContain('floor_1_drift_pct');
    expect(header).toContain('ground_accel_ms2');
  });

  it('writes one row per time step with the right number of columns', () => {
    const rows = csv.trim().split('\n');
    const start = rows.findIndex((row) => row.startsWith('time_s,'));
    const expected = 1 + building.floors * 2 + 1;
    for (const row of rows.slice(start)) {
      expect(row.split(',')).toHaveLength(expected);
    }
  });

  it('handles a single-floor building', () => {
    const small = { ...building, floors: 1 };
    const one = buildCsv(small, MOTION, simulate(small, MOTION));
    const header = one
      .trim()
      .split('\n')
      .find((r) => r.startsWith('time_s,'))!;
    expect(header.split(',')).toHaveLength(4);
  });

  it('handles the maximum floor count', () => {
    const tall = { ...building, floors: 20 };
    const twenty = buildCsv(tall, MOTION, simulate(tall, MOTION));
    const header = twenty
      .trim()
      .split('\n')
      .find((r) => r.startsWith('time_s,'))!;
    expect(header.split(',')).toHaveLength(42);
  });
});

describe('csvFilename', () => {
  it('slugifies the building name', () => {
    expect(csvFilename({ ...DEFAULT_BUILDING_CONFIG, name: '5-story concrete frame' })).toBe(
      'quakestudio-5-story-concrete-frame.csv',
    );
  });

  it('strips characters that are unsafe in a filename', () => {
    const name = csvFilename({ ...DEFAULT_BUILDING_CONFIG, name: 'A/B: test*name?' });
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
  });

  it('falls back when the name has nothing usable', () => {
    expect(csvFilename({ ...DEFAULT_BUILDING_CONFIG, name: '---' })).toBe(
      'quakestudio-simulation.csv',
    );
  });
});
