import { defineConfig, devices } from '@playwright/test';

/* ==========================================================================
   A separate Playwright run for the installable app.
   --------------------------------------------------------------------------
   The rest of the e2e suite runs against the dev server, which is correct and
   fast. But a service worker must NOT be registered in development: it would
   serve stale bundles over HMR and make the dev server appear broken.

   So these specs need the opposite — a real production build, served by
   `vite preview`. Hence a separate config rather than a second project in the
   main one, which would drag a build into every `npm run e2e`.

       npm run test:pwa

   Everything asserted here can only be checked in a browser against a built
   bundle, and several of them only fail when the network is actually gone.
   ========================================================================== */

const PORT = 4174;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Only the PWA specs. They are skipped by the main config, which runs against
  // a dev server where a service worker is deliberately absent.
  testMatch: /pwa\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  /*
   * Generous. Every test in this file waits on a precache being populated
   * before cutting the network, and a cold cache on a loaded machine is slow
   * in a way that is not a failure.
   */
  timeout: 90_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'pwa',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    /*
     * The build is part of the server command so the config is self-contained:
     * running Playwright against it directly cannot accidentally serve a stale
     * dist from an earlier build.
     */
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
