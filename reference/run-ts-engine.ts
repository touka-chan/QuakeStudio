/**
 * Run the TypeScript engine over the validation matrix.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS STEP EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * The comparison is only worth anything if the TypeScript side is the code
 * that actually ships — not a re-implementation that happens to sit next to
 * it. So this imports `simulate()` from the engine directly and writes what it
 * produced.
 *
 * Output: `reference/ts-results.json`, read by `python/compare.py`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOLVER } from '@/config/engineeringAssumptions';
import { simulate } from '@/engine/solver';
import { buildingConfigSchema, type BuildingConfig, type GroundMotionConfig } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const casesPath = resolve(here, 'cases.json');
const outputPath = resolve(here, 'ts-results.json');

type CaseBuilding = Omit<BuildingConfig, 'id' | 'name' | 'floorLoads' | 'liveLoadParticipation'> & {
  floorLoads?: BuildingConfig['floorLoads'];
  liveLoadParticipation?: number;
};

type CaseFile = {
  cases: Array<{
    id: string;
    why: string;
    building: CaseBuilding;
    motion: Omit<GroundMotionConfig, 'dt' | 'seed'>;
  }>;
};

/**
 * Significant digits kept in the output.
 *
 * 15 is enough to round-trip an IEEE double, so this is a size saving and not
 * a precision one. The Python side compares against these values, so anything
 * lower would quietly cap the accuracy the comparison can report.
 */
const SIGDIGITS = 15;

function trim(values: number[]): number[] {
  return values.map((value) => Number(value.toPrecision(SIGDIGITS)));
}

const file = JSON.parse(readFileSync(casesPath, 'utf8')) as CaseFile;

const results = file.cases.map((testCase) => {
  // Parsed, not cast: this is the same schema the app uses on an imported run,
  // so a case without explicit floor loads receives the all-Office defaults
  // and the two sides are guaranteed to start from the same building.
  const building: BuildingConfig = buildingConfigSchema.parse({
    id: testCase.id,
    name: testCase.id,
    ...testCase.building,
  });

  const motion: GroundMotionConfig = {
    ...testCase.motion,
    dt: SOLVER.dtS,
    seed: undefined,
  };

  const started = performance.now();
  const result = simulate(building, motion);
  const elapsedMs = performance.now() - started;

  const topFloor = building.floors - 1;

  console.log(
    `  ${testCase.id.padEnd(42)} ` +
      `${String(building.floors).padStart(2)} floors  ` +
      `${result.periodsS[0]!.toFixed(3)} s  ` +
      `${(result.maxDriftRatio * 100).toFixed(2)}%  ` +
      `${elapsedMs.toFixed(0)} ms`,
  );

  return {
    id: testCase.id,
    why: testCase.why,
    building: testCase.building,
    motion: testCase.motion,
    solveMs: Number(elapsedMs.toFixed(3)),

    periodsS: trim(result.periodsS),
    peakDisp: trim(result.peakDisp),
    driftRatio: trim(result.driftRatio),
    maxDisp: result.maxDisp,
    maxDriftRatio: result.maxDriftRatio,
    floorWeightsKN: trim(result.floorWeightsKN),
    totalWeightKN: result.totalWeightKN,

    /**
     * Full histories, so the comparison can measure error over time rather
     * than only at peaks. Two implementations can agree on every peak while
     * being a quarter-cycle out of phase; the history is what catches that.
     */
    topFloorIndex: topFloor,
    topFloorDisp: trim(result.floorDisp[topFloor]!),
    groundAccel: trim(result.groundAccel),
  };
});

writeFileSync(
  outputPath,
  `${JSON.stringify({ schemaVersion: 2, cases: results }, null, 2)}\n`,
  'utf8',
);

console.log(`\nWrote ${outputPath} (${results.length} cases)`);
