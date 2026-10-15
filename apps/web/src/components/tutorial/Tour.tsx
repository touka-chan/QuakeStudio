import { useCallback, useEffect } from 'react';

import { useIsDesktop } from '@/lib/useMediaQuery';
import { BACK_REQUESTED } from '@/pwa/backButton';
import { useConfigStore } from '@/store/configStore';
import { useTourStore } from '@/store/tourStore';
import { SpotlightTour } from './SpotlightTour';
import { TourModal } from './TourModal';
import { TOUR_STEPS } from './tourSteps';

/* =========================================================================
   Guided tour — orchestration

   Owns when the tour opens, which presentation it uses, and how it ends. The
   two presentations know nothing about each other.

   THE ORDERING RULE
   This tour runs BEFORE the disclaimer gate, and the two are never open at the
   same time. The tour's `settled` flag is what releases the gate — see
   tourStore.ts for why that flag exists and what breaks without it.
   ========================================================================= */

type Props = {
  /**
   * Force the desktop presentation.
   *
   * jsdom has no layout engine, so every media query reports "no match" and a
   * test would silently exercise only the modal. Same escape hatch
   * `AppShell` and `useIsDesktop` already use.
   */
  forceDesktopLayout?: boolean;
};

export function Tour({ forceDesktopLayout }: Props = {}) {
  const isDesktop = useIsDesktop(forceDesktopLayout);

  const open = useTourStore((s) => s.open);
  const step = useTourStore((s) => s.step);
  const next = useTourStore((s) => s.next);
  const back = useTourStore((s) => s.back);
  const finish = useTourStore((s) => s.finish);
  const skip = useTourStore((s) => s.skip);

  /*
   * Tell the stylesheet the tour is up, so the 3D canvas can be blurred by a
   * rule rather than by a style write.
   *
   * An attribute on <html> rather than a class on a wrapper: the canvas is many
   * levels down inside a lazily mounted subtree, and a rule keyed on document
   * state cannot be out of step with React re-rendering the thing it applies to.
   * A per-frame style write to the canvas can be.
   *
   * Set on the root rather than on each presentation, so the spotlight and the
   * narrow-screen modal put the 3D in the same state and one check covers both.
   */
  useEffect(() => {
    document.documentElement.toggleAttribute('data-tour-open', open);
    return () => document.documentElement.removeAttribute('data-tour-open');
  }, [open]);

  /*
   * No effect decides whether to open the tour. The store's initial state
   * already knows, derived from the same storage read that decides `settled`
   * — see tourStore.ts. Deciding it here instead would mean two independent
   * decisions that can disagree, and the disagreement is a permanent lockout
   * of the disclaimer gate rather than anything a user could report usefully.
   */

  const end = useCallback((settle: () => void) => {
    /*
     * Apply whatever was changed while the tour was up.
     *
     * The controls are live during the tour but frozen — editing moves the
     * slider without moving the model. This is where the edit is handed over,
     * once, so the 3D catches up exactly as the overlay that was hiding the
     * difference goes away. Skip and finish are the only two ways out of a
     * tour, so there is no path that leaves an edit stranded in the draft.
     */
    useConfigStore.getState().commitTourEdits();
    settle();
  }, []);

  const handleNext = useCallback(() => {
    // The last step ends the tour rather than advancing past the end of the
    // array. Without this the card would render `undefined`.
    if (step >= TOUR_STEPS.length - 1) end(finish);
    else next();
  }, [step, next, end, finish]);

  const handleSkip = useCallback(() => end(skip), [end, skip]);

  /*
   * Escape, anywhere.
   *
   * The spotlight card traps focus, but the highlighted control is now live —
   * click a slider and focus leaves the card and goes to the page. From there
   * the card's own key handler never sees the keypress, and Escape would do
   * nothing. That is the one way out of a tutorial being unreachable, so it is
   * handled at the document.
   *
   * The card still handles Escape for itself, and this checks the store before
   * acting because both handlers are on the document and either may run first.
   * `skip()` closes the tour synchronously, so whoever gets there second finds
   * `open` false and stops. Same reason it is safe alongside Radix, which also
   * listens for Escape and routes to `onSkip`.
   */
  useEffect(() => {
    if (!open) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (!useTourStore.getState().open) return;
      event.preventDefault();
      handleSkip();
    }
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open, handleSkip]);

  /*
   * Android's back button.
   *
   * The narrow-screen tour is a Radix dialog and `backButton.ts` already
   * closes it, which routes here through `onSkip`. The spotlight is a custom
   * overlay, so nothing closes it and the press would fall through to the tab
   * bar behind. Handle it explicitly so a back press always means "leave the
   * tour" while it is on screen.
   */
  useEffect(() => {
    if (!open) return;
    function onBack() {
      handleSkip();
    }
    document.addEventListener(BACK_REQUESTED, onBack);
    return () => document.removeEventListener(BACK_REQUESTED, onBack);
  }, [open, handleSkip]);

  // Clamped rather than trusted: the store is module-level and a bad index
  // would otherwise render a card with no title.
  const index = Math.min(Math.max(step, 0), TOUR_STEPS.length - 1);
  const current = TOUR_STEPS[index];
  if (!current) return null;

  const shared = {
    step: current,
    index,
    total: TOUR_STEPS.length,
    isLast: index === TOUR_STEPS.length - 1,
    onNext: handleNext,
    onBack: back,
    onSkip: handleSkip,
  };

  if (!open) return null;

  return isDesktop ? <SpotlightTour {...shared} /> : <TourModal {...shared} />;
}
