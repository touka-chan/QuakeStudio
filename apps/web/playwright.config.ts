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
