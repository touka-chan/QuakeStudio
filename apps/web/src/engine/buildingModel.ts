import { MATERIALS, FRAME_TYPES, SOLVER } from '@/config/engineeringAssumptions';
import type { BuildingConfig } from '@/types';
import {
  cholesky,
  fromRows,
  square,
  symmetricEigen,
  type CholeskyFactor,
  type Square,
} from './matrix';

/* =========================================================================
   Structural model — mass, stiffness and damping matrices.
   -------------------------------------------------------------------------
   A regular multistory linear-elastic SHEAR BUILDING in one horizontal
   direction, with lumped mass at each floor and story stiffness between
   floors.

       M·ü + C·u̇ + K·u = −M·1·a_g(t)

   Nothing here is hard-coded: every value comes from
   `config/engineeringAssumptions.ts`, which is the single source of truth for
   the engineering numbers and the document the adviser reviews.

   ⚠️ Every coefficient below traces back to a PLACEHOLDER pending review.
   ========================================================================= */

/** The three matrices the solver needs, plus the diagnostics the UI shows. */
export type StructuralModel = {
  readonly floors: number;
  /** Lumped floor masses in kg, one per floor. */
  readonly floorMassKg: Float64Array;
  /** Story stiffness in N/m. Uniform in the MVP. */
  readonly storyStiffnessNm: number;
  readonly mass: Square;
  readonly stiffness: Square;
  readonly damping: Square;
  /** Circular frequencies ω = 2π/T, ascending. */
  readonly omega: number[];
  /** Natural periods T = 2π/ω, ascending. First 3 are reported in the UI. */
  readonly periodsS: number[];
  /** Rayleigh coefficients, kept for documentation and tests. */
  readonly rayleighA0: number;
  readonly rayleighA1: number;
  readonly dampingRatio: number;
};

/**
 * Story stiffness that produces a target fundamental period.
 *
 * The brief specifies an empirical period formula T₁ ≈ Ct · Hˣ, then asks for
 * story stiffnesses that actually deliver that period. For a uniform shear
 * building of N floors, each of mass m, joined by equal story stiffness k, the
 * first natural frequency has the closed form
 *
 *     ω₁ = 2·√(k/m) · sin( π / (2(2N+1)) )
 *
 * so, solving for k:
 *
 *     k = m·ω₁² / ( 4·sin²( π / (2(2N+1)) ) )
 *
 * The derivation is reproduced in docs/assumptions.md so the reviewer can check
 * the algebra rather than trust it.
 */
export function storyStiffnessForPeriod(
  floorMassKg: number,
  floors: number,
  targetPeriodS: number,
): number {
  if (targetPeriodS <= 0) throw new Error('Target period must be positive');
  if (floors < 1) throw new Error('Need at least one floor');

  const omega1 = (2 * Math.PI) / targetPeriodS;
  const sinTerm = Math.sin(Math.PI / (2 * (2 * floors + 1)));
  return (floorMassKg * omega1 * omega1) / (4 * sinTerm * sinTerm);
}

/** Empirical fundamental period T₁ = Ct · Hˣ, in seconds. */
export function fundamentalPeriodS(building: BuildingConfig): number {
  const material = MATERIALS[building.material];
  const heightM = building.floors * building.floorHeightM;
  return material.periodCt * heightM ** material.periodExponentX;
}

/**
 * Build the full structural model.
 *
 * Frame stiffness is applied as a multiplier AFTER the period has been
 * targeted. That means a braced frame ends up with a shorter period than
 * T₁ = Ct·Hˣ predicts — which is the point (bracing makes a building stiffer),
 * but it also means `Ct` and `x` effectively describe the moment-frame case
 * only. This is flagged as open question 3 in docs/assumptions.md.
 */
export function buildModel(building: BuildingConfig): StructuralModel {
  const n = building.floors;
  const material = MATERIALS[building.material];
  const frame = FRAME_TYPES[building.frameType];

  const floorAreaM2 = building.widthM * building.depthM;
  const floorMassKg = floorAreaM2 * material.massPerAreaKgM2;

  const massValues = new Float64Array(n).fill(floorMassKg);

  const targetPeriod = fundamentalPeriodS(building);
  const storyStiffness =
    storyStiffnessForPeriod(floorMassKg, n, targetPeriod) * frame.stiffnessFactor;

  const stiffness = buildStiffnessMatrix(n, storyStiffness);

  // ---- Natural frequencies ------------------------------------------------
  // Generalised eigenproblem K·φ = ω²·M·φ. M is diagonal with equal entries,
  // so this reduces to the symmetric problem (M⁻¹K)φ = ω²φ.
  const { reduced } = reduceByMass(stiffness, massValues, n);
  const eigen = symmetricEigen(reduced);

  const omega = eigen.values
    .map((value) => Math.sqrt(Math.max(0, value)))
    .filter((value) => value > 0);

  // omega is ascending, so periods come out DESCENDING — which is the correct
  // order to report them in: the fundamental mode has the LONGEST period, and
  // `periodsS[0]` is what the UI labels "1st mode". Do not sort these.
  const periodsS = omega.map((value) => (2 * Math.PI) / value);

  // ---- Rayleigh damping ---------------------------------------------------
  const dampingRatio = building.dampingRatio ?? material.dampingRatio;
  const { a0, a1 } = rayleighCoefficients(omega, dampingRatio, n);
  const damping = buildRayleighDamping(massValues, stiffness, a0, a1, n);

  return {
    floors: n,
    floorMassKg: massValues,
    storyStiffnessNm: storyStiffness,
    mass: diagonal(massValues),
    stiffness,
    damping,
    omega,
    periodsS,
    rayleighA0: a0,
    rayleighA1: a1,
    dampingRatio,
  };
}

