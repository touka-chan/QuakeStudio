import { expect, test, type Page } from '@playwright/test';

/* ==========================================================================
   Phase 1 — the static prototype, walked the way a non-technical user would.
   --------------------------------------------------------------------------
   Chromium only for now; the full cross-browser matrix is Phase 5.
   Browsers install with: npm run e2e:install
   ========================================================================== */

/**
 * Skip the first-run dialog for every test except the ones that exercise it.
 *
 * This runs as an init script — BEFORE the app's own scripts — so the flag is
 * already in localStorage when React first reads it. Checking for the dialog
 * after `goto` was the obvious approach and it does not work: the dialog is a
 * modal, so it marks the whole app tree aria-hidden and every role query on the
 * workspace behind it fails.
 */
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
});

test.describe('QuakeStudio — Phase 1 shell', () => {
  test('shows all three zones on a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('complementary', { name: /controls/i })).toBeVisible();
    await expect(page.getByRole('main', { name: /simulation viewport/i })).toBeVisible();
    await expect(page.getByRole('complementary', { name: /simulation results/i })).toBeVisible();
  });

  test('keeps the disclaimer visible and never dismissible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const disclaimer = page.getByText(/not a structural safety assessment/i).first();
    await expect(disclaimer).toBeVisible();

    // It must survive interacting with the app.
    await page.getByRole('slider', { name: /floors/i }).click();
    await expect(disclaimer).toBeVisible();
  });

  test('renders the 3D viewport with a canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('theme toggle switches to dark and survives a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByRole('button', { name: /switch to dark theme/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('loads with no console errors', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await page.getByRole('heading', { name: /displacement over time/i }).waitFor();
    expect(errors).toEqual([]);
  });
});

test.describe('building a model', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
  });

  test('applying a template updates the viewport and the results', async ({ page }) => {
    // The template name appears in BOTH the select trigger and the viewport
    // chip, so scope to the chip when asserting the 3D state.
    const chip = page.getByRole('main').getByText(/story concrete · moment frame/);
    const peakValue = page.getByTestId('metric-peak-disp-value');
    const peakBefore = await peakValue.innerText();

    await page.getByRole('combobox', { name: /building template/i }).click();
    await page.getByRole('option', { name: /15-story concrete high-rise/i }).click();
    await expect(chip).toHaveText(/15-story/);

    await page.getByRole('combobox', { name: /building template/i }).click();
    await page.getByRole('option', { name: /3-story concrete/i }).click();
    await expect(chip).toHaveText(/3-story/);

    // A 15-storey tower and a 3-storey block are not the same building.
    await expect(peakValue).not.toHaveText(peakBefore);
  });

  test('changing the floors slider changes the building', async ({ page }) => {
    const floors = page.getByRole('slider', { name: /floors/i });
    await floors.focus();
    // The default template is 5 storeys; one step up is 6.
    await page.keyboard.press('ArrowRight');

    await expect(page.getByRole('main').getByText(/6-story/)).toBeVisible();
  });

  test('the 3D view resizes with the building', async ({ page }) => {
    const floors = page.getByRole('slider', { name: /floors/i });
    await floors.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');

    await expect(page.getByRole('main').getByText(/15-story/)).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('every earthquake control is keyboard reachable', async ({ page }) => {
    const strength = page.getByRole('slider', { name: /strength/i });
    await strength.focus();
    const before = await strength.getAttribute('aria-valuetext');
    await page.keyboard.press('ArrowRight');
    await expect(strength).not.toHaveAttribute('aria-valuetext', before!);
  });
});

