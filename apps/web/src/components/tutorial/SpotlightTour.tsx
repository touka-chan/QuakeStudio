import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { useFocusTrap } from './useFocusTrap';
import { useTargetRect } from './useTargetRect';
import { CARD_WIDTH, OUTLINE_PAD, placeCard } from './placeCard';
import type { TourStep } from './tourSteps';

/* =========================================================================
   Spotlight tour

   The desktop half of the guided tour. One step at a time: the page behind is
   dimmed, the element the step is about is cut out of the dim, outlined in the
   app's own `--primary`, and a card explains it.

   WHY THIS IS NOT A Radix DIALOG
   A dialog makes the page inert and traps focus. That is exactly wrong here —
   the whole point is to show the user the real page while explaining it. It
   also means this component owns its own focus management (see useFocusTrap)
   and its own keyboard handling, which is the cost of that choice.

   WHY THE SCRIM BLOCKS CLICKS BUT DOES NOT DISMISS
   A click on the scrim falls through to the app behind, which would mean the
   user could start a simulation mid-tour by aiming at the page they cannot
   clearly see. So the scrim swallows the click. But it does not close the
   tour: dismissing on an outside click is easy to do by accident, and losing
   the tour half way through is worse than the click doing nothing. Only "Skip
   tour" and Escape end it.
   ========================================================================= */

type Props = {
  step: TourStep;
  index: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

export function SpotlightTour({ step, index, total, isLast, onNext, onBack, onSkip }: Props) {
  const rect = useTargetRect(step.target, true);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const maskId = useId();
  const titleId = useId();
  const bodyId = useId();
  const reduced = usePrefersReducedMotion();

  useFocusTrap(cardRef, true);

  /*
   * Tie the explanation to the element being explained.
   *
   * A screen reader user who lands on the highlighted panel should be told
   * what the tour is saying about it, without having to go find the card. The
   * previous value is restored rather than the attribute removed, because an
   * element may have had a description of its own before the tour opened.
   */
  useEffect(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;
    const before = el.getAttribute('aria-describedby');
    el.setAttribute('aria-describedby', before ? `${before} ${bodyId}` : bodyId);
    return () => {
      if (before) el.setAttribute('aria-describedby', before);
      else el.removeAttribute('aria-describedby');
    };
  }, [step.target, bodyId]);

  /*
   * Announce the new step.
   *
   * The focus trap parks focus on the first control, which does not move when
   * the step changes. Without this, advancing a step silently swapped the
   * words under the user's eyes while their focus stayed on the close button —
   * a screen reader would announce "button" and nothing else, so a keyboard or
   * screen reader user would have no idea the tour had moved on.
   */
  useEffect(() => {
    titleRef.current?.focus();
  }, [index]);

  /*
   * Measure the card so placement can know whether it fits.
   *
   * A layout effect, not a passive one, so the corrected position is applied
   * before the browser paints. The first pass uses the declared max width and
   * an unknown height, and lands wherever the clamp puts it.
   */
  const [cardSize, setCardSize] = useState({ width: CARD_WIDTH, height: 0 });
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setCardSize((prev) =>
      prev.width === box.width && prev.height === box.height
        ? prev
        : { width: box.width, height: box.height },
    );
  }, [index]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onSkip();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onBack();
      }
    },
    [onNext, onBack, onSkip],
  );

  const placement = placeCard(rect, cardSize, {
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const outline =
    rect &&
    ({
      top: rect.top - OUTLINE_PAD,
      left: rect.left - OUTLINE_PAD,
      width: rect.width + OUTLINE_PAD * 2,
      height: rect.height + OUTLINE_PAD * 2,
    } as const);

  return (
    <>
      {/* ---- The dim, with the target cut out of it ---- */}
      <div className="fixed inset-0 z-50">
        <svg className="absolute inset-0 size-full" aria-hidden="true">
          <defs>
            {/*
              A mask rather than four overlapping divs. Rounded corners, a
              target near the window edge, and a target larger than the window
              are all one expression here instead of four sets of edge cases.
            */}
            <mask id={maskId}>
              <rect width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={rect.left - OUTLINE_PAD}
                  y={rect.top - OUTLINE_PAD}
                  width={rect.width + OUTLINE_PAD * 2}
                  height={rect.height + OUTLINE_PAD * 2}
                  rx="14"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="black"
            opacity={0.6}
            mask={`url(#${maskId})`}
            className={reduced ? undefined : 'transition-opacity duration-200'}
          />
        </svg>
      </div>

      {/* ---- The green outline ---- */}
      {outline && (
        <div
          aria-hidden="true"
          /*
            Named for the end-to-end tests. The Tailwind classes below are
            styling and can be rewritten for a purely visual reason; a test that
            located the outline by class name would then quietly measure nothing
            instead of failing.
          */
          data-tour-outline=""
          className={`pointer-events-none fixed z-[51] rounded-2xl ring-2 ring-primary ${
            reduced ? '' : 'transition-all duration-200'
          }`}
          style={outline}
        />
      )}

      {/* ---- The card ----
          `role="dialog"` without `aria-modal`: the page behind is still real
          and still perceivable, so claiming modality would be a lie to a screen
          reader. The scrim is aria-hidden because it is decoration. */}
      <div
        ref={cardRef}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`fixed z-[60] w-[22rem] max-w-[calc(100%-2rem)] rounded-app border border-line bg-surface p-4 shadow-xl ${
          reduced ? '' : 'transition-all duration-200'
        }`}
        style={placement}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Step {index + 1} of {total}
          </span>
          <ol className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <li
                key={i}
                className={`size-1.5 rounded-full ${i === index ? 'bg-primary' : 'bg-line'}`}
              />
            ))}
          </ol>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-8"
            aria-label="Skip the tour"
            onClick={onSkip}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>

        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="font-semibold outline-none">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1.5 text-sm text-muted-foreground">
          {step.body}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip tour
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={onBack} disabled={index === 0}>
              <ChevronLeft aria-hidden="true" />
              Back
            </Button>
            <Button size="sm" onClick={onNext}>
              {isLast ? 'Finish' : 'Next'}
              {isLast ? null : <ChevronRight aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
