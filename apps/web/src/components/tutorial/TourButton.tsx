import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TOUR_UI } from '@/content/branding';
import { STORAGE_KEYS } from '@/config/engineeringAssumptions';
import { cn } from '@/lib/utils';
import { useTourStore } from '@/store/tourStore';

/* =========================================================================
   "How to use" — a floating button, draggable, and impossible to miss.

   Lives at the bottom of the screen rather than in the top bar, which had
   reached seven controls and had already cut two of them off at 360px once.

   COLOUR
   Filled with --primary, so it is the same green in both themes rather than a
   pale surface with a border that reads as a smudge. The icon colour comes
   from --primary-fg: white in light, near-black green in dark. The contrast
   inside the circle is the app's own and does not need deciding here.

   The panels it floats over reserve a gutter for it — see ResultsPanel.tsx and
   ControlsPanel.tsx — and the button can be dragged out of the way if the user
   would rather it were not there at all.

   WHY THE DRAG DOES NOT USE STATE
   The first version called setState on every pointermove. A drag emits those
   far faster than a render, a reconciliation and a style recalculation can be
   finished, and the button visibly trailed the finger.

   So the committed position lives in React and is written once, and the live
   position is a transform written straight onto the node. The compositor
   applies that without asking React anything, and it is the same property
   whether the button has moved one pixel or four hundred.

   DRAGGING IS A POINTER CONVENIENCE, NOT THE ONLY WAY IN
   What the button *does* — open the tour — is a normal button, reachable by
   Tab and fired by Enter or Space. Moving it is extra. A keyboard user who
   cannot drag the button has lost nothing they needed.

   The click that ends a drag is swallowed. Without that, every attempt to
   reposition the button would also open the tour, which is the fastest way to
   make a draggable control infuriating.
   ========================================================================= */

type Spot = { x: number; y: number };

/** How close to the window edge a dragged button may sit. */
const EDGE = 8;

/**
 * Pointer travel before a press counts as a drag rather than a click.
 *
 * Small, because a finger is imprecise and a large threshold reads as "it did
 * not move". Large enough that a tap is not mistaken for one.
 */
const DRAG_THRESHOLD_PX = 4;

/** How long the button takes to settle back after being released. */
const SETTLE_MS = 180;

function readSpot(): Spot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tourButtonPos);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { x, y } = parsed as Partial<Spot>;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return null;
    }
    return { x, y };
  } catch {
    // Corrupt or unavailable. The default corner is a perfectly good answer.
    return null;
  }
}

function writeSpot(spot: Spot): void {
  try {
    localStorage.setItem(STORAGE_KEYS.tourButtonPos, JSON.stringify(spot));
  } catch {
    // The button still works this session; it just goes back to the corner.
  }
}

function clampToWindow(spot: Spot, width: number, height: number): Spot {
  return {
    x: Math.min(Math.max(EDGE, spot.x), Math.max(EDGE, window.innerWidth - width - EDGE)),
    y: Math.min(Math.max(EDGE, spot.y), Math.max(EDGE, window.innerHeight - height - EDGE)),
  };
}

