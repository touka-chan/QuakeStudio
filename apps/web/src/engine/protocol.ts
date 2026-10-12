import type { BuildingConfig, GroundMotionConfig, SimulationResult } from '@/types';

/* =========================================================================
   Worker protocol
   -------------------------------------------------------------------------
   The contract between the UI thread and the solver thread. Keeping it in one
   small file means both sides are checked against the same types, and a
   mismatch is a compile error rather than a silent runtime bug.

   REQUESTS ARE BATCHES. Comparison mode needs two buildings under ONE ground
   motion, and that has to be a single request: two independent requests would
   race, and whichever lost would leave one side showing stale numbers.

   Batching also does less work — the ground-motion series is generated once
   and shared, which matters when the same shaking drives both sides.
   ========================================================================= */

export type SolveRequest = {
  /** Correlates a response with its request; the UI drops stale ones. */
  readonly id: number;
  /** One building in single mode, two (A and B) in comparison mode. */
  readonly buildings: readonly BuildingConfig[];
  /** Shared by every building in the batch, so comparisons are like-for-like. */
  readonly motion: GroundMotionConfig;
};

export type SolveResponse =
  | {
      readonly id: number;
      readonly ok: true;
      /** Same order as `buildings`. */
      readonly results: SimulationResult[];
      /** Wall-clock milliseconds for the whole batch. */
      readonly solveMs: number;
    }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: string;
    };
