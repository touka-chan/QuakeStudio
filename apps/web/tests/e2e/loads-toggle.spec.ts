import { expect, test, type Page } from '@playwright/test';

/* ==========================================================================
   The floor-loads on/off switch
   --------------------------------------------------------------------------
   One building at a time can stop counting its occupancy loads: every floor
   then weighs its material's bare structure instead. The cases:

     1. Toggling off collapses the load rows and re-solves — the results
        panel must say WHY the weights changed, not just show new numbers.
     2. A use a material is not typically built on (parking on wood) is
        flagged for review — flagged, never blocked.
     3. A loaded building can stand next to a bare one; the comparison table
        marks which basis every column came from.
     4. A loads-off run survives a save/reload with the switch still off and
        the recorded result intact. Loading never re-solves silently.
   ========================================================================== */

const DESKTOP = { width: 1440, height: 900 };

/** See smoke.spec.ts for why the flag has to be set before app scripts run. */
async function skipFirstRun(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('quakestudio.disclaimerSuppressed', 'true');
      localStorage.setItem('quakestudio.tourSuppressed', 'true');
    } catch {
      /* storage unavailable — the dialog will show and block these tests */
    }
  });
}

test.beforeEach(async ({ page }) => {
  await skipFirstRun(page);
  await page.setViewportSize(DESKTOP);
});

const openLoads = (page: Page) => page.getByRole('tab', { name: /floors & loads/i }).click();

/** The first-mode period on the summary's metric card, as a bare number.
 *  innerText carries the CSS-uppercased label, so the digits are parsed out. */
const readPeriod = async (page: Page) =>
  Number((await page.getByTestId('metric-period').innerText()).match(/(\d+\.\d+)(?=s)/)?.[1]);

test.describe('floor loads on/off', () => {
  test('turns the loads off: the rows collapse and the weights go bare', async ({ page }) => {
    await page.goto('/');

    const results = page.getByRole('complementary', { name: /simulation results/i });
    // The metric card carries the first-mode period; a bare concrete floor is
    // heavier than the same floor with Office loads, so a real re-solve must
    // move it (0.63 s → roughly 0.66 s on the default building).
    const periodBefore = await readPeriod(page);
    await openLoads(page);
    const switchControl = page.getByRole('switch', { name: /count floor loads/i });
    await expect(switchControl).toBeChecked();

    await switchControl.click();

    // The switch debounces ~150 ms before solving, so the change waits out.
    await expect.poll(() => readPeriod(page), { timeout: 10_000 }).not.toBe(periodBefore);

    // The occupancy rows are gone; the bare card takes their place and says
    // which number replaced them.
    await expect(page.getByRole('radio', { name: /^storage$/i })).toHaveCount(0);
    await expect(page.getByText(/what the building weighs instead/i)).toBeVisible();
    // The concrete row of the bare-mass table. Anchored, or this would also
    // match the results caption a few hundred pixels to the right.
    await expect(page.getByText(/^600 kg\/m²$/)).toBeVisible();

    // The weights panel explains the basis it is now reporting.
    await expect(results.getByText(/bare structure/i).first()).toBeVisible();
    await expect(results.getByText('not counted')).toBeVisible();
    await expect(results.getByText(/kg\/m² for concrete/)).toBeVisible();
  });

  test('turns back on with the saved rows intact', async ({ page }) => {
    await page.goto('/');
    await openLoads(page);

    await page.getByRole('switch', { name: /count floor loads/i }).click();
    await expect(page.getByRole('radio', { name: /^office$/i })).toHaveCount(0);
    await page.getByRole('switch', { name: /count floor loads/i }).click();

    await expect(page.getByRole('radio', { name: /^office$/i }).first()).toBeVisible();
    // Nothing was reset in between: the rows the user never saw are the same
    // all-Office rows a fresh template starts with — checked implicitly by
    // the counted-load arithmetic the editor shows for floor 1.
    await expect(page.getByRole('button', { name: /floor 1/i })).toContainText('Office');
  });

  test('flags parking on wood for review without blocking it', async ({ page }) => {
    await page.goto('/');

    // Meet a building the flag actually applies to.
    await page.getByRole('combobox', { name: /building template/i }).click();
    await page.getByRole('option', { name: /4-story wood house/i }).click();

    await openLoads(page);
    await page.getByRole('button', { name: /floor 1/i }).click();
    await page.getByRole('radio', { name: /^parking$/i }).click();

    // Two marks: the chip that counts flagged floors, and the note in the
    // open editor. Both are about the same single floor.
    await expect(page.getByText(/review needed: 1 floor/i)).toBeVisible();
    await expect(page.getByText(/pair an engineer should review/i)).toBeVisible();

    // Flagged, not forbidden: the weight the editor shows is still counted
    // from the loads as entered.
    await expect(page.locator('#floor-load-editor')).toContainText(/kN/);
    // The engine re-solved on those loads anyway — the results stay alive.
    await expect(page.getByTestId('metric-period').locator('..')).toBeVisible();
  });

  test('flags nothing on a material the use fits', async ({ page }) => {
    await page.goto('/');
    await openLoads(page);

    await page.getByRole('button', { name: /floor 1/i }).click();
    await page.getByRole('radio', { name: /^parking$/i }).click();

    await expect(page.getByText(/review needed:/i)).toHaveCount(0);
    await expect(page.getByText(/pair an engineer should review/i)).toHaveCount(0);
  });
});

