import { expect, test, type Page } from '@playwright/test';

/* ==========================================================================
   Phase 4 — parameter comparison and persistence.
   --------------------------------------------------------------------------
   The acceptance criteria, exercised the way a user would:

     1. Two configurations run under IDENTICAL ground motion.
     2. The overlay is correct, and the A/B colours are the fixed ones.
     3. A run can be saved, survives a reload, and reloads into the app.

   These matter more than they look: every one of them can pass visually while
   quietly showing numbers from different inputs, which is the specific failure
   the whole batch-solve design exists to prevent.
   ========================================================================== */

const DESKTOP = { width: 1440, height: 900 };

/** See smoke.spec.ts for why the flag has to be set before app scripts run. */
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

/** Switch comparison on and wait for the second solve to land. */
async function enableComparison(page: Page) {
  await page.getByRole('button', { name: /compare with another building/i }).click();

  // The button becomes "Stop comparing" once the batch solve returns.
  await expect(page.getByRole('button', { name: /stop comparing/i })).toBeVisible();
  await expect(page.getByRole('radio', { name: /ghost overlay/i })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
}

test.describe('comparison mode', () => {
  test('turns on and starts from a genuinely different building', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: /compare with another building/i });
    await expect(toggle).toBeEnabled();
    await toggle.click();

    await expect(page.getByRole('button', { name: /stop comparing/i })).toBeVisible();

    // The A/B switcher replaces the template picker while comparing.
    const switcher = page.getByRole('radiogroup', { name: /which building to edit/i });
    await expect(switcher).toBeVisible();

    // Each side is announced with its letter, so the choice is not carried by
    // colour alone.
    const sideA = switcher.getByRole('radio', { name: /^Building A: / });
    const sideB = switcher.getByRole('radio', { name: /^Building B: / });
    await expect(sideB).toBeVisible();

    /* The label is derived from the building's own fields, not from the
     * template it started as. When B was created it became 10 storeys of
     * braced steel — so it must SAY that. An earlier build called it
     * "5-story concrete frame (variant)", which contradicted the model it
     * stood for. */
    await expect(sideB).toContainText('10-story steel · braced frame');
    await expect(sideA).toContainText('5-story concrete · moment frame');

    // A duplicate would make the comparison pointless.
    expect(await sideA.innerText()).not.toBe(await sideB.innerText());
  });

  test('the label follows the building when it is edited', async ({ page }) => {
    await page.goto('/');
    await enableComparison(page);

    const sideB = page
      .getByRole('radiogroup', { name: /which building to edit/i })
      .getByRole('radio', { name: /^Building B: / });

    await page.getByRole('radio', { name: /^Building B:/ }).click();
    await page.getByRole('slider', { name: /floors/i }).focus();
    await page.getByRole('slider', { name: /floors/i }).press('ArrowRight');

    // 11 storeys now, and the label says so rather than going stale.
    await expect(sideB).toContainText('11-story steel · braced frame');
  });

  test('runs BOTH sides under one earthquake', async ({ page }) => {
    await page.goto('/');
    await enableComparison(page);

    // The comparison states the shared motion outright, so a reader can see
    // that the two sides were not shaken differently.
    const caption = page.getByText(/identical earthquake/i);
    await expect(caption).toBeVisible();

    const readMotion = async () =>
      (await caption.innerText()).match(/strength [\d.]+ g for [\d.]+ s/)?.[0];

    const before = await readMotion();
    expect(before).toBeTruthy();

    const floorsRow = page.getByRole('table').getByRole('row', { name: /^Floors/ });
    const beforeFloors = await floorsRow.innerText();

    // Edit B only.
    await page.getByRole('radio', { name: /^Building B:/ }).click();
    const slider = page.getByRole('slider', { name: /floors/i });
    await slider.focus();
    await slider.press('ArrowRight');

    // B's row changed, so the edit was not silently discarded, and the batch
    // re-solved both sides.
    await expect(floorsRow).not.toHaveText(beforeFloors);

    // ...and the earthquake underneath both is unchanged.
    await expect(caption).toBeVisible();
    expect(await readMotion()).toBe(before);
  });

  test('shows a percentage change, and never says which building is better', async ({ page }) => {
    await page.goto('/');
    await enableComparison(page);

    const table = page.getByRole('table');
    await expect(table).toContainText(/Peak displacement/i);
    await expect(table).toContainText(/Max story drift/i);
    await expect(table).toContainText(/Natural period/i);

    const text = await table.innerText();
    expect(text).toMatch(/[+−]\s*\d+\s*%|same|—/);
    expect(text).not.toMatch(/better|worse|safer|stronger|weaker/i);
  });

  test('switches between side-by-side and ghost overlay', async ({ page }) => {
    await page.goto('/');
    await enableComparison(page);

    const group = page.getByRole('radiogroup', { name: /comparison view/i });
    await expect(group.getByRole('radio', { name: /side by side/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await group.getByRole('radio', { name: /ghost overlay/i }).click();
    await expect(group.getByRole('radio', { name: /ghost overlay/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(group.getByRole('radio', { name: /side by side/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    // Still rendering — the toggle must not tear down the scene.
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('keeps the disclaimer visible while comparing', async ({ page }) => {
    await page.goto('/');
    await enableComparison(page);

    await expect(page.getByText(/not a structural safety assessment/i).first()).toBeVisible();
  });

  test('turns comparison off and returns to a single viewport', async ({ page }) => {
    await page.goto('/');
    await enableComparison(page);

    await page.getByRole('button', { name: /stop comparing/i }).click();

    await expect(page.getByRole('button', { name: /compare with another building/i })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: /comparison view/i })).toHaveCount(0);
    await expect(page.locator('canvas')).toBeVisible();
  });
});

test.describe('saving runs', () => {
  test('saves the current run and lists it', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /save run/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /save current run/i }).click();
    await expect(dialog.getByRole('status')).toContainText(/saved/i);

    // The list row carries the summary numbers, not just a name.
    await expect(dialog.getByRole('button', { name: /^load$/i })).toHaveCount(1);
    await expect(dialog.getByRole('listitem').first()).toContainText(/floors/);
  });

  test('the saved run survives a page reload', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /save run/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /save current run/i }).click();
    await expect(dialog.getByRole('button', { name: /^load$/i })).toHaveCount(1);

    // A fresh page load means IndexedDB has to have really written the record.
    await page.reload();
    await page.getByRole('button', { name: /save run/i }).click();

    const reopened = page.getByRole('dialog');
    await expect(reopened.getByRole('button', { name: /^load$/i })).toHaveCount(1);
  });

  test('loading a run puts its configuration back', async ({ page }) => {
    await page.goto('/');

    const floors = page.getByRole('slider', { name: /floors/i });

    // The Radix thumb is a span driven by arrow keys, not a fillable input.
    await floors.focus();
    await floors.press('ArrowRight'); // the default 5-storey model -> 6
    await expect(floors).toHaveAttribute('aria-valuenow', '6');

    // Save a distinctive model.
    await page.getByRole('button', { name: /save run/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /save current run/i }).click();
    await expect(dialog.getByRole('status')).toContainText(/saved/i);
    await dialog.getByRole('button', { name: /^close$/i }).click();

    // Move it somewhere else entirely.
    await floors.focus();
    await floors.press('End');
    await expect(floors).toHaveAttribute('aria-valuenow', '20');

    // Loading restores exactly what was saved — not a default, and not the
    // live session state.
    await page.getByRole('button', { name: /save run/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^load$/i }).click();

    await expect(page.getByRole('slider', { name: /floors/i })).toHaveAttribute(
      'aria-valuenow',
      '6',
    );
  });

  test('deletes a saved run', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /save run/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /save current run/i }).click();
    await expect(dialog.getByRole('button', { name: /^load$/i })).toHaveCount(1);

    await dialog.getByRole('button', { name: /^delete /i }).click();
    await expect(dialog.getByText(/nothing saved yet/i)).toBeVisible();
  });

  test('names the backend it is storing runs in', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /save run/i }).click();

    // IndexedDB where available, browser storage otherwise. Either is honest
    // to state, because the fallback thins the history.
    await expect(page.getByRole('dialog')).toContainText(/IndexedDB|browser storage/i);
  });
});

