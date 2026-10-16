import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';
import { AppShell } from '@/components/layout/AppShell';
import { TOUR_STEPS } from '@/components/tutorial/tourSteps';
import { placeCard } from '@/components/tutorial/placeCard';
import { STORAGE_KEYS } from '@/config/engineeringAssumptions';
import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { useConfigStore } from '@/store/configStore';
import { __testing as tourTesting, useTourStore } from '@/store/tourStore';

/* ==========================================================================
   Guided tour

   Most of this file is about one relationship: the tour and the disclaimer
   gate are two different things and neither may do the other's job.

   The tour teaches the interface and is skippable. The gate tells a student
   the model is a placeholder before they see a number, and is not. If a
   single control could skip both, a user would reach results without ever
   being told — and the one thing this project exists to avoid is results that
   read as real.

   jsdom has no layout engine, so `getBoundingClientRect()` returns zeroes and
   nothing about the spotlight's actual placement can be asserted here. Those
   checks belong to `npm run e2e` and `npm run web:audit`, which have a real
   browser. What this file checks is the behaviour: flow, keyboard, focus, and
   the separation between the two overlays.
   ========================================================================== */

vi.mock('@/components/viewport/Viewport', () => ({
  Viewport: () => <div data-testid="viewport-stub">3D viewport</div>,
}));

beforeEach(() => {
  localStorage.clear();
  useTourStore.getState().start();
  useTourStore.getState().skip(); // settles; individual tests opt back in
  tourTesting.reset();
});

/** Put the browser in the state of a user who has never seen the tour. */
/**
 * The floors slider.
 *
 * Queried by label rather than by role-and-name: while the tour is up as a
 * modal it marks the workspace aria-hidden, and an aria-hidden element has no
 * accessible name to compute, so a role query cannot match it at all. Same wall
 * the "How to use" button hit.
 */
function floorsSlider(): HTMLElement {
  return screen.getByLabelText('Floors');
}

function asFirstTimer() {
  localStorage.removeItem(STORAGE_KEYS.tourSuppressed);
  tourTesting.reset();
}

describe('guided tour — first run', () => {
  it('appears on a first visit', async () => {
    asFirstTimer();
    render(<App />);
    expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  /*
   * Not a first run. The tour has no memory at all — it shows on every visit
   * — so the only way to be without it is to suppress it explicitly, which is
   * what the automated checks do to measure the plain workspace.
   */
  it('stays away when it has been suppressed', async () => {
    localStorage.setItem(STORAGE_KEYS.tourSuppressed, 'true');
    tourTesting.reset();
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText(/step 1 of 4/i)).not.toBeInTheDocument();
    });
  });

  it('still appears to a user who already acknowledged the disclaimer', async () => {
    localStorage.setItem(STORAGE_KEYS.disclaimerSuppressed, 'true');
    asFirstTimer();
    render(<App />);
    expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  /*
   * The tour leaves nothing behind.
   *
   * It runs on every visit, so a key recording that it had been seen would be
   * a lie — and would be one more thing for a reader to puzzle over. Asserted
   * directly rather than inferred: a future "remember the user dismissed it"
   * feature would break this on purpose.
   */
  it('writes nothing to storage when it ends', async () => {
    asFirstTimer();
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /skip tour/i }));

    expect(localStorage.getItem(STORAGE_KEYS.tourSuppressed)).toBeNull();
  });
});

