import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config/engineeringAssumptions';

/* =========================================================================
   Tour store

   Deliberately tiny. It knows which step is showing and whether this session
   has finished with the tour. It knows nothing about geometry, positioning,
   or what the steps say — that lives in `tourSteps.ts`.

   THE ONE PIECE OF REAL LOGIC HERE IS THE INITIAL STATE.

   The disclaimer gate must not open while the tour is still going to appear,
   or two overlays would be open at once and would fight over focus. The tour
   is deliberately NOT a Radix dialog — it needs the real page visible and
   dimmed beside it, which a modal forbids — so the two cannot be nested. They
   are sequenced instead, and `settled` is the end of that sequence.

   `settled` is derived from the same read as `open`, in `initial()` below.
   That matters more than it looks:

   Deciding the two separately is how you get a lockout. Start `settled` at
   false, decide `open` somewhere else, and any path where the tour decides
   not to show leaves `settled` false forever — which blocks the disclaimer
   gate for good. To a user that is not a logic error, it is an app that opens
   to a black screen. Deriving both from one read makes that state
   unreachable instead of merely unlikely.
   ========================================================================= */

export type TourState = {
  /** Is a step of the tour on screen right now? */
  open: boolean;
  /** Zero-based index into TOUR_STEPS. */
  step: number;
  /** Has this session finished with the tour — one way only, false -> true. */
  settled: boolean;

  /** Open the tour at step 0. Used by "How to use" as well as first run. */
  start: () => void;
  next: () => void;
  back: () => void;
  /** Completed the last step. */
  finish: () => void;
  /** Dismissed early. Counts as done — we do not nag. */
  skip: () => void;
};

/**
 * Has the guided tour already run in this browser?
 *
 * If storage is unavailable we answer `false` — show the tour again. Same
 * fail-safe direction `FirstRunDialog` uses for the disclaimer: when we cannot
 * tell whether someone has seen something important, showing it again is the
 * safer mistake.
 */
function shouldShowTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.tourCompleted) !== 'true';
  } catch {
    return false;
  }
}

/** The starting state, and the reason `open` and `settled` can never disagree. */
function initial(): { open: boolean; step: number; settled: boolean } {
  const show = shouldShowTour();
  return { open: show, step: 0, settled: !show };
}

export const useTourStore = create<TourState>((set) => ({
  ...initial(),

  start: () => set({ open: true, step: 0 }),
  next: () => set((s) => ({ step: s.step + 1 })),
  back: () => set((s) => ({ step: Math.max(0, s.step - 1) })),
  finish: () => set({ open: false, settled: true }),
  skip: () => set({ open: false, settled: true }),
}));

/** Remember that the tour has run. A failure here only means we ask again. */
export function rememberTourCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.tourCompleted, 'true');
  } catch {
    // Non-fatal. The tour is a convenience; the disclaimer is the gate.
  }
}

/**
 * Test-only handle.
 *
 * The initial state is read once, when this module is first imported. A test
 * that seeds `tourCompleted` in its own `beforeEach` is therefore too late —
 * the store has already decided. `reset` re-runs the same read, so tests
 * exercise the real code path rather than a hand-built state that could drift
 * from it.
 *
 * Exported as a single read-only handle rather than a `reset` action so
 * production code has no way to wipe a real user's tour history.
 */
export const __testing = { reset: () => useTourStore.setState(initial()) };

export { shouldShowTour };
