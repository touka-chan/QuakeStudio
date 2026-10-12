/**
 * ENGINEERING ASSUMPTIONS — SINGLE SOURCE OF TRUTH
 * ===========================================================================
 *
 * ⚠️  EVERY NUMBER IN THIS FILE IS A PLACEHOLDER PENDING ENGINEER REVIEW.
 *
 * These values make the simulation run, but they are NOT validated. A civil
 * / structural engineer adviser must review each one before any result is
 * shown to anyone as meaningful. Until then QuakeStudio is a teaching aid
 * about *how* buildings move, not a statement about whether they are safe.
 *
 * RULES FOR MAINTAINERS
 * 1. Engineering constants live HERE ONLY. Never inline a number in a
 *    component, a store, or the solver.
 * 2. Keep the `// PLACEHOLDER – needs engineer review` comment attached to
 *    every value. It is how reviewers find what to check.
 * 3. Record the decision and its source in docs/assumptions.md when a
 *    number is confirmed.
 *
 * NOTE ON UNICODE: the specification uses an en dash (–) in the marker
 * comment "PLACEHOLDER – needs engineer review". The exact string is
 * exported as PLACEHOLDER_MARKER so tests can assert it is present.
 */

/** The literal comment the spec requires next to every placeholder. */
export const PLACEHOLDER_MARKER = '// PLACEHOLDER – needs engineer review';

/** Advisory copy reused in the UI and docs. Never claim structural safety. */
export const DISCLAIMER_SHORT =
  'Educational simulation using simplified assumptions. Not a structural safety assessment.';

export const DISCLAIMER_LONG =
  'This is a learning tool, not a safety check. QuakeStudio uses a simplified model with stated assumptions. Its results say nothing about whether a real building is safe.';

/** Standard gravity. A physical constant, not an assumption. */
export const GRAVITY_MS2 = 9.80665;

// ===========================================================================
// 1. MATERIALS
// ===========================================================================

export type MaterialId = 'concrete' | 'steel' | 'composite' | 'wood';

export type MaterialAssumption = {
  /** Human label for the UI. */
  readonly label: string;
  /** Dead load per unit floor area. PLACEHOLDER – needs engineer review */
  readonly massPerAreaKgM2: number;
  /** Structural damping ratio (fraction, not percent). PLACEHOLDER – needs engineer review */
  readonly dampingRatio: number;
  /** Ct in the empirical period formula T1 = Ct * H^x. PLACEHOLDER – needs engineer review */
  readonly periodCt: number;
  /** x in the empirical period formula T1 = Ct * H^x. PLACEHOLDER – needs engineer review */
  readonly periodExponentX: number;
};

/**
 * Mass-per-area values. Concrete's 600 kg/m² is the figure given in the
 * specification; the other three are estimates in the same ballpark and
 * need confirming.
 *
 * Damping ratios sit in the 2–5% range the spec allows for. Steel and
 * composite buildings are typically the least damped, timber the most.
 */
export const MATERIALS: Record<MaterialId, MaterialAssumption> = {
  concrete: {
    label: 'Concrete',
    massPerAreaKgM2: 600, // PLACEHOLDER – needs engineer review
    dampingRatio: 0.05, // PLACEHOLDER – needs engineer review
    periodCt: 0.072, // PLACEHOLDER – needs engineer review
    periodExponentX: 0.8, // PLACEHOLDER – needs engineer review
  },
  steel: {
    label: 'Steel',
    massPerAreaKgM2: 400, // PLACEHOLDER – needs engineer review
    dampingRatio: 0.02, // PLACEHOLDER – needs engineer review
    periodCt: 0.072, // PLACEHOLDER – needs engineer review
    periodExponentX: 0.8, // PLACEHOLDER – needs engineer review
  },
  composite: {
    label: 'Composite',
    massPerAreaKgM2: 500, // PLACEHOLDER – needs engineer review
    dampingRatio: 0.03, // PLACEHOLDER – needs engineer review
    periodCt: 0.072, // PLACEHOLDER – needs engineer review
    periodExponentX: 0.8, // PLACEHOLDER – needs engineer review
  },
  wood: {
    label: 'Wood',
    massPerAreaKgM2: 250, // PLACEHOLDER – needs engineer review
    dampingRatio: 0.05, // PLACEHOLDER – needs engineer review
    periodCt: 0.072, // PLACEHOLDER – needs engineer review
    periodExponentX: 0.8, // PLACEHOLDER – needs engineer review
  },
};

// ===========================================================================
// 2. FRAME TYPES
// ===========================================================================

export type FrameTypeId = 'moment' | 'braced';

export type FrameAssumption = {
  readonly label: string;
  /**
   * Multiplier applied to story stiffness relative to the calibrated
   * moment-frame value. A braced frame is substantially stiffer laterally
   * (typically ~1.8–2.2x); 2.0 is a round placeholder pending review.
   */
  readonly stiffnessFactor: number;
};