describe('guided tour — and the disclaimer gate', () => {
  it('holds the gate closed while it is on screen', async () => {
    asFirstTimer();
    render(<App />);

    expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();
    // The gate's own copy must not be reachable yet.
    expect(screen.queryByRole('button', { name: /start exploring/i })).not.toBeInTheDocument();
  });

  it('releases the gate once the tour is skipped', async () => {
    asFirstTimer();
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /skip tour/i }));

    expect(await screen.findByRole('button', { name: /start exploring/i })).toBeInTheDocument();
  });

  /*
   * The important one. Skipping the tutorial must not skip the disclaimer —
   * that is the whole reason these are two separate mechanisms.
   */
  it('does NOT let skipping the tour bypass the disclaimer gate', async () => {
    asFirstTimer();
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /skip tour/i }));

    const start = await screen.findByRole('button', { name: /start exploring/i });
    expect(start).toBeDisabled();
    expect(localStorage.getItem(STORAGE_KEYS.disclaimerSuppressed)).toBeNull();
  });

  it('does NOT record the disclaimer when the tour is skipped', async () => {
    asFirstTimer();
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /skip tour/i }));

    expect(localStorage.getItem(STORAGE_KEYS.tourSuppressed)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.disclaimerSuppressed)).toBeNull();
  });

  it('releases the gate after the tour is completed, not just skipped', async () => {
    asFirstTimer();
    render(<App />);

    for (let i = 0; i < TOUR_STEPS.length; i += 1) {
      const button = await screen.findByRole('button', {
        name: i === TOUR_STEPS.length - 1 ? /finish/i : /^next$/i,
      });
      await userEvent.click(button);
    }

    expect(await screen.findByRole('button', { name: /start exploring/i })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEYS.tourSuppressed)).toBeNull();
  });
});

describe('guided tour — re-entry', () => {
  it('can be reopened from the top bar after it has been seen', async () => {
    localStorage.setItem(STORAGE_KEYS.disclaimerSuppressed, 'true');
    localStorage.setItem(STORAGE_KEYS.tourSuppressed, 'true');
    tourTesting.reset();
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /how to use/i }));

    expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  /*
   * `start()` rewinds to step 0. A live button during the tour would let a
   * click throw away progress part way through.
   */
  /*
   * Hidden, not disabled.
   *
   * It used to sit disabled in the top bar. As a floating button it would be
   * visible over the overlay and under the tour's own layers — looking live and
   * not responding — while the card already offers "Skip tour".
   */
  it('takes its own button out of reach while the tour is showing', async () => {
    localStorage.setItem(STORAGE_KEYS.disclaimerSuppressed, 'true');
    asFirstTimer();
    render(<App />);

    expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();

    /*
     * Out of reach, but still mounted.
     *
     * It used to sit disabled in the top bar, and the first floating version
     * returned null — which broke focus restoration, because this button is
     * the usual way into the tour and so is usually what had focus when the
     * tour opened. Unmounting it means the focus trap hands focus to an
     * element that is gone, and it lands on <body> instead.
     */
    const button = document.querySelector<HTMLElement>('[aria-label="How to use"]');
    expect(button, 'the button was removed rather than hidden').not.toBeNull();
    // Hidden from assistive technology and not in the tab order. The tabIndex
    // is what makes the aria-hidden legal — axe checks for that pairing.
    expect(button).toHaveAttribute('aria-hidden', 'true');
    expect(button).toHaveAttribute('tabindex', '-1');
  });
});

