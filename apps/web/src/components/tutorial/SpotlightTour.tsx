import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { useFocusTrap } from './useFocusTrap';
import { useTargetRect } from './useTargetRect';
import { CARD_WIDTH, OUTLINE_PAD, placeCard } from './placeCard';
import { TOUR_BACKDROP_FILTER } from './tourBackdrop';
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

   WHY THE PAGE IS BLOCKED — EXCEPT THE PART BEING TALKED ABOUT
   Everything outside the highlight is covered by a transparent blocker, so a
   click cannot land on a control the user was not shown. That was originally
   everything, including the highlight itself: the scrim ate every click, which
   meant a user could not scroll the panel the step was describing, let alone
   drag its sliders. Being told "set the floors" and then being unable to try it
   is the worst version of a tutorial.

   So the blocker carries the same hole as the blur. The control is live —
   scrollable, clickable, draggable — and the rest of the app is not.

   The blur and dim are explicitly pointer-events-none, so the blocker is the
   only thing eating clicks and the hole is guaranteed to reach the page.
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
  const reduced = usePrefersReducedMotion();
  /*
   * `nearest`, and never smooth for a reduced-motion user. Both matter: the
   * results panel is long, and without the scroll the tour would happily
   * highlight a compare button that is below the fold.
   */
  const rect = useTargetRect(step.target, true, {
    scrollIntoView: { behavior: reduced ? 'auto' : 'smooth', block: 'center' },
  });
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const maskId = useId();
  const titleId = useId();
  const bodyId = useId();

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

    /*
     * Mark the element this step is about.
     *
     * Every step's target is in the DOM at once, so `data-tour` on its own does
     * not say which one is live. Needed because the outline is the wrong thing
     * to measure for visibility — it deliberately overhangs the element by
     * OUTLINE_PAD, so on a full-height panel it hangs eight pixels past the
     * bottom of the screen while the element itself is perfectly visible.
     */
    el.setAttribute('data-tour-active', '');

    return () => {
      el.removeAttribute('data-tour-active');
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
   *
   * WATCHED RATHER THAN MEASURED ONCE PER STEP.
   *
   * The deps were `[index]`, so the card was measured when the step changed and
   * never again. The app webfont arrives after first paint, so the card grows by
   * a line of height some time AFTER it was measured, and placement goes on
   * using the old number. The card is then positioned to sit neatly above its
   * target using a height it no longer has, and its bottom edge lands on top of
   * the very control it is describing. At step 2 that is the Play button.
   *
   * It looked like a flaky test rather than a bug: it failed about one run in
   * three under full-suite load and passed every time on its own, because a slow
   * machine is what makes the font late. The screenshot Playwright keeps on
   * failure is what actually settled it.
   *
   * A ResizeObserver does not care what moved the height, which is the whole
   * point — font swap, a longer word, a reader's own zoom.
   */
  const [cardSize, setCardSize] = useState({ width: CARD_WIDTH, height: 0 });

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const record = () => {
      const box = el.getBoundingClientRect();
      setCardSize((prev) =>
        prev.width === box.width && prev.height === box.height
          ? prev
          : { width: box.width, height: box.height },
      );
    };

    if (typeof ResizeObserver === 'undefined') {
      record();
      return;
    }

    const observer = new ResizeObserver(record);
    observer.observe(el);
    // The observer's first callback is asynchronous, so take one reading now as
    // well — otherwise the very first paint has no height to place against.
    record();

    return () => observer.disconnect();
  }, []);

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

  /*
   * The hole in the blur.
   *
   * `backdrop-filter` applies to everything painted behind the element, with no
   * way to exclude anything — so the element being talked about would be
   * blurred along with everything else, which defeats the point of cutting it
   * out in the first place. The client's wording was "blurs OTHER elements",
   * which implies the shown part stays sharp.
   *
   * A `clip-path` polygon rather than the same SVG mask the dim uses. The mask
   * is fine inside the SVG, but referencing an SVG <mask> from a CSS property
   * has patchy sizing behaviour across engines, and getting it subtly wrong
   * means the blur covers the target with nothing obviously broken to look at.
   * A polygon is arithmetic, and arithmetic can be tested.
   *
   * The inner rectangle is listed in the opposite winding to the outer one.
   * `polygon()` fills with the nonzero rule, so opposite winding is what makes
   * it a hole rather than a notch bitten out of one side.
   */
  const holeClip = outline
    ? (() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const x0 = (outline.left / vw) * 100;
        const x1 = ((outline.left + outline.width) / vw) * 100;
        const y0 = (outline.top / vh) * 100;
        const y1 = ((outline.top + outline.height) / vh) * 100;
        return [
          'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%',
          `${x0}% ${y1}%`,
          `${x1}% ${y1}%`,
          `${x1}% ${y0}%`,
          `${x0}% ${y0}%)`,
        ].join(', ');
      })()
    : undefined;

  return (
    <>
      {/* ---- The blur, with the target cut out of it ----
          `pointer-events-none` so this layer is purely visual; the blocker
          further down is the one that stops clicks. */}
      <div
        aria-hidden="true"
        // Named so one check can ask BOTH presentations the same question. The
        // narrow-screen modal has its own layer under the same name, and the
        // test below the desktop breakpoint is the one that would otherwise
        // never run. See `tourBackdrop.ts`.
        data-tour-backdrop=""
        className="pointer-events-none fixed inset-0 z-50"
        style={{
          backdropFilter: TOUR_BACKDROP_FILTER,
          WebkitBackdropFilter: TOUR_BACKDROP_FILTER,
          // No clip means no hole, which is the right fallback while the target
          // has not been measured: everything softened, rather than a hard
          // unblurred window over the wrong element.
          clipPath: holeClip,
          WebkitClipPath: holeClip,
        }}
      />

      {/* ---- The dim, with the target cut out of it ----
          Also pointer-events-none. An SVG mask affects what is painted, and
          what is painted is not a reliable answer to what receives a click
          across engines, so this layer is told outright not to take any. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50">
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

      {/* ---- The blocker.

          Sits last among the z-50 layers so it is the topmost thing at any
          point inside the hole's surroundings, and carries the same clip as
          the blur. Inside the hole it is not painted and so not hit; outside
          it swallows the click without doing anything with it.

          No background on purpose — this is an area that should feel dead, not
          one that should look different from the dim already behind it. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-50"
        style={{ clipPath: holeClip, WebkitClipPath: holeClip }}
      />

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