test.describe('responsive layout', () => {
  test('stacks into tabs on a phone-sized viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const tabs = page.getByRole('tablist', { name: /sections/i });
    await expect(tabs).toBeVisible();

    // Only one zone at a time.
    await expect(page.getByRole('complementary', { name: /controls/i })).toBeVisible();
    await expect(page.getByRole('main', { name: /simulation viewport/i })).toHaveCount(0);

    await page.getByRole('tab', { name: /simulate/i }).click();
    await expect(page.getByRole('main', { name: /simulation viewport/i })).toBeVisible();

    await page.getByRole('tab', { name: /results/i }).click();
    await expect(page.getByRole('complementary', { name: /simulation results/i })).toBeVisible();
  });

  test('holds together at 360px without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('no metric card clips its own label at 360px', async ({ page }) => {
    /*
     * The page-wide overflow check above cannot see this bug.
     *
     * A card whose label is wider than the card overflows INSIDE its own
     * border and is clipped by the rounded corner. The document does not grow,
     * so scrollWidth still matches clientWidth and the previous test passes.
     * A user sees "DISPLACEMEN" with no T.
     *
     * `scrollWidth > clientWidth` on an element is what catches it, and only a
     * real browser can measure that — jsdom does no layout at all.
     */
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await page.getByRole('tab', { name: /results/i }).click();

    const clipped = await page.evaluate(() => {
      const cards = [
        ...document.querySelectorAll('[data-testid^="metric-"][data-testid$="-value"]'),
      ];
      return cards
        .map((value) => value.closest('div.rounded-card') ?? value)
        .filter((card) => card.scrollWidth - card.clientWidth > 1)
        .map((card) => card.getAttribute('data-testid') ?? card.className);
    });

    expect(clipped, `cards clipping their text: ${clipped.join(', ')}`).toEqual([]);
  });

  test('metric cards stack on a phone and sit side by side when there is room', async ({
    page,
  }) => {
    /*
     * Replaces an earlier "cards share one height" test that could not fail.
     *
     * Removing `h-full` from MetricCard left it passing, because grid's
     * default `align-items: stretch` already equalises the row — it was
     * testing the framework, not this repo. This version asserts the thing we
     * actually own: the `grid-cols-1 sm:grid-cols-3` breakpoints in
     * ResultsPanel, which are the real fix for the clipped label.
     *
     * Rows are counted by distinct `top` edges. Three distinct tops means
     * stacked; one means side by side.
     */
    const rowCount = async () => {
      await page.waitForSelector('[data-testid="metric-peak-disp"]');
      return page.evaluate(
        () =>
          new Set(
            [...document.querySelectorAll('div.rounded-card[data-testid^="metric-"]')].map((card) =>
              Math.round(card.getBoundingClientRect().top),
            ),
          ).size,
      );
    };

    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('/');
    await page.getByRole('tab', { name: /results/i }).click();
    expect(await rowCount(), 'at 360px the cards should each be their own row').toBe(3);

    await page.setViewportSize({ width: 768, height: 900 });
    expect(await rowCount(), 'at 768px the cards should sit side by side').toBe(1);
  });

  test('does not scroll sideways at 1920px', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('keeps the three zones at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');

    await expect(page.getByRole('complementary', { name: /controls/i })).toBeVisible();
    await expect(page.getByRole('complementary', { name: /simulation results/i })).toBeVisible();
  });
});

test.describe('first-run dialog', () => {
  // These deliberately run WITHOUT the init script above.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    // Clear the flag on the FIRST document only. An init script runs on every
    // navigation, so clearing unconditionally would re-show the dialog after
    // the reload this test is trying to prove is clean.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('__qs_first_load_done')) return;
      sessionStorage.setItem('__qs_first_load_done', '1');
      localStorage.removeItem('quakestudio.firstRunAcknowledged');
    });
  });

  test('greets a new user and gates Start until the disclaimer is acknowledged', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('dialog')).toBeVisible();
    const start = page.getByRole('button', { name: /start exploring/i });
    await expect(start).toBeDisabled();

    await page.getByRole('checkbox').check();
    await expect(start).toBeEnabled();
  });

  test('does not reappear on a second visit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /start exploring/i }).click();

    await page.reload();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('the simulation engine', () => {
  const peakValue = (page: import('@playwright/test').Page) =>
    page.getByTestId('metric-peak-disp-value').innerText();
  const periodValue = (page: import('@playwright/test').Page) =>
    page.getByTestId('metric-period-value').innerText();

  /** Wait for the worker's first result rather than racing it. */
  const waitForResult = async (page: import('@playwright/test').Page) => {
    await expect
      .poll(async () => Number.parseFloat(await peakValue(page)), { timeout: 10_000 })
      .toBeGreaterThan(0);
  };

  test('produces real results, not a loading skeleton', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const panel = page.getByRole('complementary', { name: /simulation results/i });
    // The "Preview numbers" notice is gone now that the engine is real.
    await expect(panel.getByText(/preview numbers/i)).toHaveCount(0);

    await waitForResult(page);
  });

  test('reacts to an input change', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForResult(page);

    const before = await peakValue(page);

    await page.getByRole('combobox', { name: /building template/i }).click();
    await page.getByRole('option', { name: /15-story concrete high-rise/i }).click();

    await expect(page.getByTestId('metric-peak-disp-value')).not.toHaveText(before);
  });

  test('a braced frame has a shorter period than a moment frame', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForResult(page);

    const moment = Number.parseFloat(await periodValue(page));

    await page.getByRole('radio', { name: 'Braced frame' }).click();

    // Bracing doubles the stiffness, so the period falls by sqrt(2) ≈ 0.71.
    await expect
      .poll(async () => Number.parseFloat(await periodValue(page)), { timeout: 5000 })
      .toBeLessThan(moment);
  });

  test('a taller building has a longer period', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForResult(page);

    const before = Number.parseFloat(await periodValue(page));

    await page.getByRole('combobox', { name: /building template/i }).click();
    await page.getByRole('option', { name: /15-story concrete high-rise/i }).click();

    await expect
      .poll(async () => Number.parseFloat(await periodValue(page)), { timeout: 5000 })
      .toBeGreaterThan(before);
  });

  test('never claims a safety verdict', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForResult(page);

    const panel = page.getByRole('complementary', { name: /simulation results/i });
    // exact: true — "Peak displacement" is also the start of a chart heading.
    await expect(panel.getByText('Peak displacement', { exact: true })).toBeVisible();
    const text = await panel.innerText();
    expect(text).not.toMatch(/\bsafe\b|\bunsafe\b|collapse|damage|failure/i);
  });
});