/* ------------------------------------------------------------------ pieces */

/**
 * K for a uniform shear building: tridiagonal, k on each off-diagonal.
 *
 * A diagonal entry counts the stories attached to that floor. Every floor
 * except the TOP has two: one down to the floor below, one up to the floor
 * above — floor 1's lower story is the one connecting it to the ground. Only
 * the top floor has a single story beneath it, so its diagonal is k, not 2k.
 *
 * Getting the ground floor's diagonal wrong is easy and consequential: it
 * changes the fundamental period, which changes every result in the app.
 */
export function buildStiffnessMatrix(floors: number, storyStiffnessNm: number): Square {
  const { n, a } = square(floors);

  for (let i = 0; i < floors; i++) {
    const connected = i === floors - 1 ? 1 : 2;
    a[i * n + i] = connected * storyStiffnessNm;

    if (i > 0) a[i * n + (i - 1)] = -storyStiffnessNm;
    if (i < floors - 1) a[i * n + (i + 1)] = -storyStiffnessNm;
  }
  return { n, a };
}

/**
 * Rayleigh coefficients calibrated to the damping ratio at the first two modes.
 *
 *     ζ(ω) = a₀/(2ω) + a₁·ω/2
 *
 * Solving that at ω₁ and ω₂ for ζ gives
 *
 *     a₀ = 2ζω₁ω₂/(ω₁+ω₂)        a₁ = 2ζ/(ω₁+ω₂)
 *
 * A single-floor building has only one mode, so modes 1 and 2 cannot both be
 * hit. Mass-proportional damping (a₁ = 0) is used there instead, which still
 * gives exactly ζ at ω₁.
 */
export function rayleighCoefficients(
  omega: number[],
  dampingRatio: number,
  floors: number,
): { a0: number; a1: number } {
  const w1 = omega[0] ?? 0;
  if (floors < 2 || omega.length < 2 || w1 <= 0) {
    return { a0: 2 * dampingRatio * w1 || 0, a1: 0 };
  }
  const w2 = omega[1]!;
  return {
    a0: (2 * dampingRatio * w1 * w2) / (w1 + w2),
    a1: (2 * dampingRatio) / (w1 + w2),
  };
}

/** C = a₀·M + a₁·K. */
export function buildRayleighDamping(
  massValues: Float64Array,
  stiffness: Square,
  a0: number,
  a1: number,
  floors: number,
): Square {
  const { n, a } = square(floors);
  for (let i = 0; i < floors; i++) {
    for (let j = 0; j < floors; j++) {
      a[i * n + j] = a0 * (i === j ? massValues[i]! : 0) + a1 * stiffness.a[i * n + j]!;
    }
  }
  return { n, a };
}

/** M⁻¹K, used to turn the generalised eigenproblem into a symmetric one. */
function reduceByMass(stiffness: Square, massValues: Float64Array, n: number) {
  const reduced = square(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      reduced.a[i * n + j] = stiffness.a[i * n + j]! / massValues[i]!;
    }
  }
  return { reduced };
}

function diagonal(values: Float64Array): Square {
  const n = values.length;
  const { a } = square(n);
  for (let i = 0; i < n; i++) a[i * n + i] = values[i]!;
  return { n, a };
}

/**
 * Effective stiffness for Newmark's method, and its factorisation.
 *
 *   K_eff = K + a₀·M + a₁·C        (Newmark constants, reused names)
 *
 * This is the single most important performance decision in the engine: the
 * matrix is constant for a given model and timestep, so it is factored ONCE
 * and reused for every timestep.
 */
export function effectiveStiffness(model: StructuralModel, dt: number): CholeskyFactor {
  const { n } = model.stiffness;
  const newmarkA0 = 1 / (SOLVER.newmarkBeta * dt * dt);
  const newmarkA1 = SOLVER.newmarkGamma / (SOLVER.newmarkBeta * dt);

  const { a } = square(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const index = i * n + j;
      a[index] =
        model.stiffness.a[index]! +
        newmarkA0 * (i === j ? model.floorMassKg[i]! : 0) +
        newmarkA1 * model.damping.a[index]!;
    }
  }

  const factor = cholesky({ n, a });
  if (!factor) {
    throw new Error(
      'Effective stiffness matrix is not positive definite — the model or timestep is invalid',
    );
  }
  return factor;
}

export { fromRows };
