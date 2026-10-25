import { z } from 'zod';

import {
  GEOMETRY,
  GROUND_MOTION,
  LOAD_ASSUMPTIONS,
  OCCUPANCY_IDS,
  SOLVER,
  type FrameTypeId,
  type GroundMotionPresetId,
  type MaterialId,
} from '@/config/engineeringAssumptions';
import { normalizeFloorLoads, type FloorLoadValue } from '@/config/floorLoads';

/* =========================================================================
   Shared types & Zod schemas
   -------------------------------------------------------------------------
   Zod is the single validation point. Anything that arrives from outside the
   app — a template, an imported JSON file, a saved run read back from
   IndexedDB — is parsed here before it can reach a store or the UI.

   Do NOT use TypeScript `enum` anywhere in this file: the project compiles
   with `erasableSyntaxOnly`, which exists so the TypeScript toolchain stays
   compatible with future Node type-stripping.
   ========================================================================= */

export const MATERIAL_IDS = [
  'concrete',
  'steel',
  'composite',
  'wood',
] as const satisfies readonly MaterialId[];
export const FRAME_TYPE_IDS = ['moment', 'braced'] as const satisfies readonly FrameTypeId[];
export const GROUND_MOTION_PRESET_IDS = [
  'harmonic',
  'random',
  'impulse',
] as const satisfies readonly GroundMotionPresetId[];

/* ---------------------------------------------------------------- Building */

export const occupancySchema = z.enum(OCCUPANCY_IDS);

/**
 * One floor's loads.
 *
 * `liveOverridden` records that the user typed a live load instead of taking
 * the use's preset. The use is then `custom`, which is what the badge shows.
 */
export const floorLoadSchema = z.object({
  floor: z.number().int('Floor numbers must be whole.').min(1),
  occupancy: occupancySchema,
  deadLoadKPa: z
    .number()
    .min(
      LOAD_ASSUMPTIONS.minDeadLoadKPa,
      `Dead load must be at least ${LOAD_ASSUMPTIONS.minDeadLoadKPa} kPa.`,
    )
    .max(
      LOAD_ASSUMPTIONS.maxDeadLoadKPa,
      `Dead load must be ${LOAD_ASSUMPTIONS.maxDeadLoadKPa} kPa or less.`,
    ),
  liveLoadKPa: z
    .number()
    .min(
      LOAD_ASSUMPTIONS.minLiveLoadKPa,
      `Live load must be at least ${LOAD_ASSUMPTIONS.minLiveLoadKPa} kPa.`,
    )
    .max(
      LOAD_ASSUMPTIONS.maxLiveLoadKPa,
      `Live load must be ${LOAD_ASSUMPTIONS.maxLiveLoadKPa} kPa or less.`,
    ),
  liveOverridden: z.boolean(),
});

export type FloorLoad = z.infer<typeof floorLoadSchema>;

/**
 * The shape before normalization.
 *
 * `floorLoads` and `liveLoadParticipation` are optional on the way in so that a
 * saved run or an imported file written before floor loads existed still
 * parses. The transform below fills them with all-Office defaults. Nothing
 * downstream has to handle a building without loads.
 */
const buildingConfigBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  floors: z
    .number()
    .int('Floors must be a whole number.')
    .min(GEOMETRY.minFloors, `Floors must be at least ${GEOMETRY.minFloors}.`)
    .max(GEOMETRY.maxFloors, `Floors must be ${GEOMETRY.maxFloors} or fewer.`),
  floorHeightM: z.number().min(1).max(20),
  widthM: z.number().min(2).max(200),
  depthM: z.number().min(2).max(200),
  material: z.enum(MATERIAL_IDS),
  frameType: z.enum(FRAME_TYPE_IDS),
  /** Optional override of the material's damping ratio. */
  dampingRatio: z.number().min(0.001).max(0.2).optional(),
  /** One entry per floor, lowest first. Normalized to exactly `floors`. */
  floorLoads: z.array(floorLoadSchema).optional(),
  /** Fraction of live load counted as earthquake weight, 0..1. */
  liveLoadParticipation: z.number().min(0).max(1).optional(),
  /**
   * Whether the floor loads are counted at all.
   *
   * Optional on the way in because runs written before the switch existed all
   * counted loads; absent means ON, never a weightless building. With it OFF
   * the occupancy loads are not counted at all and every floor weighs its
   * bare structure by material — see `config/floorLoads.ts`.
   */
  loadsEnabled: z.boolean().optional(),
});

