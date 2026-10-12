import { useEffect, useRef } from 'react';

import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';

/* =========================================================================
   Playback clock
   -------------------------------------------------------------------------
   The ONE transport in the app. Everything time-dependent reads from here:
   the 3D sway, the chart cursor, the time readout.

   Design notes, because these matter for Phase 5:

   • The clock writes to the Zustand store once per animation frame. The 3D
     view reads it with `getState()` inside `useFrame`, so it never triggers a
     React render. The chart cursor is moved imperatively. Only the small time
     readout subscribes to the value.

   • `prefers-reduced-motion` keeps playback PAUSED on load and drops the
     default speed, rather than starting a loop animation nobody asked for.

   • Looping restarts from zero at the end. If the user has scrubbed backwards
     past the end, play resumes from where they are, not from the start.
   ========================================================================= */

export function PlaybackClock() {
  const reducedMotion = usePrefersReducedMotion();
  const applied = useRef(false);

  // Honour reduced motion once, on mount.
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (reducedMotion) {
      usePlaybackStore.setState({ playing: false, speed: 0.5 });
    }
  }, [reducedMotion]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      // Cap the delta so a backgrounded tab does not resume with a huge jump.
      const deltaS = Math.min((now - previous) / 1000, 0.1);
      previous = now;

      const { playing, speed, time } = usePlaybackStore.getState();
      const duration = useConfigStore.getState().motion.durationS;

      if (playing) {
        let next = time + deltaS * speed;

        if (next >= duration) {
          if (usePlaybackStore.getState().loop) {
            next = next % duration;
          } else {
            next = duration;
            usePlaybackStore.setState({ playing: false });
          }
        }
        usePlaybackStore.setState({ time: next });
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
