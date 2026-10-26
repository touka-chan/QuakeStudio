import {
  FRAME_TYPES,
  GEOMETRY,
  GROUND_MOTION,
  LOAD_ASSUMPTIONS,
  MATERIALS,
  OCCUPANCY_IDS,
  SOLVER,
  type FrameTypeId,
  type MaterialId,
} from '@/config/engineeringAssumptions';
import { readStoredContent } from '@/content/storage';

/* =========================================================================
   Assumption catalogue
   -------------------------------------------------------------------------
   The "Assumptions" page, as DATA.

   Every row is read from `engineeringAssumptions.ts` at runtime rather than
   typed in beside it. That is the whole point: a hand-written table of
   assumptions is a table that eventually disagrees with the code, and nobody
   notices until an adviser quotes the wrong number to a client.

   Deriving the rows means the page cannot drift. If a coefficient changes, the
   page changes with it — or the page is wrong in the same way the engine is,
   which at least is visible in the review checklist.

   `placeholder: true` marks a value that no engineer has signed off. Nothing
   here is confirmed yet, so every engineering coefficient starts true. The
   flag exists so that flipping one off later is a deliberate, greppable act
   rather than a silent edit.
   ========================================================================= */

export type AssumptionRow = {
  /** Stable id, for tests and anchors. */
  readonly id: string;
  /** Group heading in the UI. */
  readonly group:
    'Materials' | 'Frame types' | 'Floor loads' | 'Geometry' | 'Solver' | 'Ground motion';
  readonly label: string;
  /** Already formatted for display, including the unit. */
  readonly value: string;
  /** Raw value, for the "copy for review" export and for tests. */
  readonly raw: number;
  readonly units: string;
  /** Why this value exists, or what it is doing. One sentence. */
  readonly note: string;
  /** False only once an engineer has confirmed it. */
  readonly placeholder: boolean;
};

/* ------------------------------------------------------------------ helpers */

/**
 * Format a number for display, trimming floating-point noise.
 *
 * Trailing zeros are only stripped when a decimal point is present. Stripping
 * them unconditionally turned 0.072 — rounded to 0 decimals, i.e. "0" — into
 * an empty string, which rendered as a blank cell in the table.
 */
function num(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return value.toLocaleString('en-GB');

  const text = value.toFixed(decimals);
  if (!text.includes('.')) return text;

  return text.replace(/0+$/, '').replace(/\.$/, '');
}

/* ---------------------------------------------------------------- materials */

/**
 * The coefficients that define a material, plus the shared period formula.
 * Written as data so the loop below cannot miss a material.
 *
 * Mass per unit area is NOT here: a floor's weight now comes from its own
 * loads. See LOAD_ASSUMPTIONS below and `config/floorLoads.ts`.
 */
const MATERIAL_FIELDS = [
  {
    field: 'dampingRatio',
    label: 'Damping ratio',
    units: 'fraction of critical',
    note: 'How quickly the shaking dies away after it stops.',
    decimals: 4,
  },
  {
    field: 'periodCt',
    label: 'Period coefficient (Ct)',
    units: 's/mˣ',
    note: 'Sets the building’s natural period through T₁ = Ct · Hˣ.',
    // Ct is small (0.072). Rounding it to 0 decimals renders a blank cell, so
    // the precision has to be stated per field rather than guessed.
    decimals: 4,
  },
  {
    field: 'periodExponentX',
    label: 'Period exponent (x)',
    units: '—',
    note: 'How strongly the period responds to height. The same for every material, which is probably wrong.',
    decimals: 3,
  },
] as const satisfies ReadonlyArray<{
  field: keyof (typeof MATERIALS)[MaterialId];
  label: string;
  units: string;
  note: string;
  decimals: number;
}>;

function materialRows(): AssumptionRow[] {
  const rows: AssumptionRow[] = [];

  for (const [id, material] of Object.entries(MATERIALS) as Array<
    [MaterialId, (typeof MATERIALS)[MaterialId]]
  >) {
    for (const spec of MATERIAL_FIELDS) {
      const raw = material[spec.field];
      rows.push({
        id: `material-${id}-${spec.field}`,
        group: 'Materials',
        label: `${material.label} — ${spec.label}`,
        // Damping is a fraction in the config, but reads better as a percent,
        // which is how every textbook states it.
        value: spec.field === 'dampingRatio' ? `${num(raw * 100, 2)}%` : num(raw, spec.decimals),
        raw,
        units: spec.units,
        note: spec.note,
        placeholder: true,
      });
    }
  }

  return rows;
}

/* -------------------------------------------------------------- frame types */

