import { create } from 'zustand';

import { PLAYBACK_SPEEDS, VIEWPORT, type PlaybackSpeed } from '@/config/engineeringAssumptions';

/* =========================================================================
   Playback store
   -------------------------------------------------------------------------
   Phase 1: the clock is wired but does not run yet — the real transport
   arrives in Phase 3 alongside the solver.

   Design note for Phase 3: `time` here is the ONLY clock. The 3D animation
   and the chart cursor both read it, and both sample displacement from the
   same `SimulationResult.floorDisp` array. If either one keeps its own copy
   of time or displacement, they will drift apart.
   ========================================================================= */

type PlaybackState = {
  time: number;
  playing: boolean;
  speed: PlaybackSpeed;
  loop: boolean;
  /** How much to magnify real displacement in the 3D view. 1 = true scale. */
  exaggeration: number;

  setTime: (t: number) => void;
  togglePlaying: () => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  setLoop: (loop: boolean) => void;
  setExaggeration: (value: number) => void;
  reset: (durationS: number) => void;
};

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  time: 0,
  // Starts paused: it respects prefers-reduced-motion and is honest about the
  // fact that nothing is being simulated yet.
  playing: false,
  speed: 1,
  loop: true,
  exaggeration: VIEWPORT.defaultExaggeration,

  setTime: (time) => set({ time: Math.max(0, time) }),
  togglePlaying: () => set({ playing: !get().playing }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setLoop: (loop) => set({ loop }),
  setExaggeration: (exaggeration) =>
    set({
      exaggeration: Math.min(
        VIEWPORT.maxExaggeration,
        Math.max(VIEWPORT.minExaggeration, Math.round(exaggeration)),
      ),
    }),
  reset: (durationS) => set({ time: Math.min(get().time, durationS), playing: false }),
}));

export { PLAYBACK_SPEEDS };
export type { PlaybackSpeed };
