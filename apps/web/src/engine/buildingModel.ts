import { MATERIALS, FRAME_TYPES, SOLVER } from '@/config/engineeringAssumptions';
import {
  bareFloorWeightKN,
  floorAreaM2,
  massKgFromWeightKN,
  normalizeFloorLoads,
  participationFor,
  referenceFloorMassKg,
} from '@/config/floorLoads';
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

   MASS COMES FROM FLOOR LOADS, NOT FROM THE MATERIAL.

   Each floor's earthquake weight is

       W_i = (DL_i + ψ·LL_i) × A          (kN)
       m_i = W_i × 1000 / g               (kg)

   and the floors may all be different, so M is a general diagonal matrix.

   THE EXCEPTION IS A BUILDING WITH FLOOR LOADS OFF: `building.loadsEnabled` is
   a per-building switch, and with it off the occupancy loads are not counted
   at all — every floor weighs its material's bare structure
   (`bareFloorWeightKN`), so the material matters again for weight. Bare
   masses are uniform, but M is still assembled the same general way, and the
   reduction below handles both.

   STIFFNESS IS CALIBRATED FROM A REFERENCE BUILDING whose floors are all
   Office at the default loads. That is what makes adding load change the
   response without making the building stronger: K is fixed for a given
   geometry, material and frame, and the loads only change M. Recalibrating on
   the user's actual masses would silently cancel the effect the feature
   exists to demonstrate.

   Nothing here is hard-coded: every value comes from
   `config/engineeringAssumptions.ts` and `config/floorLoads.ts`, which are the
   documents the adviser reviews.

   ⚠️ Every coefficient below traces back to a PLACEHOLDER pending review.
   ========================================================================= */

