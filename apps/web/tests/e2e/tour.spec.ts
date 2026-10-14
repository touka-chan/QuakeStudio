import { expect, test, type Locator, type Page } from '@playwright/test';

/* ==========================================================================
   Guided tour, in a real browser.

   jsdom cannot do layout, so everything about *where* the tour actually puts
   itself is checked here instead. That is not a formality: the geometry of an
   overlay is exactly where this codebase has been bitten before — a top bar
   that overflowed and cut off two controls at 360px, a dialog whose panel
   never scrolled because `h-full` could not resolve against a flex height, a
   `truncate` that set `overflow: hidden` on an inline span so `scrollWidth`
   never reported the loss.

   None of those would have failed a jsdom test. All of them are caught here.
   ========================================================================== */

/**
 * Put the browser in the state of a user who has never seen the tour.
 *
 * Runs as an init script so the flag is absent before React first reads it.
 * The disclaimer is acknowledged, because most of these tests are about the
 * tour and not about the gate that follows it.
 *
 * The sentinel matters: `addInitScript` runs on EVERY navigation, so a reload
 * would otherwise delete the very key the app had just written and the tour
 * would reappear — which looks exactly like the tour failing to remember
 * itself, and is not.
 */
async function asFirstTimer(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('quakestudio.firstRunAcknowledged', 'true');
      if (!localStorage.getItem('__tourSeeded')) {
        localStorage.removeItem('quakestudio.tourCompleted');
        localStorage.setItem('__tourSeeded', 'true');
      }
    } catch {
      /* nothing to do */
    }
  });
}

/**
 * A user who has seen neither the tour nor the disclaimer — the only state in
 * which the gate appears at all. Needed by the test that proves the two
 * overlays are never stacked.
 */
async function asCompleteFirstTimer(page: Page) {
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem('__tourSeeded')) {
        localStorage.removeItem('quakestudio.tourCompleted');
        localStorage.removeItem('quakestudio.firstRunAcknowledged');
        localStorage.setItem('__tourSeeded', 'true');
      }
    } catch {
      /* nothing to do */
    }
  });
}

function card(page: Page): Locator {
  return page.getByRole('dialog');
}

/**
 * The box, once it has stopped moving.
 *
 * A step change scrolls its target into view smoothly, and `boundingBox()`
 * resolves immediately rather than waiting for an animation. Measuring through
 * a scroll measures a position the user never saw, and a test built on that
 * passes or fails for reasons that have nothing to do with the code.
 *
 * Polls until two consecutive reads agree.
 */
async function settledBox(locator: Locator): Promise<Awaited<ReturnType<Locator['boundingBox']>>> {
  let previous = '';
  for (let i = 0; i < 40; i += 1) {
    const box = await locator.boundingBox();
    const key = box ? JSON.stringify(box) : 'none';
    if (key === previous) return box;
    previous = key;
    await locator.page().waitForTimeout(50);
  }
  return locator.boundingBox();
}

/** True when the box is entirely within the viewport. */
function fullyOnScreen(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
) {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= viewport.width + 1 &&
    box.y + box.height <= viewport.height + 1
  );
}

