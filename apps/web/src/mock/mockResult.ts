import { FRAME_TYPES, MATERIALS } from '@/config/engineeringAssumptions';
import type { BuildingConfig, GroundMotionConfig } from '@/types';

/* =========================================================================
   Mock result generator — PHASE 1 ONLY
   -------------------------------------------------------------------------
   This produces plausible-looking numbers so the UI can be reviewed before
   the real solver exists in Phase 2. It is NOT physics. It is a damped
   sinusoid chosen so the charts and the 3D view have something coherent to
   show, and so sliders visibly change the output.

   Phase 2 replaces `generateMockResult` with the real worker-backed solver.
   Nothing else in the UI should need to change: both must satisfy the same
   signature and return a `SimulationResult`.

   Delete this file once the engine lands. If anything imports it in Phase 2,
   the simulation is still running on fake numbers.
   ========================================================================= */

const M2S_TO_MM = 1000;

/** Deterministic hash → [0, 1). Keeps mock output stable across reloads. */
function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function pseudoPeriods(building: BuildingConfig): number[] {
  // Rough stand-in for T1 = Ct * H^x, then shortened by the frame's extra
  // stiffness. Phase 2 replaces this with the real eigenvalue solve.
  const height = building.floors * building.floorHeightM;
  const base = 0.09 * height ** 0.85;
  const t1 = base / Math.sqrt(FRAME_TYPES[building.frameType].stiffnessFactor);
  return [t1, t1 / 2.6, t1 / 4.7];
}

export function generateMockResult(
  building: BuildingConfig,
  motion: GroundMotionConfig,
): import('@/types').SimulationResult {
  const dt = 0.01;
  const steps = Math.max(2, Math.round(motion.durationS / dt) + 1);
  const time: number[] = [];
  for (let i = 0; i < steps; i++) time.push(i * dt);

  const height = building.floors * building.floorHeightM;
  const periods = pseudoPeriods(building);

  // Seeded by the properties that should actually change the response.
  // Deriving it from string lengths was a real bug: "moment" and "braced" are
  // both six characters, so changing the frame type changed nothing.
  const seed =
    building.floors * 31 +
    Math.round(building.widthM) * 3 +
    Math.round(building.depthM) * 5 +
    MATERIALS[building.material].massPerAreaKgM2 +
    FRAME_TYPES[building.frameType].stiffnessFactor * 1000 +
    Math.round((motion.frequencyHz ?? 1) * 10);

  // A slow pseudo-random sway, so the chart does not look like a flat line.
  const swayHz = (1 / periods[0]!) * (0.6 + hash01(seed) * 0.8);

  // Taller buildings sway further; a wider building sways less.
  const heightFactor = (height / 15) ** 1.3;
  const slendernessFactor = (building.floorHeightM * building.floors) / (building.widthM * 0.5);

  // A stiffer frame is a stronger restoring force, so it deflects less for the
  // same push. Scaling by 1/sqrt(k) matches how the natural frequency grows.
  const stiffnessFactor = FRAME_TYPES[building.frameType].stiffnessFactor;

  const floorDisp: number[][] = [];
  const peakDisp: number[] = [];

  for (let floor = 1; floor <= building.floors; floor++) {
    // Shape of the mode: roughly a power curve up the height, max at the top.
    const shape = (floor / building.floors) ** 1.35;
    const amplitudeM =
      0.004 *
      heightFactor *
      slendernessFactor *
      shape *
      (motion.pgaG / 0.3) *
      (1 / Math.sqrt(stiffnessFactor)) *
      (0.6 + hash01(seed + floor) * 0.4);

    const series: number[] = [];
    let peak = 0;
    for (let i = 0; i < steps; i++) {
      const t = time[i]!;
      const envelope = Math.min(1, t / 1.5) * Math.exp(-0.12 * t);
      const value = amplitudeM * envelope * Math.sin(2 * Math.PI * swayHz * t + floor * 0.6);
      series.push(value);
      peak = Math.max(peak, Math.abs(value));
    }
    floorDisp.push(series);
    peakDisp.push(peak);
  }

  const driftRatio: number[] = [];
  let maxDriftRatio = 0;
  for (let floor = 0; floor < building.floors; floor++) {
    const drift = building.floorHeightM > 0 ? peakDisp[floor]! / building.floorHeightM : 0;
    driftRatio.push(drift);
    maxDriftRatio = Math.max(maxDriftRatio, drift);
  }

  const groundAccel = time.map((t) => {
    const f = motion.frequencyHz ?? 1.2;
    const envelope = Math.min(1, t / 0.5) * Math.min(1, (motion.durationS - t) / 0.5);
    return motion.pgaG * 9.80665 * envelope * Math.sin(2 * Math.PI * f * t);
  });

  return {
    time,
    floorDisp,
    peakDisp,
    maxDisp: peakDisp.reduce((max, p) => Math.max(max, p), 0),
    driftRatio,
    maxDriftRatio,
    periodsS: periods,
    groundAccel,
  };
}

/** Convenience: peak displacement in millimetres, the unit the UI shows. */
export function peakDispMm(result: import('@/types').SimulationResult): number[] {
  return result.peakDisp.map((p) => p * M2S_TO_MM);
}
