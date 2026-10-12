import type { BuildingConfig, GroundMotionConfig, SimulationResult } from '@/types';

/* =========================================================================
   Worker protocol
   -------------------------------------------------------------------------
   The contract between the UI thread and the solver thread. Keeping it in one
   small file means both sides are checked against the same types, and a
   mismatch is a compile error rather than a silent runtime bug.

   The worker exists for one reason: a 20-floor, 60-second run is 6,000
   timesteps, and doing that on the main thread would freeze the sliders the
   student is dragging.
   ========================================================================= */

export type SolveRequest = {
  /** Correlates a response with its request; the UI drops stale ones. */
  readonly id: number;
  readonly building: BuildingConfig;
  readonly motion: GroundMotionConfig;
};

export type SolveResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly result: SimulationResult;
      /** Wall-clock milliseconds spent solving, for the UI's diagnostics. */
      readonly solveMs: number;
    }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: string;
    };

/** Diagnostics for the first N natural periods, shown as "info" in the UI. */
export type ModelSummary = {
  readonly storyStiffnessNm: number;
  readonly floorMassKg: number;
  readonly dampingRatio: number;
  readonly periodsS: number[];
};
