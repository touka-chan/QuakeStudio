/// <reference lib="webworker" />

import { buildModel } from './buildingModel';
import type { SolveRequest, SolveResponse } from './protocol';
import { simulate } from './solver';

/* =========================================================================
   Solver Web Worker
   -------------------------------------------------------------------------
   Runs the whole simulation off the UI thread so dragging a slider stays
   responsive while a new result is being computed.

   Note the naming: the Newmark constants inside solver.ts are also called a₀
   and a₁, so the variables here are prefixed `newmark` to keep the two
   meanings apart in any future code that reads both.
   ========================================================================= */

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<SolveRequest>) => {
  const request = event.data;
  const started = performance.now();

  try {
    const results = request.buildings.map((building) => simulate(building, request.motion));
    const response: SolveResponse = {
      id: request.id,
      ok: true,
      results,
      solveMs: performance.now() - started,
    };
    ctx.postMessage(response);
  } catch (error) {
    const response: SolveResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    ctx.postMessage(response);
  }
});

export { buildModel };
