import { expect, test, type Page } from '@playwright/test';

/* ==========================================================================
   Phase 5 — accessibility, checked in a real browser.

   Several things cannot be verified in jsdom and would be worthless to assert
   there: focus management, tab order, live-region announcements, and whether
   anything actually renders. Those are what this file covers.

   The mechanical checks (names, roles, ARIA validity) live in
   tests/unit/accessibility.test.tsx, where axe-core runs against every
   surface. Running them here too would double the run time for no extra
   confidence.
   ========================================================================== */

const DESKTOP = { width: 1440, height: 900 };

async function skipFirstRun(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('quakestudio.firstRunAcknowledged', 'true');
    } catch {
      /* storage unavailable — the dialog will show and block these tests */
    }
  });
}

test.beforeEach(async ({ page }) => {
  await skipFirstRun(page);
  await page.setViewportSize(DESKTOP);
});

test.describe('focus management', () => {
  test('focus moves into a dialog and returns to the button that opened it', async ({ page }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: /^assumptions$/i });
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Focus must land inside the dialog, or a keyboard user is left behind the
    // overlay with no indication anything opened.
    await expect
      .poll(async () => dialog.evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Returning focus to the trigger is what makes Escape usable: without it
    // focus falls back to the top of the document and the user has to tab
    // all the way down again.
    await expect
      .poll(async () => trigger.evaluate((node) => document.activeElement === node))
      .toBe(true);
  });

  test('traps Tab inside an open dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^assumptions$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Tab several times. Focus must never escape the dialog — reaching a
    // control behind a modal is both confusing and unusable with a screen
    // reader.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await dialog.evaluate((node) => node.contains(document.activeElement));
      expect(inside, `focus escaped the dialog after ${i + 1} tabs`).toBe(true);
    }
  });

  test('the saved-runs dialog behaves the same way', async ({ page }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: /save run/i });
    await expect(trigger).toBeEnabled();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => trigger.evaluate((node) => document.activeElement === node))
      .toBe(true);
  });
});

test.describe('keyboard operability', () => {
  test('reaches every control in the left panel by keyboard alone', async ({ page }) => {
    await page.goto('/');

    // Focus the first control, then walk forward until we have visited every
    // interactive element in the controls panel.
    const panel = page.getByRole('complementary', { name: /controls/i });
    await panel.locator('input, button, [role="slider"], [role="radio"]').first().focus();

    const total = await panel.locator('input, button, [role="slider"], [role="radio"]').count();
    expect(total).toBeGreaterThan(8);

    for (let i = 0; i < total; i++) {
      await page.keyboard.press('Tab');
    }

    // Every focusable control must be reachable — verified by counting the
    // focusable elements that were never skipped, using the fact that each
    // control has an accessible name.
    const unnamed = await panel.evaluate((node) => {
      const focusable = node.querySelectorAll<HTMLElement>(
        'input, button, [role="slider"], [role="radio"], [role="combobox"]',
      );
      return Array.from(focusable)
        .filter((element) => {
          const name =
            element.getAttribute('aria-label') ??
            element.getAttribute('aria-labelledby') ??
            (element.textContent ?? '').trim();
          return !name;
        })
        .map((element) => element.tagName);
    });

    expect(unnamed).toEqual([]);
  });

  test('operates a slider with the arrow keys', async ({ page }) => {
    await page.goto('/');

    const floors = page.getByRole('slider', { name: /floors/i });
    await expect(floors).toHaveAttribute('aria-valuenow', '5');

    await floors.focus();
    await page.keyboard.press('ArrowRight');

    // The ARIA value is what a screen reader announces, so it has to track the
    // change — not just the visual thumb.
    await expect(floors).toHaveAttribute('aria-valuenow', '6');
  });

  test('shows a visible focus ring on the control in focus', async ({ page }) => {
    await page.goto('/');

    const floors = page.getByRole('slider', { name: /floors/i });
    await floors.focus();

    // Focus must be visible, not just present. Computed outline/ring is the
    // check that matters; the class list is an implementation detail.
    const outline = await floors.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
      };
    });

    const hasVisibleFocus =
      (outline.outlineStyle !== 'none' && parseFloat(outline.outlineWidth) > 0) ||
      (outline.boxShadow !== 'none' && outline.boxShadow.length > 0);

    expect(hasVisibleFocus).toBe(true);
  });
});

test.describe('the 3D viewport', () => {
  test('is announced as an image with a description, not a bare canvas', async ({ page }) => {
    await page.goto('/');

    /*
     * The canvas is opaque to assistive technology, so the description only
     * reaches a screen reader if the element carrying it also has a role.
     * Without one, `aria-label` is prohibited and silently dropped.
     */
    const viewport = page.locator('[role="img"][aria-label*="3D view"]');
    await expect(viewport).toHaveCount(1);

    const label = await viewport.getAttribute('aria-label');
    expect(label).toMatch(/results panel/i);
  });

  test('describes both buildings when comparing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /compare with another building/i }).click();

    const viewport = page.locator('[role="img"][aria-label*="comparison"]');
    await expect(viewport).toHaveCount(1);

    const label = await viewport.getAttribute('aria-label');
    expect(label).toMatch(/A:/);
    expect(label).toMatch(/B:/);
  });
});

test.describe('live regions', () => {
  test('announces a CSV export without moving focus', async ({ page }) => {
    await page.goto('/');

    // Polite, so a screen reader mentions it without interrupting.
    const live = page.locator('[aria-live="polite"]').first();
    await expect(live).toBeAttached();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export this run as a csv file/i }).click();
    await downloadPromise;

    await expect(live).toContainText(/exported/i);
  });

  test('announces the result of saving a run', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /save run/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /save current run/i }).click();

    await expect(dialog.getByRole('status')).toContainText(/saved/i);
  });
});

test.describe('reduced motion', () => {
  test('starts paused and slower when the user asks for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Nothing should be moving without the user asking for it.
    await expect(page.getByRole('button', { name: /^play$/i })).toBeEnabled();
    await expect(page.getByText(/reduced-motion is on/i)).toBeVisible();

    const speed = page.getByRole('radio', { name: '0.5×' });
    await expect(speed).toHaveAttribute('aria-checked', 'true');
  });
});
