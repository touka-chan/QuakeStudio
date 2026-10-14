import { useCallback, useEffect, useState } from 'react';

/* =========================================================================
   useTargetRect

   Measures the element a tour step points at, and keeps that measurement
   honest while the step is on screen.

   Why this is not just `getBoundingClientRect()` in a render:

   - The panels scroll. The controls and results panels are `ScrollArea`s, so
     scrolling happens in a nested element, not on `window`. A plain window
     `scroll` listener would never fire and the spotlight would stay glued to
     coordinates the target left long ago.
   - The window can be resized, and a phone can be rotated mid-step.
   - The element can change size when its own content changes.

   If the target is not in the document yet — the 3D viewport is lazily
   mounted — we retry across a handful of animation frames rather than giving
   up, because a tour that points at nothing is worse than one that is briefly
   patient.
   ========================================================================= */

export type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
} | null;

/** How many frames to keep looking for a target that is not mounted yet. */
const MAX_FRAMES = 20;

/** A measurement, tagged with what it was a measurement OF. */
type Measurement = { target: string | null; rect: Exclude<TargetRect, null> | null };

export function useTargetRect(target: string | null, enabled: boolean): TargetRect {
  const [measured, setMeasured] = useState<Measurement>({ target: null, rect: null });

  const measure = useCallback(() => {
    if (!target) {
      setMeasured({ target: null, rect: null });
      return;
    }
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) {
      setMeasured({ target, rect: null });
      return;
    }
    const box = el.getBoundingClientRect();
    setMeasured((prev) => {
      // Same numbers, no re-render. This runs on every scroll frame.
      if (
        prev.rect &&
        prev.rect.top === box.top &&
        prev.rect.left === box.left &&
        prev.rect.width === box.width &&
        prev.rect.height === box.height
      ) {
        return prev;
      }
      return {
        target,
        rect: { top: box.top, left: box.left, width: box.width, height: box.height },
      };
    });
  }, [target]);

  /*
   * A measurement is only valid for the element it was taken from.
   *
   * Rather than clearing the old one when the step changes — a setState in an
   * effect, and one frame of the tour pointing at the previous step's panel
   * while it happens — staleness is decided during render. A box measured for
   * one target simply is not the answer for another.
   */
  const current = enabled && target !== null && measured.target === target ? measured.rect : null;

  useEffect(() => {
    if (!enabled || !target) return;

    let frames = 0;
    let raf = 0;

    function retry() {
      measure();
      const el = document.querySelector(`[data-tour="${target}"]`);
      if (!el && frames < MAX_FRAMES) {
        frames += 1;
        raf = requestAnimationFrame(retry);
      }
    }

    window.addEventListener('resize', measure);
    // `capture` is what makes nested scroll containers report. Without it the
    // panels scrolling underneath the spotlight is invisible to us.
    window.addEventListener('scroll', measure, true);

    const el = document.querySelector(`[data-tour="${target}"]`);
    let observer: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }

    /*
     * The first measurement happens on the next animation frame rather than
     * synchronously here. Measuring now would mean a setState in the body of
     * this effect, which cascades an extra render on every step change for a
     * result the browser is about to paint anyway. One frame without the
     * outline is not something anyone can see.
     */
    raf = requestAnimationFrame(retry);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      observer?.disconnect();
    };
  }, [enabled, target, measure]);

  return current;
}
