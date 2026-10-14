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

export type ScrollOptions = {
  behavior?: 'auto' | 'smooth';
  /** Where the target should end up. Defaults to `nearest`. */
  block?: 'start' | 'center' | 'nearest';
};

type Options = {
  /**
   * Bring the target into view before measuring it.
   *
   * Without this the tour happily highlighted an element that was scrolled out
   * of sight: step 4 points at the compare button, which lives below the fold
   * of the results panel, so the card was placed for a target the user could
   * not see. Measuring and highlighting are not the same as showing.
   */
  scrollIntoView?: ScrollOptions;
};

/** A measurement, tagged with what it was a measurement OF. */
type Measurement = { target: string | null; rect: Exclude<TargetRect, null> | null };

export function useTargetRect(
  target: string | null,
  enabled: boolean,
  options: Options = {},
): TargetRect {
  const { scrollIntoView } = options;
  const [measured, setMeasured] = useState<Measurement>({ target: null, rect: null });

  const find = useCallback(
    () => (target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null),
    [target],
  );

  const measure = useCallback(() => {
    if (!target) {
      setMeasured({ target: null, rect: null });
      return;
    }
    const el = find();
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
  }, [target, find]);

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
    let scrolled = scrollIntoView === undefined;

    function retry() {
      const el = find();

      if (!el) {
        measure();
        if (frames < MAX_FRAMES) {
          frames += 1;
          raf = requestAnimationFrame(retry);
        }
        return;
      }

      /*
       * Scroll before measuring, and only once per target. Doing it inside the
       * retry rather than up front is what makes this work for a lazily
       * mounted target: if the element is not there yet, the scroll waits with
       * it rather than silently doing nothing.
       *
       * `nearest` was the first choice and it was wrong. It scrolls the least
       * possible distance, which for a control at the foot of a scrollable
       * panel leaves it flush against the bottom edge — visible, but with no
       * margin, half of it feeling like it fell off the screen. `center`
       * leaves the target surrounded by whatever is above and below it.
       *
       * Except when the target is taller than most of the window. Centring
       * something that does not fit cuts off its top and bottom equally, and
       * the top of a panel is the part a reader starts from. Those get `start`.
       */
      if (!scrolled && scrollIntoView) {
        scrolled = true;
        const tall = el.offsetHeight > window.innerHeight * 0.8;
        el.scrollIntoView({
          block: tall ? 'start' : (scrollIntoView.block ?? 'nearest'),
          inline: 'nearest',
          behavior: scrollIntoView.behavior ?? 'auto',
        });
      }

      measure();
    }

    window.addEventListener('resize', measure);
    // `capture` is what makes nested scroll containers report. Without it the
    // panels scrolling underneath the spotlight is invisible to us.
    window.addEventListener('scroll', measure, true);

    const observer =
      find() && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(find()!);

    /*
     * The first measurement happens on the next animation frame rather than
     * synchronously here. Measuring now would mean a setState in the body of
     * this effect, which cascades an extra render on every step change for a
     * result the browser is about to paint anyway.
     */
    raf = requestAnimationFrame(retry);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      observer?.disconnect();
    };
  }, [enabled, target, scrollIntoView, measure, find]);

  return current;
}
