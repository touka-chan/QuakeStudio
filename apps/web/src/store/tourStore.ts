import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config/engineeringAssumptions';
import { TOUR_UI } from '@/content/branding';

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
 * Has the tour been switched off?
 *
 * The app never sets this — the tour runs on every visit by design. It is read
 * only so automated checks can suppress the overlay and measure the plain
 * workspace instead. See STORAGE_KEYS.tourSuppressed.
 *
 * If storage is unavailable we answer `false` — show the tour. When we cannot
 * tell whether someone has seen something, showing it is the safer mistake.
 */
function tourSuppressed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.tourSuppressed) === 'true';
  } catch {
    return false;
  }
}

/**
 * The starting state.
 *
 * With no memory to consult, this is always "show". The shape stays — `open`
 * and `settled` still have to be decided together — because the gate sequencing
 * below depends on both being right before the first paint, and a version of
 * this that decided them in two places is the lockout described above.
 */
function initial(): { open: boolean; step: number; settled: boolean } {
  const show = TOUR_UI.enabled && !tourSuppressed();
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

/**
 * Test-only handle.
 *
 * The initial state is read once, when this module is first imported. A test
 * that seeds `tourSuppressed` in its own `beforeEach` is therefore too late —
 * the store has already decided. `reset` re-runs the same read, so tests
 * exercise the real code path rather than a hand-built state that could drift
 * from it.
 *
 * Exported as a single read-only handle rather than a `reset` action so
 * production code has no way to clear a real user's suppression.
 */
export const __testing = { reset: () => useTourStore.setState(initial()) };
