import type { BuildingConfig, GroundMotionConfig, SimulationResult } from '@/types';
import type { SolveRequest, SolveResponse } from './protocol';

/* =========================================================================
   Solver client
   -------------------------------------------------------------------------
   The UI's single point of contact with the simulation engine.

   Responsibilities, and deliberately nothing more:
     • own the Worker lifecycle
     • debounce rapid input changes (dragging a slider fires dozens of updates
       per second; the brief asks for ~150 ms)
     • drop stale responses so an old result can never overwrite a newer one

   Determinism note: responses are matched by a monotonic request id and stale
   ones are discarded, so the result on screen always corresponds to the
   inputs the user can currently see.
   ========================================================================= */

const DEBOUNCE_MS = 150;

export type SolveHandler = (results: SimulationResult[]) => void;
export type ErrorHandler = (message: string) => void;

export class SolverClient {
  private worker: Worker | null = null;
  private nextId = 1;
  /** Id of the newest request sent. Anything older is ignored on arrival. */
  private latestSentId = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private buildings: readonly BuildingConfig[] = [];
  private motion: GroundMotionConfig | null = null;

  // Declared as fields rather than constructor parameter properties: the
  // project compiles with `erasableSyntaxOnly`, which forbids them.
  private readonly onResult: SolveHandler;
  private readonly onError: ErrorHandler;

  constructor(onResult: SolveHandler, onError: ErrorHandler = () => {}) {
    this.onResult = onResult;
    this.onError = onError;
  }

  /* ---------------------------------------------------------------- lifecycle */

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;

    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: 'quakestudio-solver',
      });
    } catch (error) {
      this.onError(
        `Could not start the simulation worker: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }

    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', (event) => {
      this.onError(event.message || 'The simulation worker crashed');
    });

    return this.worker;
  }

  private handleMessage = (event: MessageEvent<SolveResponse>) => {
    const response = event.data;

    // A slow response from an older input must not overwrite a newer one.
    if (response.id !== this.latestSentId) return;

    if (response.ok) {
      this.onResult(response.results);
    } else {
      this.onError(response.error);
    }
  };

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.worker?.removeEventListener('message', this.handleMessage);
    this.worker?.terminate();
    this.worker = null;
  }

  /* --------------------------------------------------------------- requests */

  /**
   * Solve a batch of buildings under one ground motion, debounced.
   *
   * Pass two buildings to get comparison mode: they share the motion, so any
   * difference in the response comes from the buildings alone.
   */
  request(buildings: readonly BuildingConfig[], motion: GroundMotionConfig): void {
    this.buildings = buildings;
    this.motion = motion;

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sendNow(), DEBOUNCE_MS);
  }

  /** Bypass the debounce — used on first load, where there is nothing to wait for. */
  requestImmediate(buildings: readonly BuildingConfig[], motion: GroundMotionConfig): void {
    this.buildings = buildings;
    this.motion = motion;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.sendNow();
  }

  private sendNow(): void {
    this.timer = null;
    if (!this.motion || this.buildings.length === 0) return;

    const worker = this.ensureWorker();
    if (!worker) return;

    const request: SolveRequest = {
      id: this.nextId++,
      buildings: this.buildings,
      motion: this.motion,
    };
    this.latestSentId = request.id;
    worker.postMessage(request);
  }
}

export { DEBOUNCE_MS };