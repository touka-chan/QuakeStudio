import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';
import { AppShell } from '@/components/layout/AppShell';
import { TOUR_STEPS } from '@/components/tutorial/tourSteps';
import { placeCard } from '@/components/tutorial/placeCard';
import { STORAGE_KEYS } from '@/config/engineeringAssumptions';
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
function asFirstTimer() {
  localStorage.removeItem(STORAGE_KEYS.tourCompleted);
  tourTesting.reset();
}

describe('guided tour — first run', () => {
  it('appears on a first visit', async () => {
    asFirstTimer();
    render(<App />);
    expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  it('does not appear again once it has been seen', async () => {
    localStorage.setItem(STORAGE_KEYS.tourCompleted, 'true');
    tourTesting.reset();
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText(/step 1 of 4/i)).not.toBeInTheDocument();
    });
  });

  /*
   * The regression this whole design exists to prevent.
   *
   * The tour's completion is tracked under its own key. Keying it off the
   * disclaimer instead would mean every existing user — anyone who already
   * ticked the acknowledgement box — had also, invisibly, marked the tour as
   * seen, and it would never show for them.
   */
  it('still appears to a user who already acknowledged the disclaimer', async () => {
    localStorage.setItem(STORAGE_KEYS.firstRunAcknowledged, 'true');
    asFirstTimer();
    render(<App />);
    expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();
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
    expect(localStorage.getItem(STORAGE_KEYS.firstRunAcknowledged)).toBeNull();
  });

  it('does NOT record the disclaimer when the tour is skipped', async () => {
    asFirstTimer();
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /skip tour/i }));

    expect(localStorage.getItem(STORAGE_KEYS.tourCompleted)).toBe('true');
    expect(localStorage.getItem(STORAGE_KEYS.firstRunAcknowledged)).toBeNull();
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
    expect(localStorage.getItem(STORAGE_KEYS.tourCompleted)).toBe('true');
  });
});

describe('guided tour — re-entry', () => {
  it('can be reopened from the top bar after it has been seen', async () => {
    localStorage.setItem(STORAGE_KEYS.firstRunAcknowledged, 'true');
    localStorage.setItem(STORAGE_KEYS.tourCompleted, 'true');
    tourTesting.reset();
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /how to use/i }));

    expect(await screen.findByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  /*
   * `start()` rewinds to step 0. A live button during the tour would let a
   * click throw away progress part way through.
   */
  it('disables its own button while the tour is showing', async () => {
    localStorage.setItem(STORAGE_KEYS.firstRunAcknowledged, 'true');
    asFirstTimer();
    render(<App />);

    /*
     * Queried by label rather than by role with a name filter.
     *
     * The tour is a Radix modal here, so the top bar is behind an
     * `aria-hidden` subtree — correctly, since assistive technology should not
     * reach past a modal. And an `aria-hidden` element has no accessible
     * *name* to compute, so `getByRole(..., { name })` cannot match it at all.
     * Reading the label attribute directly is unaffected.
     *
     * That the query needs this workaround is itself the assertion: while the
     * tour owns the page, nothing behind it is reachable.
     */
    expect(await screen.findByLabelText('How to use')).toBeDisabled();
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
    expect(localStorage.getItem(STORAGE_KEYS.tourCompleted)).toBe('true');
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
    localStorage.setItem(STORAGE_KEYS.tourCompleted, 'true');
    localStorage.setItem(STORAGE_KEYS.firstRunAcknowledged, 'true');
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

  it('prefers below the target', () => {
    const at = placeCard({ top: 100, left: 400, width: 200, height: 100 }, CARD, DESKTOP);
    expect(at.top).toBeGreaterThan(200);
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
