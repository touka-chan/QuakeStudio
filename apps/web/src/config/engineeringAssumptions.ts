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
  /** Structural damping ratio (fraction, not percent). PLACEHOLDER – needs engineer review */
  readonly dampingRatio: number;
  /** Ct in the empirical period formula T1 = Ct * H^x. PLACEHOLDER – needs engineer review */
  readonly periodCt: number;
  /** x in the empirical period formula T1 = Ct * H^x. PLACEHOLDER – needs engineer review */
  readonly periodExponentX: number;
};

/**
 * Material properties.
 *
 * There is deliberately no mass per unit area here any more. A floor's weight
 * now comes from its own dead and live loads (see LOAD_ASSUMPTIONS and
 * `config/floorLoads.ts`), which is what lets one floor be a parking deck and
 * the next an office. Damping and the period formula are what remain genuinely
 * material-dependent.
 *
 * Damping ratios sit in the 2–5% range the spec allows for. Steel and
 * composite buildings are typically the least damped, timber the most.
 */
export const MATERIALS: Record<MaterialId, MaterialAssumption> = {
  concrete: {
    label: 'Concrete',
    dampingRatio: 0.05, // PLACEHOLDER – needs engineer review
    periodCt: 0.072, // PLACEHOLDER – needs engineer review
    periodExponentX: 0.8, // PLACEHOLDER – needs engineer review
  },
  steel: {
    label: 'Steel',
    dampingRatio: 0.02, // PLACEHOLDER – needs engineer review
    periodCt: 0.072, // PLACEHOLDER – needs engineer review
    periodExponentX: 0.8, // PLACEHOLDER – needs engineer review
  },
  composite: {
    label: 'Composite',
    dampingRatio: 0.03, // PLACEHOLDER – needs engineer review
    periodCt: 0.072, // PLACEHOLDER – needs engineer review
    periodExponentX: 0.8, // PLACEHOLDER – needs engineer review
  },
  wood: {
    label: 'Wood',
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
// 2b. FLOOR LOADS
// ===========================================================================

/**
 * What a floor is used for. The use chooses the live-load preset; the user can
 * then edit the value, which is what `custom` records.
 */
export const OCCUPANCY_IDS = ['office', 'residential', 'parking', 'storage', 'custom'] as const;
export type Occupancy = (typeof OCCUPANCY_IDS)[number];

export type OccupancyAssumption = {
  readonly label: string;
  /** Minimum uniformly distributed live load, in kPa (kN/m²). */
  readonly liveKPa: number;
  /** One line for the picker. */
  readonly description: string;
};

/**
 * FLOOR LOADS — the single source of truth for what a floor weighs.
 *
 * The model no longer takes mass from the material alone. Each floor carries a
 * dead load (the structure and finishes) and a live load (what is on it), and
 * only a fraction of the live load is counted as earthquake weight. That
 * fraction is `liveLoadParticipation`.
 *
 * ⚠️  EVERY NUMBER HERE IS A PLACEHOLDER PENDING ENGINEER REVIEW.
 * The code basis is named because the adviser asked for it, not because this
 * file has been checked against the official code.
 */
export const LOAD_ASSUMPTIONS = {
  codeBasis: 'NSCP 2015 (Philippines), which follows ASCE 7 for earthquake provisions', // PLACEHOLDER – needs engineer review
  /** Standard gravity, used to turn a weight in kN into a mass in kg. */
  gravityMs2: GRAVITY_MS2,
  /** Dead load every floor starts from: slab, ceiling, finishes and services. */
  defaultDeadLoadKPa: 4.8, // PLACEHOLDER – needs engineer review
  /** Fraction of the live load counted as earthquake weight. */
  liveLoadParticipation: 0.25, // PLACEHOLDER – needs engineer review
  minDeadLoadKPa: 0,
  maxDeadLoadKPa: 20,
  minLiveLoadKPa: 0,
  maxLiveLoadKPa: 30,
  occupancies: {
    office: {
      label: 'Office',
      liveKPa: 2.4, // PLACEHOLDER – needs engineer review
      description: 'Desks, people and light equipment.',
    },
    residential: {
      label: 'Residential',
      liveKPa: 1.9, // PLACEHOLDER – needs engineer review
      description: 'Homes: beds, sofas and household furniture.',
    },
    parking: {
      label: 'Parking',
      liveKPa: 2.4, // PLACEHOLDER – needs engineer review
      description: 'Passenger cars parked on the floor.',
    },
    storage: {
      label: 'Storage',
      liveKPa: 6.0, // PLACEHOLDER – needs engineer review
      description: 'Light stored goods, crates and shelves.',
    },
    custom: {
      label: 'Custom',
      liveKPa: 2.4, // PLACEHOLDER – needs engineer review
      description: 'Type your own live load.',
    },
  },
  /**
   * Values taken from published summaries of NSCP 2015 Table 205-1. Confirm
   * against the official code before relying on them.
   */
  sourceNote:
    'Values from published summaries of NSCP 2015 Table 205-1. Confirm against the official code.',
} as const satisfies {
  codeBasis: string;
  gravityMs2: number;
  defaultDeadLoadKPa: number;
  liveLoadParticipation: number;
  minDeadLoadKPa: number;
  maxDeadLoadKPa: number;
  minLiveLoadKPa: number;
  maxLiveLoadKPa: number;
  occupancies: Record<Occupancy, OccupancyAssumption>;
  sourceNote: string;
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
  /*
   * Keeps the welcome gate from opening. The app NEVER writes this.
   *
   * The gate is shown on every visit - the client asked for it on every restart
   * and every refresh, the same as the tour - so remembering that someone
   * acknowledged it once would be remembering how not to do that.
   *
   * This exists for the things that legitimately want the workspace without it:
   * the end-to-end suite, which would otherwise tick a checkbox before every
   * test, and anyone embedding the tool where the disclaimer has already been
   * given. Storage being unavailable leaves it false, which shows the gate.
   */
  disclaimerSuppressed: 'quakestudio.disclaimerSuppressed',
  /*
   * Suppresses the guided tour. The app NEVER writes this.
   *
   * The tour shows on every visit now — the client wants a user to meet it each
   * time they open the app, not once and then never again. So there is nothing
   * for the app to remember, and a key called "tourCompleted" that it never sets
   * would be a lie to the next person reading it.
   *
   * It exists so automated checks can turn the tour off: the responsive audit,
   * the end-to-end specs and the component tests all need the plain workspace,
   * and the tour is an overlay across the whole app. Setting this key is how
   * they say "no tour, just the app".
   */
  tourSuppressed: 'quakestudio.tourSuppressed',

  /*
   * Where the user dragged the floating "How to use" button, as JSON.
   *
   * Written by the app - unlike `tourSuppressed`. A button a user has
   * deliberately put somewhere should still be there on the next visit, or
   * moving it is a chore that repeats itself every time the page loads.
   *
   * Always clamped to the current window on the way back in, because a spot
   * chosen on a desktop is off the edge of a phone.
   */
  tourButtonPos: 'quakestudio.tourButtonPos',
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