test.describe('guided tour', () => {
  test.beforeEach(async ({ page }) => {
    await asFirstTimer(page);
    await page.goto('/');
    await expect(card(page)).toBeVisible();
  });

  test('runs before anything else, and every step stays on screen', async ({ page }) => {
    const steps = await card(page).locator('ol li').count();
    expect(steps).toBe(4);

    for (let i = 0; i < steps; i += 1) {
      const box = await settledBox(card(page));
      expect(box, `step ${i + 1} has no box`).not.toBeNull();
      expect(fullyOnScreen(box!, page.viewportSize()!), `step ${i + 1} card is off screen`).toBe(
        true,
      );

      if (i < steps - 1)
        await card(page)
          .getByRole('button', { name: /^next$/i })
          .click();
    }
  });

  /*
   * The card must not sit on top of the thing it is pointing at. If it did,
   * the user would be reading an explanation of a panel they cannot see.
   */
  test('the card never covers the element it is describing', async ({ page }) => {
    for (let i = 0; i < 4; i += 1) {
      const outline = await settledBox(page.locator('[data-tour-outline]'));
      const cardBox = await settledBox(card(page));

      // Both are measured after the step has settled, so this is the layout
      // the user actually reads rather than a frame mid-transition.
      expect(outline, `step ${i + 1} drew no outline`).not.toBeNull();
      expect(cardBox, `step ${i + 1} has no card`).not.toBeNull();

      const overlaps =
        outline!.x < cardBox!.x + cardBox!.width &&
        cardBox!.x < outline!.x + outline!.width &&
        outline!.y < cardBox!.y + cardBox!.height &&
        cardBox!.y < outline!.y + outline!.height;

      expect(overlaps, `step ${i + 1}: the card covers what it points at`).toBe(false);

      const next = card(page).getByRole('button', { name: /^next$/i });
      if (await next.count()) await next.click();
      else break;
    }
  });

  test('highlights a real element on every step', async ({ page }) => {
    for (let i = 0; i < 4; i += 1) {
      const outlined = page.locator('[data-tour-outline]');
      await expect(outlined).toHaveCount(1);
      const box = await settledBox(outlined);
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeGreaterThan(0);

      /*
       * And the thing being pointed at has to be somewhere the user can
       * actually see.
       *
       * Step 4 points at the compare button, which sits below the fold of the
       * results panel. Without the tour scrolling its target into view the
       * outline was drawn around a control off the bottom of the screen — the
       * card got placed for something the reader had never been shown.
       *
       * Measured on the element rather than the outline, which deliberately
       * overhangs it by 8px and so hangs off the bottom of the screen whenever
       * the target is a full-height panel.
       */
      const size = page.viewportSize()!;
      const active = page.locator('[data-tour-active]');
      await expect(active).toHaveCount(1);
      const shown = await settledBox(active);
      expect(shown!.y, `step ${i + 1} starts above the screen`).toBeGreaterThanOrEqual(0);
      expect(shown!.y + shown!.height, `step ${i + 1} runs off the bottom`).toBeLessThanOrEqual(
        size.height,
      );
      expect(shown!.x + shown!.width, `step ${i + 1} runs off the right`).toBeLessThanOrEqual(
        size.width,
      );

      const next = card(page).getByRole('button', { name: /^next$/i });
      if (await next.count()) await next.click();
    }
  });

  test('can be completed with the keyboard alone', async ({ page }) => {
    for (let i = 0; i < 3; i += 1) {
      await card(page)
        .getByRole('button', { name: /^next$/i })
        .press('Enter');
    }
    await card(page)
      .getByRole('button', { name: /finish/i })
      .press('Enter');
    await expect(card(page)).toHaveCount(0);
  });

  test('Escape leaves it, and it does not come back', async ({ page }) => {
    await card(page).press('Escape');
    await expect(card(page)).toHaveCount(0);

    await page.reload();
    await expect(card(page)).toHaveCount(0);
  });

  test('skips it and returns to the workspace', async ({ page }) => {
    await card(page)
      .getByRole('button', { name: /skip tour/i })
      .click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /how to use/i })).toBeVisible();
  });

  /*
   * The re-entry point. Without it the tour is a one-shot wall, and a user who
   * dismissed it in a hurry has no way back.
   */
  test('reopens from the top bar, and the How to use button is reachable', async ({ page }) => {
    await card(page)
      .getByRole('button', { name: /skip tour/i })
      .click();
    await expect(card(page)).toHaveCount(0);

    await page.getByRole('button', { name: /how to use/i }).click();
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByText(/step 1 of 4/i)).toBeVisible();
  });
});

/*
 * The highlighted control is live.
 *
 * Everything here is about the hole in the blocker. Previously the scrim ate
 * every click, so a user told to "set the floors" could not scroll the panel
 * they were being shown, let alone drag anything in it — the worst version of a
 * tutorial. jsdom cannot see any of this, so it has to be a real browser.
 */