test.describe('a loaded building beside a bare one', () => {
  test('compares an office building with a bare variant of its own kind', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /compare with another building/i }).click();
    await expect(page.getByRole('button', { name: /stop comparing/i })).toBeVisible();

    // B is its own building: bare it.
    await page.getByRole('radio', { name: /^Building B:/ }).click();
    await openLoads(page);
    await page.getByRole('switch', { name: /count floor loads/i }).click();
    await expect(page.getByText(/what the building weighs instead/i)).toBeVisible();

    // Back to A: still carrying its loads. The per-side switch must not leak.
    await page.getByRole('radio', { name: /^Building A:/ }).click();
    await expect(page.getByRole('switch', { name: /count floor loads/i })).toBeChecked();

    // The table keeps both columns live and says which basis each came from:
    // A counts live load, B is bare, and the weights genuinely differ (the
    // default geometry gives the bare floor more mass than Office loads).
    const table = page.getByRole('table');
    const weightRow = table.getByRole('row', { name: /^Total weight/ });
    await expect(weightRow).toBeVisible();
    const weightText = await weightRow.innerText();
    expect(weightText).toMatch(/\d[\d,]*\.\d kN/);
    expect(weightText).not.toBe('not recorded');

    const shareRow = table.getByRole('row', { name: /^Counted live share/ });
    await expect(shareRow).toContainText(/\d+ %/);
    await expect(shareRow).toContainText(/0 % \(loads off\)/);
  });
});

test.describe('saving a loads-off run', () => {
  test('it reloads with the switch still off and no silent re-solve', async ({ page }) => {
    await page.goto('/');
    await openLoads(page);
    await page.getByRole('switch', { name: /count floor loads/i }).click();
    // A real re-solve has to land before anything observable is saved.
    await expect.poll(() => readPeriod(page), { timeout: 10_000 }).toBeGreaterThan(0);
    const periodSaved = await readPeriod(page);

    await page.getByRole('button', { name: /save run/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /save current run/i }).click();
    await expect(dialog.getByRole('status')).toContainText(/saved/i);

    // A record written by this build must carry the switch, not just the
    // numbers, so a newcomer learns what those weights mean.
    await dialog.getByRole('tab', { name: /transfer/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /export all runs/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^quakestudio-runs-\d{4}-\d{2}-\d{2}\.json$/);
    await page.keyboard.press('Escape');

    await page.reload();
    await page.getByRole('button', { name: /save run/i }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^load$/i })
      .click();

    // The recorded result is back, exactly as it was saved.
    await expect.poll(() => readPeriod(page), { timeout: 10_000 }).toBe(periodSaved);
    // The switch is what the record says, not what a fresh app defaults to.
    await openLoads(page);
    await expect(page.getByRole('switch', { name: /count floor loads/i })).not.toBeChecked();
    // And the weights still report the basis the result was solved on.
    const results = page.getByRole('complementary', { name: /simulation results/i });
    await expect(results.getByText(/bare structure/i).first()).toBeVisible();
    await expect(results.getByText('not counted')).toBeVisible();
  });
});
