import { expect, test, type Page } from '@playwright/test';

/* ==========================================================================
   The usability questionnaire, in a real browser.

   The dialog is behind a lazy boundary whose Suspense fallback is `null`,
   which means the jsdom tests prove nothing about whether it actually appears:
   a chunk that failed to load would leave a `Suspense` boundary that silently
   renders nothing, with no error and no visible symptom. That failure mode is
   exactly why this file exists rather than another assertion in the unit suite.

   It also covers the thing the instrument exists to protect — that a score the
   participant sees is the score the study will report.
   ========================================================================== */

const DESKTOP = { width: 1440, height: 900 };

async function openDialog(page: Page) {
  // Must be registered before goto, so the first-run dialog is gone before any
  // app script runs.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('quakestudio.disclaimerSuppressed', 'true');
      // The guided tour also runs before the workspace is reachable, and it holds
      // the disclaimer gate closed while it is on screen. This is the storage a user
      // who has already seen the tour has.
      localStorage.setItem('quakestudio.tourSuppressed', 'true');
    } catch {
      /* storage unavailable — the dialog will show and block these tests */
    }
  });
  await page.setViewportSize(DESKTOP);

  await page.goto('/');
  await page.getByRole('button', { name: /usability feedback/i }).click();
  return page.getByRole('dialog');
}

test.describe('the usability feedback dialog', () => {
  test('opens, and the lazy chunk actually resolves', async ({ page }) => {
    const dialog = await openDialog(page);

    // If the dynamic import had failed, this element would simply not exist —
    // no thrown error, just an absent dialog.
    await expect(dialog.getByRole('heading', { name: /usability feedback/i })).toBeVisible();
    await expect(page.getByText(/stay in this browser until you export/i)).toBeVisible();
  });

  test('presents ten questions, each a labelled five-point group', async ({ page }) => {
    const dialog = await openDialog(page);

    const groups = dialog.getByRole('radiogroup');
    await expect(groups).toHaveCount(10);

    for (let item = 1; item <= 10; item += 1) {
      const group = groups.nth(item - 1);
      await expect(group).toHaveAccessibleName(`Question ${item}`);
      await expect(group.getByRole('radio')).toHaveCount(5);
    }
  });

  test('refuses to submit until every question is answered', async ({ page }) => {
    const dialog = await openDialog(page);

    const submit = dialog.getByRole('button', { name: /submit response/i });
    await expect(submit).toBeDisabled();

    // `exact: true` matters: without it Playwright matches the accessible name
    // as a substring, so 'Agree' also selects 'Strongly agree' and the locator
    // resolves to twenty radios instead of ten.
    const agree = dialog.getByRole('radio', { name: 'Agree', exact: true });
    await expect(agree).toHaveCount(10);

    // Nine out of ten is still incomplete. An unanswered question is missing
    // data, not a low score, so scoring over the answered ones is not allowed.
    for (let item = 0; item < 9; item += 1) {
      await agree.nth(item).check();
    }
    await expect(submit).toBeDisabled();

    await agree.nth(9).check();
    await expect(submit).toBeEnabled();
  });

  test('scores an all-neutral response as exactly 50', async ({ page }) => {
    const dialog = await openDialog(page);

    const neutral = dialog.getByRole('radio', { name: 'Neither agree nor disagree' });
    await expect(neutral).toHaveCount(10);
    for (let item = 0; item < 10; item += 1) {
      await neutral.nth(item).check();
    }

    // Ten neutral answers must give the midpoint, not something near it. This
    // is the arithmetic a participant could do by hand, so it has to match.
    await expect(dialog.getByText(/would score 50\b/)).toBeVisible();

    await dialog.getByRole('button', { name: /submit response/i }).click();

    // The recorded score lives on the Responses tab, not the questionnaire.
    await dialog.getByRole('tab', { name: /responses/i }).click();
    await expect(dialog.getByRole('cell', { name: '50', exact: true })).toBeVisible();
  });

  test('returns focus to the button that opened it', async ({ page }) => {
    const dialog = await openDialog(page);

    /*
     * Wait for the dialog before pressing Escape.
     *
     * The dialog is behind a lazy boundary, so on a loaded machine the chunk can
     * still be in flight when this test reaches the key press. Escape then lands
     * on nothing, Radix never runs its close handler, and focus is never
     * restored — a failure in the app that is really a failure in the test.
     * Pressing Escape before the dialog exists is not a meaningful assertion in
     * the first place.
     */
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: /usability feedback/i })).toBeFocused();
  });
});
