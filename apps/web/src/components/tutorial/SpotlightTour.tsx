import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { useFocusTrap } from './useFocusTrap';
import { useTargetRect } from './useTargetRect';
import { CARD_WIDTH, holePolygon, OUTLINE_PAD, placeCard } from './placeCard';
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
  /*
   * The hole, from `placeCard.ts`, which clamps it to the window first.
   *
   * It used to be built here from the outline's numbers straight through, and
   * two of the four steps point at a full-height side panel whose outline runs
   * past the right and bottom edges. A ring whose inner rectangle hangs outside
   * its outer one self-intersects, and under the nonzero fill rule whole
   * regions stop being clipped — which is what left the controls panel sharp
   * on the steps that report the numbers. The arithmetic and the reason for the
   * clamp are both in `placeCard.ts`; see `holePolygon`.
   */
  const holeClip = outline
    ? holePolygon(outline, { width: window.innerWidth, height: window.innerHeight })
    : undefined;

  return (
    <>
      {/* ---- The blur, with the target cut out of it ----

          The hole is the point of the whole effect, and it stays: the client
          wants the control being talked about sharp, and everything around it
          softened. Confirmed twice — "the thing being pointed at should NOT be
          blurred" — after a first reading that took the opposite meaning and
          was wrong.

          What is not covered by this layer, and used to be, is the 3D canvas.
          The canvas is blurred separately, by a rule on `html[data-tour-open]`
          in index.css, because `backdrop-filter` was skipping it entirely and
          a compositing decision cannot be argued with from here. See there for
          why, and for why no tour step points at the canvas — the invariant a
          test holds.

          NO HOLE IN THIS LAYER, AND THAT IS THE POINT.

          It used to carry a `clip-path` with the target cut out of it, so the
          highlighted control would show through unblurred. Chromium drops
          `backdrop-filter` altogether on an element that also has a clip or a
          mask, so that hole did not make the control sharp — it made the whole
          page stop being blurred, which is what the client reported three times
          and what no assertion about the filter itself would ever have found.

          So nothing is cut here. Everything behind is softened, and the target
          is painted above this layer instead — `html[data-tour-open]
          [data-tour-active]` in index.css, which is the single place that says
          what stays sharp. Measured: 7.2% of edges left in the page with the
          hole, 2.7% without it, 7.1% with the tour closed.

          The dim below still cuts a hole, because an SVG mask on a plain fill
          is not the same thing as a mask on a backdrop filter and works fine.

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
        }}
      />

      {/* ---- The dim, with the target cut out of it ----
          Cut in step with the blur, so the target is neither softened nor
          darkened. Dimming it but not the blur would leave a bright patch
          sitting in a soft page, which reads as a rendering fault.

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
          className={`pointer-events-none fixed z-[70] rounded-2xl ring-2 ring-primary ${
            reduced ? '' : 'transition-all duration-200'
          }`}
          style={outline}
        />
      )}

      {/* ---- The blocker.

          THE ONLY LAYER WITH A HOLE IN IT ANY MORE, and for the same reason it
          always had one: the hole is where the user is meant to be able to act.
          Inside it this layer is not painted and so not hit; outside it swallows
          the click without doing anything with it. Without it a user told to
          "set the floors" could not drag the slider or scroll the panel they
          were being shown, which is the worst version of a tutorial.

          The blur lost its hole — a clipped element is not given a backdrop
          filter — and the target is now painted above the blur instead, so this
          layer carries the only clip in the tour. A `clip-path` with no
          backdrop filter on it behaves exactly as intended, which is why it is
          the one that keeps it.

          Sits last among the z-50 layers so it is the topmost thing at any
          point inside the hole's surroundings.

          No background on purpose — this is an area that should feel dead, not
          one that should look different from the dim already behind it. */}
      <div
        aria-hidden="true"
        // Named for the end-to-end tests, for the same reason the outline is:
        // the clip on this layer is the tour's only remaining hole, and a test
        // that could not find it would quietly measure nothing.
        data-tour-blocker=""
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
        className={`fixed z-[80] w-[22rem] max-w-[calc(100%-2rem)] rounded-app border border-line bg-surface p-4 shadow-xl ${
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