test.describe('moving runs between machines', () => {
  test('exports every run to one JSON file', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /save run/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /save current run/i }).click();
    await expect(dialog.getByRole('status')).toContainText(/saved/i);

    await dialog.getByRole('tab', { name: /transfer/i }).click();

    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /export all runs/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^quakestudio-runs-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('refuses a file that is not a QuakeStudio export', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /save run/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: /transfer/i }).click();

    // Write a plausible-looking but foreign JSON file and try to import it.
    await page.setInputFiles('input[type=file]', {
      name: 'not-ours.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
    });

    // The message must be readable, not a stack trace.
    await expect(dialog.getByRole('status')).toContainText(/not exported from QuakeStudio/i);
  });

  test('imports a valid export back into an empty library', async ({ page }) => {
    await page.goto('/');

    // Save one, export it, and keep the text.
    await page.getByRole('button', { name: /save run/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /save current run/i }).click();
    await expect(dialog.getByRole('status')).toContainText(/saved/i);

    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('tab', { name: /transfer/i }).click();
    await dialog.getByRole('button', { name: /export all runs/i }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    // Clear the library, then import the file back.
    await dialog.getByRole('tab', { name: /runs/i }).click();
    await dialog.getByRole('button', { name: /^delete /i }).click();
    await expect(dialog.getByText(/nothing saved yet/i)).toBeVisible();

    await dialog.getByRole('tab', { name: /transfer/i }).click();
    await page.setInputFiles('input[type=file]', path!);

    await expect(dialog.getByRole('status')).toContainText(/imported 1 run/i);

    await dialog.getByRole('tab', { name: /runs/i }).click();
    await expect(dialog.getByRole('button', { name: /^load$/i })).toHaveCount(1);
  });
});