import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const baseURL = `http://localhost:${PORT}`;

/**
 * Phase 0 runs Chromium only. The full cross-browser matrix
 * (Firefox, WebKit, tablet widths) is added in Phase 5.
 *
 * Browsers are installed on demand with:  npm run e2e:install
 */
export default defineConfig({
  testDir: './tests/e2e',
  /*
   * The PWA specs are excluded here and run separately.
   *
   * They need a real production build, because this config serves the dev
   * server — where the service worker is deliberately disabled, since one
   * registered over HMR serves stale bundles and makes the dev server look
   * broken. Run them with `npm run test:pwa`.
   */
  testIgnore: /pwa\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    /*
     * A picture of every failure, kept whether or not a trace is.
     *
     * `trace` only records on a retry, and there is no retry outside CI, so on a
     * developer machine a local failure leaves nothing to look at. A screenshot
     * costs nothing when the suite is green and settles arguments when it is
     * not: the tour card sitting on top of the Play button it was describing
     * was visible in one of these and invisible in every number this repo had
     * collected about it.
     */
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
