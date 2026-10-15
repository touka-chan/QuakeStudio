import { useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { STORAGE_KEYS } from '@/config/engineeringAssumptions';
import { cn } from '@/lib/utils';
import { useTourStore } from '@/store/tourStore';

/* =========================================================================
   "How to use" — a floating button, draggable, and impossible to miss.

   Lives at the bottom of the screen rather than in the top bar, which had
   reached seven controls and had already cut two of them off at 360px once.

   COLOUR
   It is filled with --primary, so it is the same green in both themes rather
   than a pale surface with a border that reads as a smudge. The icon colour
   comes from --primary-fg, which is white in light and near-black green in
   dark, so the contrast inside the circle is the app's own and does not need
   deciding here.

   The panels it floats over reserve a gutter for it — see ResultsPanel.tsx and
   ControlsPanel.tsx — and the button can be dragged out of the way if the user
   would rather it were not there at all.

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
 * not move". Large enough that a tap does not get mistaken for one.
 */
const DRAG_THRESHOLD_PX = 4;

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
  const boxRef = useRef<HTMLButtonElement>(null);
  // Mirrors `spot` for the pointerup handler, which must not read a value the
  // last pointermove has set but React has not re-rendered yet.
  const spotRef = useRef<Spot | null>(null);
  const drag = useRef<{
    grabX: number;
    grabY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const swallowClick = useRef(false);

  /*
   * Keep a stored spot inside the current window.
   *
   * A spot chosen on a desktop is off the edge of a phone, and one chosen on a
   * phone is in the middle of nowhere on a desktop. This runs on mount and on
   * every resize, so rotating a device or resizing a window cannot leave the
   * button somewhere the user cannot see it or reach it.
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    function reclamp() {
      setSpot((prev) => (prev ? clampToWindow(prev, el!.offsetWidth, el!.offsetHeight) : prev));
    }
    reclamp();
    window.addEventListener('resize', reclamp);
    return () => window.removeEventListener('resize', reclamp);
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const el = event.currentTarget;
    // Capture so the drag keeps tracking once the pointer leaves the button,
    // which it will almost immediately.
    el.setPointerCapture(event.pointerId);
    const r = el.getBoundingClientRect();
    // Turn the CSS default into an explicit position, so the drag continues
    // from where the button actually is rather than jumping.
    const from = spotRef.current ?? { x: r.left, y: r.top };
    const start = clampToWindow(from, r.width, r.height);
    spotRef.current = start;
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
    setSpot(next);
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (d?.moved) {
      swallowClick.current = true;
      if (spotRef.current) writeSpot(spotRef.current);
    }
  }

  function onClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (swallowClick.current) {
      swallowClick.current = false;
      event.preventDefault();
      return;
    }
    start();
  }

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
          aria-label="How to use"
          aria-hidden={tourOpen || undefined}
          tabIndex={tourOpen ? -1 : undefined}
          /*
           * Made invisible rather than removed while the tour is up. This is
           * usually what had focus when the tour opened, and unmounting it
           * would leave the focus trap handing focus to an element that no
           * longer exists. `tabIndex: -1` is what makes the `aria-hidden`
           * legal — axe checks for exactly that pairing.
           */
          className={cn(
            // `touch-none` or a finger drag scrolls the page instead of moving
            // the button.
            'qs-attention fixed z-40 size-12 touch-none rounded-full p-0 text-primary-foreground shadow-lg lg:size-14',
            spot ? undefined : 'right-3 bottom-20 lg:right-5 lg:bottom-5',
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
      <TooltipContent className="max-w-xs text-xs">
        Walk through the four things you can do here. Drag it anywhere.
      </TooltipContent>
    </Tooltip>
  );
}