/** The three matrices the solver needs, plus the diagnostics the UI shows. */
export type StructuralModel = {
  readonly floors: number;
  /** Lumped floor masses in kg, one per floor. */
  readonly floorMassKg: Float64Array;
  /** Earthquake weight per floor, in kN. */
  readonly floorWeightsKN: number[];
  /** Dead-load part of each floor's weight, in kN. */
  readonly floorDeadKN: number[];
  /** Counted live-load part of each floor's weight, in kN. */
  readonly floorLiveCountedKN: number[];
  readonly totalWeightKN: number;
  /** Fraction of live load counted as earthquake weight, 0..1. */
  readonly participation: number;
  /**
   * Whether the occupancy loads produced these weights. False means the
   * weights are the material's bare floor mass, not the load rows'.
   */
  readonly loadsEnabled: boolean;
  /** Story stiffness in N/m. Uniform in the MVP. */
  readonly storyStiffnessNm: number;
  /** The mass used to calibrate stiffness, in kg. See the header note. */
  readonly referenceMassKg: number;
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
 * `m` here is the REFERENCE floor mass (all Office, default loads), not the
 * user's actual floor mass. Passing the actual mass would make a heavier
 * building stiffer and cancel the response change the floor-loads feature is
 * meant to show. See buildModel().
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
  if (!(floorMassKg > 0)) throw new Error('Reference floor mass must be positive');

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

  const areaM2 = floorAreaM2(building.widthM, building.depthM);
  const loads = normalizeFloorLoads(n, building.floorLoads);
  const participation = participationFor(building);

  /*
   * Whether the occupancy loads are counted at all. This is a per-building
   * switch: OFF consults neither the floor uses nor their dead-load inputs,
   * and every floor weighs what its material's bare structure weighs. The
   * `?? true` is belt-and-braces — the building schema already backs an
   * absent field with true at the boundary — because a massless building must
   * be unreachable by accident.
   */
  const loadsOn = building.loadsEnabled !== false;

  // ---- Mass, from the floor loads (or the bare structure) ----------------
  /*
   * In OFF mode the dead/live split still speaks the result schema's language:
   * all of a bare floor's weight is structure, none of it is counted live —
   * which is the truth the weight displays report, not a rounding.
   */
  const floorDeadKN = loads.map((load) =>
    loadsOn ? load.deadLoadKPa * areaM2 : bareFloorWeightKN(areaM2, building.material),
  );
  const floorLiveCountedKN = loads.map((load) =>
    loadsOn ? participation * load.liveLoadKPa * areaM2 : 0,
  );
  const floorWeightsKN = floorDeadKN.map((dead, index) => dead + floorLiveCountedKN[index]!);
  const totalWeightKN = floorWeightsKN.reduce((sum, weight) => sum + weight, 0);
  /*
   * A floor with no weight has no mass, and the eigenproblem divides by its
   * square root. Zero loads are reachable while loads are ON (dead load 0,
   * live load 0 or ψ 0), so this is reported as a model error rather than
   * allowed to become NaN in every chart. While loads are OFF it cannot fire:
   * the bare masses are constants above zero, and the geometry floor keeps
   * the area positive. Dead load includes the floor itself, so a real floor
   * is never weightless.
   */
  const weightless = floorWeightsKN.findIndex((weight) => !(weight > 0));
  if (weightless >= 0) {
    throw new Error(
      `Floor ${weightless + 1} has no weight. ${loadsOn ? 'Set a dead load or count some live load on every floor.' : 'This needs floor loads switched on — the bare structure always has mass.'}`,
    );
  }
  const massValues = Float64Array.from(floorWeightsKN.map(massKgFromWeightKN));

  // ---- Stiffness, from the REFERENCE mass --------------------------------
  // Not from `massValues`. See the header note and §3.2 of the build prompt:
  // load changes mass only, never stiffness.
  const referenceMassKg = referenceFloorMassKg(areaM2);
  const targetPeriod = fundamentalPeriodS(building);
  const storyStiffness =
    storyStiffnessForPeriod(referenceMassKg, n, targetPeriod) * frame.stiffnessFactor;

  const stiffness = buildStiffnessMatrix(n, storyStiffness);

  // ---- Natural frequencies ------------------------------------------------
  // Generalised eigenproblem K·φ = ω²·M·φ with a NON-UNIFORM diagonal M.
  // Forming M⁻¹K is only symmetric when every floor mass is equal, so the
  // symmetric reduction is D = M^{-1/2}·K·M^{-1/2}. Its eigenvalues are the
  // same as the generalised problem's, which is all this needs.
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
    floorWeightsKN,
    floorDeadKN,
    floorLiveCountedKN,
    totalWeightKN,
    participation,
    loadsEnabled: loadsOn,
    storyStiffnessNm: storyStiffness,
    referenceMassKg,
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

/**
 * Symmetric reduction of the generalised eigenproblem K·φ = ω²·M·φ.
 *
 *     D = M^{-1/2} · K · M^{-1/2}        D_ij = K_ij / √(m_i · m_j)
 *
 * Do NOT form M⁻¹K. That is symmetric only when every floor has the same mass,
 * and the Jacobi eigensolver below requires symmetry. Before floor loads the
 * masses were uniform, so M⁻¹K happened to work; with a different load on each
 * floor it would produce wrong periods — including a wrong T₁, which the whole
 * app reports.
 *
 * D has the same eigenvalues as the generalised problem, and the natural
 * frequencies are the square roots of those eigenvalues. The eigenvectors are
 * not needed here (the solver integrates the equations directly), so the
 * back-transformation φ = M^{-1/2}·v is deliberately omitted.
 */
function reduceByMass(stiffness: Square, massValues: Float64Array, n: number) {
  const reduced = square(n);
  const invSqrtMass = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const mass = massValues[i]!;
    invSqrtMass[i] = mass > 0 ? 1 / Math.sqrt(mass) : 0;
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      reduced.a[i * n + j] = stiffness.a[i * n + j]! * invSqrtMass[i]! * invSqrtMass[j]!;
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