function frameRows(): AssumptionRow[] {
  return (
    Object.entries(FRAME_TYPES) as Array<[FrameTypeId, (typeof FRAME_TYPES)[FrameTypeId]]>
  ).map(([id, frame]) => ({
    id: `frame-${id}-stiffnessFactor`,
    group: 'Frame types',
    label: `${frame.label} — stiffness multiplier`,
    value: `${num(frame.stiffnessFactor, 2)}×`,
    raw: frame.stiffnessFactor,
    units: '× moment frame',
    note: 'Applied after the target period is set, so a braced frame ends up with a shorter period than the formula predicts.',
    placeholder: true,
  }));
}

/* -------------------------------------------------------------- floor loads */

/**
 * The load model, read from LOAD_ASSUMPTIONS.
 *
 * This group is the one the adviser asked for: it states the dead load, the
 * live-load participation factor, and the live load assumed for each use, so a
 * reviewer can check the numbers the engine multiplies together.
 */
function floorLoadRows(): AssumptionRow[] {
  const rows: AssumptionRow[] = [
    {
      id: 'load-default-dead',
      group: 'Floor loads',
      label: 'Default dead load',
      value: num(LOAD_ASSUMPTIONS.defaultDeadLoadKPa, 2),
      raw: LOAD_ASSUMPTIONS.defaultDeadLoadKPa,
      units: 'kPa',
      note: 'Slab, ceiling, finishes and services on every floor before any use is chosen.',
      placeholder: true,
    },
    {
      id: 'load-live-participation',
      group: 'Floor loads',
      label: 'Live-load participation (ψ)',
      value: `${num(LOAD_ASSUMPTIONS.liveLoadParticipation * 100, 0)}%`,
      raw: LOAD_ASSUMPTIONS.liveLoadParticipation,
      units: 'of live load counted',
      note: 'Only this fraction of the live load is counted as earthquake weight. At 0% a floor weighs only its dead load; at 100% the full live load is counted.',
      placeholder: true,
    },
  ];

  for (const occupancy of OCCUPANCY_IDS) {
    const assumption = LOAD_ASSUMPTIONS.occupancies[occupancy];
    if (occupancy === 'custom') continue; // Custom has no preset of its own.
    rows.push({
      id: `load-live-${occupancy}`,
      group: 'Floor loads',
      label: `${assumption.label} — live load`,
      value: num(assumption.liveKPa, 2),
      raw: assumption.liveKPa,
      units: 'kPa',
      note: assumption.description,
      placeholder: true,
    });
  }

  return rows;
}

/* ---------------------------------------------------------------- geometry */

function geometryRows(): AssumptionRow[] {
  return [
    {
      id: 'geometry-min-floors',
      group: 'Geometry',
      label: 'Minimum floors',
      value: String(GEOMETRY.minFloors),
      raw: GEOMETRY.minFloors,
      units: 'floors',
      note: 'Lower limit offered by the floors control.',
      placeholder: true,
    },
    {
      id: 'geometry-max-floors',
      group: 'Geometry',
      label: 'Maximum floors',
      value: String(GEOMETRY.maxFloors),
      raw: GEOMETRY.maxFloors,
      units: 'floors',
      note: 'Upper limit offered by the floors control. Also the largest model the solver is sized for.',
      placeholder: true,
    },
    {
      id: 'geometry-floor-height',
      group: 'Geometry',
      label: 'Default floor height',
      value: num(GEOMETRY.floorHeightM.default, 1),
      raw: GEOMETRY.floorHeightM.default,
      units: 'm',
      note: 'Starting height for each storey. Interstory drift is measured against it.',
      placeholder: true,
    },
  ];
}

/* ------------------------------------------------------------------ solver */

function solverRows(): AssumptionRow[] {
  return [
    {
      id: 'solver-dt',
      group: 'Solver',
      label: 'Integration timestep',
      value: num(SOLVER.dtS, 3),
      raw: SOLVER.dtS,
      units: 's',
      note: 'Fixed by the specification. The integrator is unconditionally stable, so this affects accuracy and speed, never stability.',
      placeholder: true,
    },
    {
      id: 'solver-newmark-beta',
      group: 'Solver',
      label: 'Newmark β',
      value: num(SOLVER.newmarkBeta, 2),
      raw: SOLVER.newmarkBeta,
      units: '—',
      note: 'β = ¼, γ = ½ gives the average-acceleration method: stable, and free of the artificial damping that hides high-frequency ringing.',
      placeholder: false,
    },
    {
      id: 'solver-newmark-gamma',
      group: 'Solver',
      label: 'Newmark γ',
      value: num(SOLVER.newmarkGamma, 2),
      raw: SOLVER.newmarkGamma,
      units: '—',
      note: 'Paired with β above. See the derivation in the engine README.',
      placeholder: false,
    },
    {
      id: 'solver-validation-tolerance',
      group: 'Solver',
      label: 'Validation tolerance (spec)',
      value: num(SOLVER.validationTolerancePct, 0),
      raw: SOLVER.validationTolerancePct,
      units: '%',
      note: 'The specification’s target for agreement with a real structure. Not the threshold used for the TypeScript-vs-Python check — see the validation report.',
      placeholder: true,
    },
  ];
}

