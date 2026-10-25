import { SOLVER } from '@/config/engineeringAssumptions';
import type { BuildingConfig, GroundMotionConfig, SimulationResult } from '@/types';
import { effectiveStiffness, buildModel, type StructuralModel } from './buildingModel';
import { generateGroundMotion } from './groundMotion';
import { matVec, solveCholesky, type CholeskyFactor } from './matrix';

/* =========================================================================
   Newmark-β time integration (average-acceleration method)
   -------------------------------------------------------------------------
   β = 1/4, γ = 1/2 — the "average acceleration" / trapezoidal rule variant.
   Chosen over the alternatives because it is:

     • unconditionally stable, so the timestep only affects ACCURACY, never
       blow-up — a student cannot get an unstable result by picking a large dt;
     • non-dissipative, so it does not artificially swallow the high-frequency
       ringing this tool exists to show.

   Standard form, with the effective stiffness

       K_eff = K + (1/(β·dt²))·M + (γ/(β·dt))·C

   factored ONCE and reused for every step.

   ⚠️ Coefficients depend on the PLACEHOLDER engineering assumptions. See
   docs/assumptions.md.
   ========================================================================= */

/**
 * Solve the building's response to a ground motion.
 *
 * Deterministic: the same inputs always produce bit-identical outputs. No
 * randomness, no time-dependence, no reliance on iteration order.
 */
export function simulate(building: BuildingConfig, motion: GroundMotionConfig): SimulationResult {
  const dt = motion.dt;
  const model = buildModel(building);
  const ground = generateGroundMotion(motion);

  const n = model.floors;
  const steps = ground.time.length;

  // ---- Newmark constants -------------------------------------------------
  const beta = SOLVER.newmarkBeta;
  const gamma = SOLVER.newmarkGamma;

  const a0 = 1 / (beta * dt * dt); // 1/(β dt²)
  const a1 = gamma / (beta * dt); // γ/(β dt)
  const a2 = 1 / (beta * dt); // 1/(β dt)
  const a3 = 1 / (2 * beta) - 1;
  const a4 = gamma / beta - 1;
  const a5 = dt * (gamma / (2 * beta) - 1);

  const keff: CholeskyFactor = effectiveStiffness(model, dt);
  const { a: M } = model.mass;
  const { a: C } = model.damping;

  // ---- State -------------------------------------------------------------
  const u = new Float64Array(n); // displacement
  const v = new Float64Array(n); // velocity
  const acc = new Float64Array(n); // acceleration

  // Transposed on purpose. The model steps through TIME at each floor, but
  // `SimulationResult.floorDisp` is indexed [floor][time], so the charts and
  // the 3D view can read one floor's whole history without striding.
  const byTime: Float64Array[] = [];
  const time: number[] = [];

  // Reused buffers — allocating per step would dominate the runtime.
  const rhs = new Float64Array(n);
  const nextU = new Float64Array(n);

  for (let step = 0; step < steps; step++) {
    const ag = ground.accel[step] ?? 0;
    time.push(ground.time[step] ?? step * dt);

    // Effective load: p = −M·1·a_g, distributed by floor mass.
    for (let i = 0; i < n; i++) {
      const m = M[i * n + i]!;
      rhs[i] = -m * ag;
    }

    // rhs += M·(a₀u + a₂v + a₃·acc) + C·(a₁u + a₄v + a₅·acc)
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        const mRow = i === j ? M[i * n + i]! : 0;
        sum +=
          mRow * (a0 * u[j]! + a2 * v[j]! + a3 * acc[j]!) +
          C[i * n + j]! * (a1 * u[j]! + a4 * v[j]! + a5 * acc[j]!);
      }
      rhs[i]! += sum;
    }

    solveCholesky(keff, rhs, nextU);

    for (let i = 0; i < n; i++) {
      const un = nextU[i]!;
      const an = a0 * (un - u[i]!) - a2 * v[i]! - a3 * acc[i]!;
      const vn = v[i]! + dt * ((1 - gamma) * acc[i]! + gamma * an);

      u[i] = un;
      v[i] = vn;
      acc[i] = an;
    }

    byTime.push(Float64Array.from(u));
  }

  const floorDisp = transposeToFloorMajor(byTime, n);

  return summarise(time, floorDisp, model, building, ground.accel);
}

