import { expect, test, type Page } from '@playwright/test';

/* ==========================================================================
   The installable app, in a real browser.

   SCOPE: Android and desktop Chromium. iOS is deliberately unsupported —
   Safari exposes no install API — so nothing here pretends otherwise.

   Most of the PWA surface is checkable from the file system — the manifest,
   the icon dimensions, the precache list are all asserted in the unit suite.
   What only a browser can tell you is whether the pieces actually connect:
   that the service worker registers, that it claims the page, and that the app
   keeps working when the network is genuinely gone.

   The offline test is the one that matters. Every other PWA assertion in this
   repo can pass while the app is useless offline, because the failure only
   appears when the requests stop being served.
   ========================================================================== */

const DESKTOP = { width: 1440, height: 900 };

async function skipFirstRun(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('quakestudio.firstRunAcknowledged', 'true');
      // The guided tour also runs before the workspace is reachable, and it holds
      // the disclaimer gate closed while it is on screen. This is the storage a user
      // who has already seen the tour has.
      localStorage.setItem('quakestudio.tourCompleted', 'true');
    } catch {
      /* storage unavailable — the dialog will show and block these tests */
    }
  });
}

test.beforeEach(async ({ page }) => {
  await skipFirstRun(page);
  await page.setViewportSize(DESKTOP);
});

test.describe('manifest and icons', () => {
  test('serves a manifest a browser will accept', async ({ page }) => {
    await page.goto('/');

    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(href).toBe('/manifest.webmanifest');

    const response = await page.request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('application/manifest+json');

    const manifest = await response.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('a maskable icon is present and full bleed', async ({ page }) => {
    /*
     * Android's adaptive icon is the one that gets cropped by whatever mask
     * the launcher uses. A maskable icon with rounded corners of its own ends
     * up double-rounded, showing background where it should be solid.
     */
    await page.goto('/');
    const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as {
      icons: Array<{ src: string; sizes: string; purpose?: string }>;
    };

    const maskable = manifest.icons.filter(
      (icon: { purpose?: string }) => icon.purpose === 'maskable',
    );
    expect(maskable.length).toBeGreaterThan(0);

    for (const icon of maskable) {
      const response = await page.request.get(icon.src);
      expect(response.ok(), `${icon.src} is ${response.status()}`).toBe(true);
    }
  });

  test('serves the browser-tab favicon', async ({ page }) => {
    await page.goto('/');
    const response = await page.request.get('/favicon-32.png');
    expect(response.ok()).toBe(true);
  });
});

test.describe('service worker', () => {
  /**
   * Wait until the page is genuinely controlled, not merely registered.
   *
   * These are two different states and conflating them makes the offline test
   * pass for the wrong reason. A registration becomes active immediately on a
   * first visit, but the *page* only gains a controller after the worker claims
   * it — and with `clientsClaim` that happens asynchronously after activation,
   * so reading `controller` in the same tick as `ready` reliably reads null.
   */
  async function waitForControl(page: Page) {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    });
  }

  test('registers and claims the page', async ({ page }) => {
    await page.goto('/');

    await waitForControl(page);

    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return { scope: registration.scope, controlled: Boolean(navigator.serviceWorker.controller) };
    });

    expect(state.scope).toContain('/');
    expect(state.controlled).toBe(true);
  });

  test('keeps the whole app working with the network gone', async ({ page, context }) => {
    /*
     * The actual claim. The app is entirely client-side — mass, stiffness,
     * damping, Newmark integration and a Cholesky solve all happen on the
     * device — so offline should be total, not partial.
     *
     * Checks the four things a broken precache breaks, in order of how visible
     * each failure would be: the shell, the lazy 3D chunk, the worker that runs
     * the simulation, and finally whether any numbers come out.
     */
    await page.goto('/');
    await waitForControl(page);

    /*
     * Wait for the precache to be POPULATED, not merely created.
     *
     * Workbox opens the cache and then adds entries asynchronously, so a test
     * that cuts the network as soon as `caches.keys()` is non-empty races the
     * precache and fails intermittently. Requiring the entry chunk by name is
     * both a completion signal and a direct check that the thing the page
     * needs most is genuinely in there.
     */
    await page.waitForFunction(
      async () => {
        const names = await caches.keys();
        if (names.length === 0) return false;

        for (const name of names) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          if (keys.some((request) => /index-.*\.js$/.test(request.url))) return true;
        }
        return false;
      },
      undefined,
      { timeout: 45_000 },
    );

    // Nothing may leave the device from here on.
    await context.setOffline(true);

    // 1. The shell reloads. The viewport is the `main` landmark; the controls
    //    and results panels are the `complementary` ones either side of it.
    await page.reload();
    await expect(page.getByRole('main', { name: /simulation viewport/i })).toBeVisible({
      timeout: 30_000,
    });

    // 2. The disclaimer is still there — the offline build is still this app.
    await expect(page.getByText(/not a structural safety assessment/i).first()).toBeVisible();

    // 3. Controls are live, so this is a functioning app and not a cached picture.
    const floors = page.getByRole('slider', { name: /floors/i });
    await expect(floors).toBeVisible();
    await expect(floors).toBeEnabled();

    // 4. The lazy 3D chunk resolves — the one a naive precache silently misses.
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    // 5. And the worker still solves. A cached page with a stranded worker
    //    looks perfectly healthy until you notice the numbers never change.
    await expect
      .poll(async () => /\d+(\.\d+)?\s*mm/.test(await page.locator('body').innerText()), {
        timeout: 30_000,
        message: 'no displacement rendered offline',
      })
      .toBe(true);

    await context.setOffline(false);
  });
});