/* ----------------------------------------------------------- ground motion */

function motionRows(): AssumptionRow[] {
  return [
    {
      id: 'motion-default-pga',
      group: 'Ground motion',
      label: 'Default shaking strength',
      value: num(GROUND_MOTION.pgaG.default, 2),
      raw: GROUND_MOTION.pgaG.default,
      units: 'g',
      note: 'Peak ground acceleration at the strongest moment of the shake.',
      placeholder: true,
    },
    {
      id: 'motion-default-frequency',
      group: 'Ground motion',
      label: 'Default shaking frequency',
      value: num(GROUND_MOTION.frequencyHz.default, 1),
      raw: GROUND_MOTION.frequencyHz.default,
      units: 'Hz',
      note: 'How fast the ground shakes back and forth. Close to the default building’s own frequency, so the first thing a student sees is resonance.',
      placeholder: true,
    },
    {
      id: 'motion-taper',
      group: 'Ground motion',
      label: 'Start/end taper',
      value: num(GROUND_MOTION.taperDurationS, 2),
      raw: GROUND_MOTION.taperDurationS,
      units: 's',
      note: 'The shake fades in and out rather than stopping abruptly, which would knock the building for no physical reason.',
      placeholder: false,
    },
    {
      id: 'motion-band',
      group: 'Ground motion',
      label: 'Random-motion band',
      value: `${num(GROUND_MOTION.randomBandHz.low, 1)}–${num(GROUND_MOTION.randomBandHz.high, 1)}`,
      raw: GROUND_MOTION.randomBandHz.high,
      units: 'Hz',
      note: 'The random preset sums sinusoids inside this band, so it resembles a shallow record rather than white noise.',
      placeholder: true,
    },
    {
      id: 'motion-impulse',
      group: 'Ground motion',
      label: 'Impulse duration',
      value: num(GROUND_MOTION.impulseDurationS, 2),
      raw: GROUND_MOTION.impulseDurationS,
      units: 's',
      note: 'How long the single sharp jolt lasts before the building is left ringing freely.',
      placeholder: false,
    },
  ];
}

/* ------------------------------------------------------------------- export */

/** Every assumption the model uses, grouped and ready to render. */
export const BASE_ASSUMPTIONS: readonly AssumptionRow[] = [
  ...materialRows(),
  ...frameRows(),
  ...floorLoadRows(),
  ...geometryRows(),
  ...solverRows(),
  ...motionRows(),
];

export const ASSUMPTION_GROUPS = [
  'Materials',
  'Frame types',
  'Floor loads',
  'Geometry',
  'Solver',
  'Ground motion',
] as const;

const storedAssumptionReview = readStoredContent()?.assumptionReview;

/** The catalogue the UI renders, with any admin review overrides applied. */
export const ASSUMPTIONS: readonly AssumptionRow[] = BASE_ASSUMPTIONS.map((row) => ({
  ...row,
  placeholder: storedAssumptionReview?.placeholder[row.id] ?? row.placeholder,
  note: storedAssumptionReview?.notes[row.id] ?? row.note,
}));

/** How many values are still waiting on an engineer. */
export function placeholderCount(): number {
  return ASSUMPTIONS.filter((row) => row.placeholder).length;
}

/**
 * The catalogue as markdown, for handing to the engineering adviser.
 *
 * Generated rather than maintained, so the copy a reviewer works from is
 * guaranteed to be the numbers the engine actually runs on.
 */
export function assumptionsMarkdown(): string {
  const lines: string[] = [
    '# QuakeStudio — engineering assumptions',
    '',
    '> Every value below is a **placeholder pending review by a civil/structural',
    '> engineer**. This file is generated from',
    '> `apps/web/src/config/engineeringAssumptions.ts`, which is the single source',
    '> of truth the simulation runs on.',
    '',
    `**${placeholderCount()} of ${ASSUMPTIONS.length}** listed values are awaiting review.`,
    '',
  ];

  for (const group of ASSUMPTION_GROUPS) {
    const rows = ASSUMPTIONS.filter((row) => row.group === group);
    if (rows.length === 0) continue;

    lines.push(`## ${group}`, '');
    lines.push('| Assumption | Value | Status | Notes |');
    lines.push('|---|---|---|---|');
    for (const row of rows) {
      const status = row.placeholder ? '☐ needs review' : '☑ fixed by method';
      lines.push(`| ${row.label} | \`${row.value}\` ${row.units} | ${status} | ${row.note} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    'A ☐ means no engineer has signed the value off. ☑ marks a choice that is a',
    'property of the numerical method rather than of the building, so there is',
    'nothing for an engineer to confirm.',
  );
  lines.push('');

  return lines.join('\n');
}

/** Suggested filename for the exported review copy. */
export function assumptionsFilename(): string {
  return 'quakestudio-assumptions.md';
}