export function TourButton() {
  const start = useTourStore((s) => s.start);
  const tourOpen = useTourStore((s) => s.open);

  /** null means "the CSS default, bottom right". */
  const [spot, setSpot] = useState<Spot | null>(readSpot);
  const [settling, setSettling] = useState(false);

  const boxRef = useRef<HTMLButtonElement>(null);
  /*
   * The live position, and the only one a resize may read.
   *
   * Seeded from `spot` rather than null so the mount-time clamp has something
   * to work on, and written by every pointer handler, by the clamp and by the
   * settle alike — the four places that move the button all update it, which is
   * what makes it the most current answer to "where is the button now".
   */
  const spotRef = useRef<Spot | null>(spot);
  // Where the current drag started from. The live transform is measured against
  // this, which is what lets `left`/`top` stay put during the drag.
  const originRef = useRef<Spot | null>(null);
  const drag = useRef<{
    grabX: number;
    grabY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const swallowClick = useRef(false);

  /*
   * Keep the button inside the current window.
   *
   * A spot chosen on a desktop is off the edge of a phone, and one chosen on a
   * phone is in the middle of nowhere on a desktop. This runs on mount and on
   * every resize, so rotating a device or resizing a window cannot leave the
   * button somewhere the user cannot see it or reach it.
   *
   * IT CLAMPS THE LIVE POSITION, NOT THE COMMITTED ONE.
   *
   * Between pointerup and the settle there are two frames in which the
   * transform holds where the button was dropped and the state still holds
   * where the drag started. A resize landing in that window clamped the OLD
   * position, and the settle then committed the pre-resize position — leaving
   * the button off the edge of the new, smaller window with no further resize
   * event coming to put it back.
   *
   * `spotRef` is always the most current position there is, so clamping it and
   * writing the result to both places closes the window.
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    function reclamp() {
      const live = spotRef.current;
      if (!live) return;
      const next = clampToWindow(live, el!.offsetWidth, el!.offsetHeight);
      spotRef.current = next;
      setSpot(next);
    }
    reclamp();
    window.addEventListener('resize', reclamp);
    return () => window.removeEventListener('resize', reclamp);
  }, []);

  /*
   * Fold the live drag transform back into the committed position.
   *
   * A layout effect, not an effect, and that is the whole point. React writes
   * the new `left`/`top` and this reset has to land in the *same* paint: the
   * button is currently drawn at (old position + transform), and the new
   * `left`/`top` already describe where the user let go. Clearing the transform
   * a frame later shows the old position for that frame, and clearing it a
   * frame earlier never applies the new one at all.
   *
   * Guarded, because `spot` also changes on pointerdown, before any transform
   * has been written.
   */
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el && el.style.transform) el.style.transform = '';
  }, [spot]);
  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const el = event.currentTarget;
    // Capture so the drag keeps tracking once the pointer leaves the button,
    // which it will almost immediately.
    el.setPointerCapture(event.pointerId);
    const r = el.getBoundingClientRect();
    // Turn the CSS default into an explicit position, so the drag starts from
    // where the button actually is rather than jumping.
    const from = spotRef.current ?? { x: r.left, y: r.top };
    const start = clampToWindow(from, r.width, r.height);
    spotRef.current = start;
    originRef.current = start;
    setSpot(start);
    drag.current = {
      grabX: event.clientX - r.left,
      grabY: event.clientY - r.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    const el = boxRef.current;
    if (!d || !el) return;
    if (!d.moved) {
      const travelled = Math.abs(event.clientX - d.startX) + Math.abs(event.clientY - d.startY);
      if (travelled < DRAG_THRESHOLD_PX) return;
      d.moved = true;
    }
    event.preventDefault();
    const next = clampToWindow(
      { x: event.clientX - d.grabX, y: event.clientY - d.grabY },
      el.offsetWidth,
      el.offsetHeight,
    );
    spotRef.current = next;
    // Straight onto the node — no React, no render, no reconciliation. See the
    // note at the top of this file for why this matters.
    const origin = originRef.current ?? next;
    el.style.transform = `translate3d(${next.x - origin.x}px, ${next.y - origin.y}px, 0)`;
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const final = spotRef.current;
    if (!d?.moved || !final) return;

    swallowClick.current = true;
    writeSpot(final);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSpot(final);
      return;
    }

    /*
     * Fold the live transform into `left`/`top`, then hand back a settle.
     *
     * Two frames: one for React to write the new `left`/`top`, and one for the
     * class to come off. If it came off in the same frame there would be
     * nothing to animate and the button would stop dead.
     *
     * The commit reads `spotRef` again rather than reusing the value captured
     * above, because a resize landing in this window has already clamped the
     * live position. Committing the captured value would put the button back
     * off the edge of a window that had just shrunk, which is the same bug one
     * step later.
     */
    setSettling(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSpot(spotRef.current ?? final);
        setSettling(false);
      });
    });
  }

  function onClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (swallowClick.current) {
      swallowClick.current = false;
      event.preventDefault();
      return;
    }
    start();
  }

  if (!TOUR_UI.enabled) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={boxRef}
          onClick={onClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          /*
           * Icon only, so the name has to be on the control. Without this a
           * screen reader announces a bare button with no way of telling it from
           * the other controls in the corner — which is exactly what happened to
           * the feedback button here once already.
           */
          aria-label={TOUR_UI.buttonLabel}
          aria-hidden={tourOpen || undefined}
          tabIndex={tourOpen ? -1 : undefined}
          className={cn(
            // `touch-none` or a finger drag scrolls the page instead of moving
            // the button.
            'qs-attention fixed z-40 size-12 touch-none rounded-full p-0 text-primary-foreground shadow-lg lg:size-14',
            spot ? undefined : 'right-3 bottom-20 lg:right-5 lg:bottom-5',
            // No transition while the pointer is down — the drag has to track
            // the finger exactly, and easing it does that worse, not better.
            settling ? 'transition-[left,top] duration-150 ease-out' : 'transition-none',
            tourOpen && 'pointer-events-none opacity-0',
          )}
          style={
            spot
              ? { left: spot.x, top: spot.y, background: 'var(--primary)' }
              : { background: 'var(--primary)' }
          }
        >
          <CircleHelp aria-hidden="true" className="size-6" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{TOUR_UI.buttonTooltip}</TooltipContent>
    </Tooltip>
  );
}

export { SETTLE_MS };
