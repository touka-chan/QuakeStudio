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

test.describe('honesty about results', () => {
  test('playback is disabled and labelled as future work', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: /^play$/i })).toBeDisabled();
    await expect(page.getByText(/playback arrives in phase 3/i)).toBeVisible();
  });

  test('the Phase 7 site controls are visible but unavailable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByText(/soil, foundation and fault distance/i)).toBeVisible();
  });
});
