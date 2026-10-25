/**
 * Export the engineering constants to JSON for the Python reference solver.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS STEP EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * A cross-check is only meaningful if both sides model the SAME thing. If the
 * Python solver carried its own copy of the mass-per-area or damping figures,
 * any disagreement would be ambiguous: a bug in the TypeScript, or a typo in
 * the Python, or a stale copy of a number. So the constants are not copied —
 * they are exported from the single source of truth and read by the reference.
 *
 * Change a number in `engineeringAssumptions.ts`, re-run, and both sides move
 * together. `npm run validate` does that for you.
 *
 * Output: `reference/constants.json`
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FRAME_TYPES,
  GEOMETRY,
  GROUND_MOTION,
  LOAD_ASSUMPTIONS,
  MATERIALS,
  SOLVER,
  VIEWPORT,
  GRAVITY_MS2,
  DEFAULT_BUILDING,
  DEFAULT_GROUND_MOTION,
} from '@/config/engineeringAssumptions';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, 'constants.json');

/**
 * Only what the Python solver actually reads.
 *
 * Deliberately not a wholesale dump of the config: the point is that the
 * reference has no access to UI ranges (slider min/max, colour, playback
 * speed), so it cannot accidentally start depending on them.
 */
const constants = {
  /** Bumped when the shape below changes, so a stale constants.json is obvious. */
  schemaVersion: 2,
  exportedFrom: 'apps/web/src/config/engineeringAssumptions.ts',

  gravityMs2: GRAVITY_MS2,

  materials: MATERIALS,
  frameTypes: FRAME_TYPES,
  loadAssumptions: LOAD_ASSUMPTIONS,

  solver: {
    dtS: SOLVER.dtS,
    newmarkBeta: SOLVER.newmarkBeta,
    newmarkGamma: SOLVER.newmarkGamma,
    rayleighModes: SOLVER.rayleighModes,
    reportedModes: SOLVER.reportedModes,
    initialDisplacementM: SOLVER.initialDisplacementM,
    validationTolerancePct: SOLVER.validationTolerancePct,
  },

  groundMotion: {
    defaultSeed: GROUND_MOTION.defaultSeed,
    sampleDtS: GROUND_MOTION.sampleDtS,
    taperDurationS: GROUND_MOTION.taperDurationS,
    randomBandHz: GROUND_MOTION.randomBandHz,
    impulseDurationS: GROUND_MOTION.impulseDurationS,
    gToMs2: GROUND_MOTION.gToMs2,
  },

  geometry: {
    minFloors: GEOMETRY.minFloors,
    maxFloors: GEOMETRY.maxFloors,
  },

  defaults: {
    building: DEFAULT_BUILDING,
    groundMotion: DEFAULT_GROUND_MOTION,
  },

  viewport: { defaultExaggeration: VIEWPORT.defaultExaggeration },
};

writeFileSync(outputPath, `${JSON.stringify(constants, null, 2)}\n`, 'utf8');

const materialCount = Object.keys(MATERIALS).length;
const frameCount = Object.keys(FRAME_TYPES).length;
const occupancyCount = Object.keys(LOAD_ASSUMPTIONS.occupancies).length;
console.log(
  `Wrote ${outputPath}\n` +
    `  ${materialCount} materials, ${frameCount} frame types, ${occupancyCount} occupancies, ` +
    `dt = ${SOLVER.dtS} s, Newmark β=${SOLVER.newmarkBeta} γ=${SOLVER.newmarkGamma}`,
);