describe('guided tour — navigation', () => {
  it('walks forwards and backwards through every step', async () => {
    asFirstTimer();
    render(<App />);

    expect(await screen.findByText(TOUR_STEPS[0]!.title)).toBeInTheDocument();

    for (let i = 1; i < TOUR_STEPS.length; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
      expect(await screen.findByText(TOUR_STEPS[i]!.title)).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(await screen.findByText(TOUR_STEPS[TOUR_STEPS.length - 2]!.title)).toBeInTheDocument();
  });

  it('cannot go back from the first step', async () => {
    asFirstTimer();
    render(<App />);
    expect(await screen.findByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('shows the position in text, not only as dots', async () => {
    asFirstTimer();
    render(<App />);
    expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    asFirstTimer();
    render(<App />);
    await screen.findByText(/step 1 of 4/i);

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByText(/step 1 of 4/i)).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(STORAGE_KEYS.tourSuppressed)).toBeNull();
  });
});

describe('guided tour — the spotlight', () => {
  /*
   * `forceDesktopLayout` is required: jsdom reports every media query as "no
   * match", so without it these tests would silently exercise the narrow-screen
   * modal and never render the spotlight at all.
   */
  it('renders a positioned card rather than a modal on a desktop layout', async () => {
    asFirstTimer();
    render(<AppShell forceDesktopLayout />);

    const card = await screen.findByRole('dialog');
    expect(within(card).getByText(TOUR_STEPS[0]!.title)).toBeInTheDocument();
  });

  it('describes the element it is pointing at, and stops when it closes', async () => {
    asFirstTimer();
    const { container } = render(<AppShell forceDesktopLayout />);
    await screen.findByRole('dialog');

    const target = container.querySelector('[data-tour="controls"]');
    expect(target).not.toBeNull();
    const describedBy = target!.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    // It must not be left behind describing a dialog that is gone.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(target!.getAttribute('aria-describedby')).toBeNull();
    });
  });

  it('keeps focus inside the card and gives it back on close', async () => {
    localStorage.setItem(STORAGE_KEYS.tourSuppressed, 'true');
    localStorage.setItem(STORAGE_KEYS.disclaimerSuppressed, 'true');
    tourTesting.reset();
    render(<AppShell forceDesktopLayout />);

    /*
     * The real trigger, not a stand-in. An earlier version of this test
     * appended its own button to the document and clicked it — which does
     * nothing, and would have failed for the wrong reason while looking like a
     * focus bug.
     */
    const trigger = screen.getByRole('button', { name: /how to use/i });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await userEvent.click(trigger);
    await screen.findByRole('dialog');

    const card = screen.getByRole('dialog');
    expect(card.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('moves between steps with the arrow keys', async () => {
    asFirstTimer();
    render(<AppShell forceDesktopLayout />);

    const card = await screen.findByRole('dialog');
    card.focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByText(TOUR_STEPS[1]!.title)).toBeInTheDocument();

    await userEvent.keyboard('{ArrowLeft}');
    expect(await screen.findByText(TOUR_STEPS[0]!.title)).toBeInTheDocument();
  });
});

/*
 * THE MODEL BEHIND THE TOUR STAYS STILL
 *
 * The controls are live during the tour — that was asked for — but editing them
 * must not move the 3D model, the charts or the numbers. Otherwise the tour is
 * describing one building while a different one grows behind the glass, which
 * is worse than not explaining anything.
 *
 * The edit is not thrown away: it is handed over when the tour closes, so the
 * model catches up exactly as the overlay goes away.
 */
describe('guided tour — the model behind stays put', () => {
  beforeEach(() => {
    useConfigStore.setState({
      building: DEFAULT_BUILDING_CONFIG,
      displayBuilding: DEFAULT_BUILDING_CONFIG,
    });
  });

  it('moves the control but not the building while the tour is showing', async () => {
    const user = userEvent.setup();
    asFirstTimer();
    render(<AppShell forceDesktopLayout />);
    await screen.findByText(/step 1 of 4/i);

    const slider = floorsSlider();
    slider.focus();
    await user.keyboard('{ArrowRight}');

    const state = useConfigStore.getState();
    expect(state.displayBuilding.floors).toBe(DEFAULT_BUILDING_CONFIG.floors + 1);
    expect(state.building.floors, 'the 3D model changed behind the tour').toBe(
      DEFAULT_BUILDING_CONFIG.floors,
    );
  });

  it('applies the edit once the tour closes', async () => {
    const user = userEvent.setup();
    asFirstTimer();
    render(<AppShell forceDesktopLayout />);
    await screen.findByText(/step 1 of 4/i);

    const slider = floorsSlider();
    slider.focus();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{ArrowRight}');

    await user.click(screen.getByRole('button', { name: /skip tour/i }));

    expect(useConfigStore.getState().building.floors).toBe(DEFAULT_BUILDING_CONFIG.floors + 2);
  });

  it('changes the building straight away when there is no tour', async () => {
    const user = userEvent.setup();
    /*
     * Both suppressions are needed. Without the tour the disclaimer gate takes
     * the screen instead, and it is a Radix dialog whose focus scope pulls
     * focus straight back into it — so the slider never receives a keypress and
     * the test fails for a reason that has nothing to do with freezing.
     */
    localStorage.setItem(STORAGE_KEYS.tourSuppressed, 'true');
    localStorage.setItem(STORAGE_KEYS.disclaimerSuppressed, 'true');
    tourTesting.reset();
    render(<AppShell forceDesktopLayout />);

    const slider = floorsSlider();
    slider.focus();
    await user.keyboard('{ArrowRight}');

    // No draft, no wait: the building is the display copy.
    expect(useConfigStore.getState().building.floors).toBe(DEFAULT_BUILDING_CONFIG.floors + 1);
  });
});

describe('guided tour — where the card goes', () => {
  /*
   * These exist because the first implementation put the card off the top of
   * the screen, and only an end-to-end test in a real browser could see it. The
   * arithmetic has no browser in it, so it can be checked directly here
   * instead — including at shapes no test runner happens to run at.
   */

  const CARD = { width: 352, height: 260 };
  const DESKTOP = { width: 1280, height: 720 };

  function onScreen(at: { left: number; top: number }, viewport = DESKTOP) {
    return (
      at.left >= 0 &&
      at.top >= 0 &&
      at.left + CARD.width <= viewport.width &&
      at.top + CARD.height <= viewport.height
    );
  }

  /*
   * Above, not below.
   *
   * This was the opposite way round until it was measured on a running app: a
   * card that lands above its subject reads like a caption, and for the compare
   * button — the last thing in a long scrollable panel — "below" put the card
   * straight over the content it was describing.
   */
  it('prefers above the target', () => {
    const at = placeCard({ top: 400, left: 400, width: 200, height: 100 }, CARD, DESKTOP);
    expect(at.top + CARD.height).toBeLessThanOrEqual(400);
  });

  /*
   * The regression. A target as tall as the window leaves no room above or
   * below it, which is exactly the case that put the card off screen.
   */
  it('never pushes the card off the top of the window', () => {
    const fullHeightPanel = { top: 71, left: 0, width: 320, height: 649 };
    const at = placeCard(fullHeightPanel, CARD, DESKTOP);
    expect(onScreen(at)).toBe(true);
  });

  /*
   * The broad version: whatever the target is doing, the card stays on screen.
   * One representative shape proves nothing — the original bug only appeared
   * for some shapes and not others.
   */
  it('keeps the card on screen for every shape of target', () => {
    const topLefts = [
      { top: 0, left: 0 },
      { top: 0, left: 900 },
      { top: 460, left: 0 },
      { top: 460, left: 900 },
      { top: 200, left: 400 },
      { top: 700, left: 400 },
    ];
    const sizes = [
      { width: 10, height: 10 },
      { width: 320, height: 649 },
      { width: 640, height: 649 },
      { width: 1280, height: 720 },
      { width: 200, height: 20 },
    ];

    for (const topLeft of topLefts) {
      for (const size of sizes) {
        const target = { ...topLeft, ...size };
        const at = placeCard(target, CARD, DESKTOP);
        expect(onScreen(at), `target ${JSON.stringify(target)} -> ${JSON.stringify(at)}`).toBe(
          true,
        );
      }
    }
  });

  it('keeps the card on screen when the target is bigger than the window', () => {
    const huge = { top: -500, left: -500, width: 4000, height: 4000 };
    expect(onScreen(placeCard(huge, CARD, DESKTOP))).toBe(true);
  });

  it('keeps the card on screen when the card is taller than the window', () => {
    const tallCard = { width: 352, height: 900 };
    const at = placeCard({ top: 100, left: 100, width: 200, height: 100 }, tallCard, DESKTOP);
    expect(at.top).toBeGreaterThanOrEqual(0);
    expect(at.left).toBeGreaterThanOrEqual(0);
  });

  it('does not cover the target when a position that fits exists', () => {
    // A small target in the top-left has room beside it.
    const small = { top: 100, left: 100, width: 120, height: 60 };
    const at = placeCard(small, CARD, DESKTOP);
    const overlaps =
      small.left < at.left + CARD.width &&
      at.left < small.left + small.width &&
      small.top < at.top + CARD.height &&
      at.top < small.top + small.height;
    expect(overlaps).toBe(false);
  });

  it('centres the card when the target cannot be found', () => {
    const at = placeCard(null, CARD, DESKTOP);
    expect(at.left).toBe((DESKTOP.width - CARD.width) / 2);
    expect(at.top).toBe((DESKTOP.height - CARD.height) / 2);
  });

  it('works at a phone size too', () => {
    const phone = { width: 360, height: 720 };
    const at = placeCard({ top: 60, left: 0, width: 360, height: 600 }, CARD, phone);
    expect(onScreen(at, phone)).toBe(true);
  });

  /*
   * The regression, with the numbers measured off a running app rather than
   * invented — and at the size they were measured at.
   *
   * The compare button's right edge is eight pixels from the window edge — that
   * is the outline padding — so a card aligned to it came out one pixel past
   * the clamp limit. The old "nothing may be clamped" rule threw that
   * candidate away and the card landed beside the button instead of above it.
   *
   * These four numbers are the box of that button and of the card, read out of
   * a 1600x900 browser. An earlier version of this test used them against
   * DESKTOP, which is 1280x720 — so the target sat below the viewport and the
   * test passed for a reason that had nothing to do with placement. Same
   * numbers, wrong window, worthless test.
   */
  it('puts the card above a target sitting against the right edge', () => {
    const wide = { width: 1600, height: 900 };
    const realCard = { width: 352, height: 223 };
    const button = { top: 800, left: 1233, width: 351, height: 44 };

    const at = placeCard(button, realCard, wide);

    expect(onScreen(at, wide)).toBe(true);
    // Above the button, not beside it and not on top of it.
    expect(at.top + realCard.height).toBeLessThanOrEqual(button.top);
    expect(at.left).toBeGreaterThanOrEqual(button.left - 1);
  });

  /*
   * The property the placement is for, checked across the same sweep: wherever
   * a non-covering position exists at all, the card finds it.
   */
  it('never covers the target when the page leaves room somewhere', () => {
    const topLefts = [
      { top: 40, left: 40 },
      { top: 40, left: 800 },
      { top: 600, left: 40 },
      { top: 600, left: 800 },
      { top: 300, left: 400 },
    ];
    const sizes = [
      { width: 60, height: 44 },
      { width: 200, height: 80 },
      { width: 351, height: 44 },
    ];

    for (const topLeft of topLefts) {
      for (const size of sizes) {
        const target = { ...topLeft, ...size };
        const at = placeCard(target, CARD, DESKTOP);
        const covers =
          at.left < target.left + target.width &&
          target.left < at.left + CARD.width &&
          at.top < target.top + target.height &&
          target.top < at.top + CARD.height;
        expect(covers, `target ${JSON.stringify(target)} -> ${JSON.stringify(at)}`).toBe(false);
      }
    }
  });
});

describe('guided tour — content', () => {
  it('uses the real metric names rather than invented ones', () => {
    // These are the labels ResultsPanel actually renders. If they change, this
    // fails, which is the point: the tour must not describe numbers that the
    // app does not show.
    const body = TOUR_STEPS[2]!.body;
    expect(body).toMatch(/Peak displacement/);
    expect(body).toMatch(/max story drift/i);
    expect(body).toMatch(/natural period/i);
  });

  it('makes no claim about safety anywhere in the copy', () => {
    for (const step of TOUR_STEPS) {
      expect(step.body).not.toMatch(/\bsafe\b|\bunsafe\b|will not collapse|cannot collapse/i);
    }
  });

  it('states that the exaggerated motion does not change the numbers', () => {
    expect(TOUR_STEPS[1]!.body).toMatch(/only changes the drawing/i);
  });

  it('points every step at an element that exists in the app', () => {
    const { container } = render(<AppShell forceDesktopLayout />);
    for (const step of TOUR_STEPS) {
      expect(container.querySelector(`[data-tour="${step.target}"]`)).not.toBeNull();
    }
  });
});