test.describe('the highlighted control is live', () => {
  test.beforeEach(async ({ page }) => {
    await asFirstTimer(page);
    await page.goto('/');
    await expect(card(page)).toBeVisible();
  });

  test('the highlighted panel scrolls while the tour is showing', async ({ page }) => {
    const panel = page.locator('[data-tour-active]');
    const box = await settledBox(panel);
    expect(box).not.toBeNull();

    // Put the pointer over the panel, then turn the wheel.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);

    const moved = await panel.evaluate((el) => {
      /*
       * Look DOWN through the panel, not up from it.
       *
       * The scrolling element is a ScrollArea inside the panel, so it is a
       * descendant. An earlier version walked up from the panel and found
       * nothing, and reported "did not scroll" for a panel that had scrolled.
       * Measuring the wrong element is the same mistake whichever way it points.
       */
      for (const node of el.querySelectorAll<HTMLElement>('*')) {
        if (node.scrollTop > 0) return node.scrollTop;
      }
      return 0;
    });

    expect(moved, 'the highlighted panel did not scroll').toBeGreaterThan(0);
  });

  test('a control inside the highlight can actually be used', async ({ page }) => {
    // Step 1 highlights the whole controls panel, so the material buttons are
    // inside the hole and should be live.
    const steel = page.getByRole('radio', { name: /steel/i });
    await steel.click();

    await expect(steel).toBeChecked();
  });

  test('everything outside the highlight is still blocked', async ({ page }) => {
    /*
     * Proved by what is on top, not by clicking and hoping.
     *
     * `click()` cannot express this. It waits for the element to be actionable,
     * so a correctly blocked control does not fail — it times out. The first
     * version of this test did exactly that and read as a bug.
     */
    const covered = await page.evaluate(() => {
      const toggle = document.querySelector<HTMLElement>('[aria-label^="Switch to"]');
      if (!toggle) return { reachable: null };
      const r = toggle.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { reachable: hit ? toggle === hit || toggle.contains(hit) : false };
    });

    expect(covered.reachable, 'a control outside the highlight was reachable').toBe(false);

    // And the click really does nothing, forced past the actionability wait.
    const toggle = page.getByRole('button', { name: /switch to .* theme/i });
    const box = await toggle.boundingBox();
    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));

    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(150);

    const after = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(after, 'a click outside the highlight got through').toBe(before);
  });

  /*
   * Once the user reaches into the page, focus leaves the card. Escape has to
   * keep working from there, or there is no way out of a tutorial that has the
   * user reaching into the app.
   */
  test('Escape still works after using a control inside the highlight', async ({ page }) => {
    await page.getByRole('radio', { name: /steel/i }).click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
  });

  test('the tour survives a control being changed underneath it', async ({ page }) => {
    await page.getByRole('radio', { name: /steel/i }).click();
    await page.waitForTimeout(200);

    // Still showing step 1, still pointing at the same thing, still on screen.
    await expect(card(page).getByText(/step 1 of 4/i)).toBeVisible();
    const outline = await settledBox(page.locator('[data-tour-outline]'));
    const size = page.viewportSize()!;
    expect(outline!.x).toBeGreaterThanOrEqual(-10);
    expect(outline!.y + outline!.height).toBeLessThanOrEqual(size.height + 10);
  });
});

/*
 * The narrow-screen presentation, which is a real dialog and therefore the one
 * case where the two overlays genuinely could have been stacked.
 */
test.describe('guided tour on a phone', () => {
  test.use({ viewport: { width: 360, height: 720 } });

  test('shows as a modal that fits the screen', async ({ page }) => {
    await asFirstTimer(page);
    await page.goto('/');

    await expect(card(page)).toBeVisible();

    const box = await settledBox(card(page));
    expect(fullyOnScreen(box!, page.viewportSize()!)).toBe(true);
  });

  /*
   * A genuine first-time user: neither overlay has been seen.
   *
   * This is the one state where the disclaimer gate exists at all, and so the
   * one state where two overlays could be stacked. The tour has to be the only
   * thing on screen while it is showing, and the gate has to be the only thing
   * once it is done.
   */
  test('never stacks on the disclaimer gate', async ({ page }) => {
    await asCompleteFirstTimer(page);
    await page.goto('/');

    await expect(card(page)).toBeVisible();
    await expect(page.getByRole('button', { name: /start exploring/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /welcome to quakestudio/i })).toHaveCount(0);

    await card(page)
      .getByRole('button', { name: /skip tour/i })
      .click();

    await expect(page.getByRole('button', { name: /start exploring/i })).toBeVisible();
    await expect(card(page).getByText(/step 1 of 4/i)).toHaveCount(0);
  });

  test('the How to use button is still reachable at 360px', async ({ page }) => {
    await asFirstTimer(page);
    await page.goto('/');

    await card(page)
      .getByRole('button', { name: /skip tour/i })
      .click();
    await expect(card(page)).toHaveCount(0);

    const trigger = page.getByRole('button', { name: /how to use/i });
    await expect(trigger).toBeVisible();

    const box = await trigger.boundingBox();
    const size = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
  });
});