test.describe('playback', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect
      .poll(
        async () => Number.parseFloat(await page.getByTestId('metric-peak-disp-value').innerText()),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  });

  test('starts paused, so nothing moves until asked', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^play$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^pause$/i })).toHaveCount(0);

    const timeSlider = page.getByRole('slider', { name: /simulation time/i });
    const before = await timeSlider.getAttribute('aria-valuetext');
    await page.waitForTimeout(600);
    expect(await timeSlider.getAttribute('aria-valuetext')).toBe(before);
  });

  test('play advances the clock, pause stops it', async ({ page }) => {
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();

    const timeSlider = page.getByRole('slider', { name: /simulation time/i });
    await expect
      .poll(async () => timeSlider.getAttribute('aria-valuetext'), { timeout: 5000 })
      .not.toMatch(/^0\.0 of/);

    await page.getByRole('button', { name: /^pause$/i }).click();
    const paused = await timeSlider.getAttribute('aria-valuetext');
    await page.waitForTimeout(500);
    expect(await timeSlider.getAttribute('aria-valuetext')).toBe(paused);
  });

  test('the exaggeration slider changes the motion scale', async ({ page }) => {
    const slider = page.getByRole('slider', { name: /motion exaggeration/i });
    await expect(slider).toHaveAttribute('aria-valuetext', /20 times/);

    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', /21 times/);
    await expect(page.getByText(/drawn 21× larger/i)).toBeVisible();
  });

  test('says the numbers are not exaggerated even when the view is', async ({ page }) => {
    await expect(page.getByText(/the numbers themselves are not exaggerated/i)).toBeVisible();
  });

  test('speed and loop are operable', async ({ page }) => {
    await page.getByRole('radio', { name: '2×' }).click();
    await expect(page.getByRole('radio', { name: '2×' })).toHaveAttribute('aria-checked', 'true');

    const loop = page.getByRole('checkbox');
    await loop.uncheck();
    await expect(loop).not.toBeChecked();
  });
});

test.describe('CSV export', () => {
  test('downloads a file whose headline numbers match the screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect
      .poll(
        async () => Number.parseFloat(await page.getByTestId('metric-peak-disp-value').innerText()),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);

    const shownPeak = (await page.getByTestId('metric-peak-disp-value').innerText()).trim();
    const shownDrift = (await page.getByTestId('metric-max-drift-value').innerText()).trim();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export this run as a csv file/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^quakestudio-.*\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const csv = Buffer.concat(chunks).toString('utf8');

    // The brief: "exported CSV matches the on-screen numbers". The card renders
    // value and unit in one element, so strip the unit before comparing.
    const cardValue = (text: string) => text.replace(/[a-z%]+$/i, '').trim();
    expect(csv).toContain(`# Peak displacement as shown on screen (mm),${cardValue(shownPeak)}`);
    expect(csv).toContain(
      `# Max interstory drift ratio as shown on screen (%),${cardValue(shownDrift)}`,
    );

    // And the full-precision figures must round to what is on screen.
    const fullPeak = Number(/# Peak displacement \(mm\),([\d.]+)/.exec(csv)?.[1] ?? 'NaN');
    expect(fullPeak.toFixed(1)).toBe(cardValue(shownPeak));

    expect(csv).toContain('floor_1_disp_mm');
    expect(csv).toMatch(/Not a structural safety assessment/i);
  });
});

test.describe('honesty about results', () => {
  test('playback is live and says the view is exaggerated, not the numbers', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: /^play$/i })).toBeEnabled();
    await expect(page.getByText(/the numbers themselves are not exaggerated/i)).toBeVisible();
  });

  test('the Phase 7 site controls are visible but unavailable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByText(/soil, foundation and fault distance/i)).toBeVisible();
  });
});