/** [step][floor] -> [floor][step], as plain arrays for the result type. */
function transposeToFloorMajor(byTime: Float64Array[], floors: number): number[][] {
  const floorDisp: number[][] = Array.from({ length: floors }, () => []);
  for (const step of byTime) {
    for (let floor = 0; floor < floors; floor++) floorDisp[floor]!.push(step[floor]!);
  }
  return floorDisp;
}

/* ------------------------------------------------------------------ results */

/**
 * Turn raw displacement histories into the outputs the brief asks for.
 *
 * Displacements stay in METRES throughout the engine; the UI converts to
 * millimetres at the edge. Keeping one unit inside the engine means a
 * conversion bug cannot hide in the middle of the maths.
 */
function summarise(
  time: number[],
  floorDisp: number[][],
  model: StructuralModel,
  building: BuildingConfig,
  groundAccel: number[],
): SimulationResult {
  const floors = model.floors;
  const peakDisp = new Array<number>(floors).fill(0);

  for (let floor = 0; floor < floors; floor++) {
    const series = floorDisp[floor] ?? [];
    let peak = 0;
    for (const value of series) peak = Math.max(peak, Math.abs(value));
    peakDisp[floor] = peak;
  }

  const maxDisp = peakDisp.reduce((max, value) => Math.max(max, value), 0);

  // Interstory drift ratio: how far each floor moved relative to the one
  // below it, as a fraction of floor height. Story 1 is ground to floor 1,
  // so floor 1's drift uses the ground displacement of zero.
  const driftRatio = new Array<number>(floors).fill(0);
  let maxDriftRatio = 0;
  let worstStory = 0;

  for (let floor = 0; floor < floors; floor++) {
    const below = floor === 0 ? 0 : peakDisp[floor - 1]!;
    const drift =
      building.floorHeightM > 0 ? (peakDisp[floor]! - below) / building.floorHeightM : 0;
    driftRatio[floor] = Math.max(0, drift);
    if (driftRatio[floor]! > maxDriftRatio) {
      maxDriftRatio = driftRatio[floor]!;
      worstStory = floor + 1;
    }
  }
  void worstStory;

  return {
    time,
    floorDisp,
    peakDisp,
    maxDisp,
    driftRatio,
    maxDriftRatio,
    periodsS: model.periodsS.slice(0, SOLVER.reportedModes),
    groundAccel,
    // The loads the run was made with. Copied, so editing the building after a
    // run cannot retroactively change what the saved result says it weighed.
    floorWeightsKN: [...model.floorWeightsKN],
    floorDeadKN: [...model.floorDeadKN],
    floorLiveCountedKN: [...model.floorLiveCountedKN],
    totalWeightKN: model.totalWeightKN,
    floorMassesKg: Array.from(model.floorMassKg),
  };
}

/* ----------------------------------------------------------------- helpers */

/**
 * Largest drift ratio, and which story it occurs on (1-based).
 *
 * Reported to the UI as "Story N". Kept separate from summarise so the UI can
 * show where the worst drift is without re-deriving it.
 */
export function worstStoryIndex(result: SimulationResult): number {
  let index = 0;
  let max = -Infinity;
  for (const [i, value] of result.driftRatio.entries()) {
    if (value > max) {
      max = value;
      index = i;
    }
  }
  return index + 1;
}

/** Displacement at a floor for a given time, by nearest sample. */
export function displacementAt(
  result: SimulationResult,
  floorIndex: number,
  timeS: number,
): number {
  const { time, floorDisp } = result;
  const series = floorDisp[floorIndex];
  if (!series || series.length === 0) return 0;

  let low = 0;
  let high = series.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (time[mid]! < timeS) low = mid + 1;
    else high = mid;
  }
  return series[low] ?? 0;
}

export { matVec };