export const buildingConfigSchema = buildingConfigBaseSchema.transform((value) => ({
  ...value,
  floorLoads: normalizeFloorLoads(value.floors, value.floorLoads as FloorLoadValue[] | undefined),
  liveLoadParticipation: value.liveLoadParticipation ?? LOAD_ASSUMPTIONS.liveLoadParticipation,
  // The default lives HERE, at the boundary, so an old saved run or an
  // imported file cannot produce a building whose loads silently stop being
  // counted. An explicit false is the only way a building loses its loads.
  loadsEnabled: value.loadsEnabled ?? true,
}));

export type BuildingConfig = z.infer<typeof buildingConfigSchema>;

/* ----------------------------------------------------------- Ground motion */

export const groundMotionConfigSchema = z.object({
  preset: z.enum(GROUND_MOTION_PRESET_IDS),
  pgaG: z
    .number()
    .min(GROUND_MOTION.pgaG.min, `Strength must be at least ${GROUND_MOTION.pgaG.min} g.`)
    .max(GROUND_MOTION.pgaG.max, `Strength must be ${GROUND_MOTION.pgaG.max} g or less.`),
  frequencyHz: z.number().min(0.05).max(20).optional(),
  durationS: z.number().min(SOLVER.minDurationS).max(SOLVER.maxDurationS),
  dt: z.number().positive(),
  seed: z.number().int().optional(),
});

export type GroundMotionConfig = z.infer<typeof groundMotionConfigSchema>;

/* ------------------------------------------------------------------ Result */

/**
 * A simulation result.
 *
 * `floorDisp` is indexed [floorIndex][timeIndex]. Both the 3D animation and
 * the charts read from this one array — there is deliberately no second copy,
 * so they cannot disagree.
 */
export const simulationResultSchema = z.object({
  time: z.array(z.number()),
  floorDisp: z.array(z.array(z.number())),
  /** Peak |displacement| per floor, in metres. */
  peakDisp: z.array(z.number()),
  /** Peak displacement anywhere in the structure, in metres. */
  maxDisp: z.number(),
  /** Interstory drift ratio per story (story 1 = ground to floor 1). */
  driftRatio: z.array(z.number()),
  maxDriftRatio: z.number(),
  /** First three natural periods, in seconds. */
  periodsS: z.array(z.number()),
  /** Ground acceleration input, in m/s². */
  groundAccel: z.array(z.number()),
  /**
   * Floor loads turned into weight. Stored with the result because a run is a
   * record of what was simulated, and because old runs (written before floor
   * loads existed) legitimately have none — the arrays default to empty rather
   * than inventing a weight.
   */
  floorWeightsKN: z.array(z.number()).default([]),
  floorDeadKN: z.array(z.number()).default([]),
  floorLiveCountedKN: z.array(z.number()).default([]),
  totalWeightKN: z.number().default(0),
  floorMassesKg: z.array(z.number()).default([]),
});

export type SimulationResult = z.infer<typeof simulationResultSchema>;

/* -------------------------------------------------------------- Run record */

export const APP_VERSION = '0.2.0';

export const runRecordSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  building: buildingConfigSchema,
  motion: groundMotionConfigSchema,
  result: simulationResultSchema,
  appVersion: z.string(),
});

export type RunRecord = z.infer<typeof runRecordSchema>;

/** Lightweight row for the saved-runs list. */
export type RunSummary = Pick<RunRecord, 'id' | 'createdAt' | 'appVersion'> & {
  name: string;
  floors: number;
  maxDisp: number;
  maxDriftRatio: number;
};

/* ---------------------------------------------------- Phase 7 (reserved) ---
   These fields are declared now, optional and unused, so site factors can be
   added later without reshaping stored run records. Do NOT read them in the
   UI until the client and the engineering adviser approve the formula.
   ------------------------------------------------------------------------- */

export type SiteFactors = {
  soilType?: string;
  foundationType?: string;
  faultDistanceKm?: number;
};

/* ------------------------------------------------------- Friendly errors -- */

/** One field-level problem, phrased for a student rather than a developer. */
export type FieldIssue = {
  field: string;
  message: string;
};

/**
 * Turn a Zod failure into plain-language field errors.
 *
 * Falls back to the raw message for issue types we have not special-cased, so
 * a new rule can never silently produce an empty error list.
 */
export function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => {
    const field = issue.path.join('.') || 'config';
    return { field, message: issue.message };
  });
}

/** Validate and return friendly messages. Empty array means it parsed. */
export function validateBuilding(value: unknown): FieldIssue[] {
  const parsed = buildingConfigSchema.safeParse(value);
  return parsed.success ? [] : toFieldIssues(parsed.error);
}

/** Validate and return friendly messages. Empty array means it parsed. */
export function validateMotion(value: unknown): FieldIssue[] {
  const parsed = groundMotionConfigSchema.safeParse(value);
  return parsed.success ? [] : toFieldIssues(parsed.error);
}