export const FRAME_TYPES: Record<FrameTypeId, FrameAssumption> = {
  moment: {
    label: 'Moment frame',
    stiffnessFactor: 1.0, // PLACEHOLDER – needs engineer review
  },
  braced: {
    label: 'Braced frame',
    stiffnessFactor: 2.0, // PLACEHOLDER – needs engineer review
  },
};

// ===========================================================================
// 3. GEOMETRY & UI LIMITS
// ===========================================================================

export const GEOMETRY = {
  minFloors: 1, // PLACEHOLDER – needs engineer review
  maxFloors: 20, // PLACEHOLDER – needs engineer review
  floorHeightM: { min: 2.2, max: 5.0, step: 0.1, default: 3.0 },
  widthM: { min: 4, max: 40, step: 0.5, default: 14 },
  depthM: { min: 4, max: 40, step: 0.5, default: 10 },
} as const;

// ===========================================================================
// 4. SOLVER / NUMERICS
// ===========================================================================

export const SOLVER = {
  /** Integration timestep. The spec fixes this and requires dt <= T1/20. */
  dtS: 0.01, // PLACEHOLDER – needs engineer review
  /** Default simulation length. */
  defaultDurationS: 20,
  minDurationS: 5,
  maxDurationS: 60,
  /** Newmark-beta average-acceleration parameters (conditionally stable). */
  newmarkBeta: 0.25,
  newmarkGamma: 0.5,
  /** Rayleigh damping is calibrated to the damping ratio at these modes. */
  rayleighModes: [1, 2] as const,
  /** How many natural periods to report to the UI. */
  reportedModes: 3,
  /** Starting guess for a zero-displacement time history. */
  initialDisplacementM: 0,
  /** Phase 5 target: TS solver vs Python reference, percent error. */
  validationTolerancePct: 5,
} as const;

// ===========================================================================
// 5. GROUND MOTION
// ===========================================================================

export const GROUND_MOTION = {
  /** PGA range offered in the UI, in g. */
  pgaG: { min: 0.05, max: 0.6, step: 0.01, default: 0.3 },
  frequencyHz: { min: 0.2, max: 5.0, step: 0.1, default: 1.4 },
  /** g -> m/s^2. Physical constant. */
  gToMs2: GRAVITY_MS2,
  /** Deterministic default seed for the random preset. */
  defaultSeed: 20240501,
  /** Fixed step for generating ground motion, independent of solver dt. */
  sampleDtS: 0.01,
  /** Seconds of taper at each end of a harmonic pulse, to avoid a shock. */
  taperDurationS: 0.5,
  /** Band limits for the random preset, in Hz. */
  randomBandHz: { low: 0.2, high: 4.0 },
  /** Impulse duration in seconds. */
  impulseDurationS: 0.15,
} as const;

export type GroundMotionPresetId = 'harmonic' | 'random' | 'impulse';

export const GROUND_MOTION_PRESETS: Record<
  GroundMotionPresetId,
  { readonly label: string; readonly description: string }
> = {
  harmonic: {
    label: 'Harmonic pulse',
    description: 'A smooth, repeating shake at one chosen frequency. Good for seeing resonance.',
  },
  random: {
    label: 'Random shaking',
    description: 'Band-limited random motion from a fixed seed, so every run is reproducible.',
  },
  impulse: {
    label: 'Single impulse',
    description:
      'One short sharp jolt, like a nearby shock. Shows how the building rings afterwards.',
  },
};

// ===========================================================================
// 6. VIEWPORT
// ===========================================================================

export const VIEWPORT = {
  defaultExaggeration: 20,
  minExaggeration: 1,
  maxExaggeration: 60,
  exaggerationStep: 1,
  defaultGridDivisions: 40,
  groundThicknessM: 0.6,
} as const;

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

// ===========================================================================
// 7. STORAGE KEYS
// ===========================================================================

export const STORAGE_KEYS = {
  theme: 'quakestudio.theme',
  runs: 'quakestudio.runs',
  firstRunAcknowledged: 'quakestudio.firstRunAcknowledged',
  appVersion: 'quakestudio.appVersion',
} as const;

// ===========================================================================
// 8. DEFAULT BUILDING
// ===========================================================================

/** Loads on first run, and is what the comparison "Copy from A" starts from. */
export const DEFAULT_BUILDING = {
  id: 'default-5-story-concrete',
  name: '5-story concrete frame',
  floors: 5,
  floorHeightM: GEOMETRY.floorHeightM.default,
  widthM: GEOMETRY.widthM.default,
  depthM: GEOMETRY.depthM.default,
  material: 'concrete',
  frameType: 'moment',
  dampingRatio: undefined, // falls back to the material's value
} as const;

export const DEFAULT_GROUND_MOTION = {
  preset: 'harmonic',
  pgaG: GROUND_MOTION.pgaG.default,
  frequencyHz: GROUND_MOTION.frequencyHz.default,
  durationS: SOLVER.defaultDurationS,
  dt: SOLVER.dtS,
  seed: GROUND_MOTION.defaultSeed,
} as const;
