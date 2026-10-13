import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      /*
       * Why a service worker at all.
       *
       * A student in a basement lab with no signal can still open QuakeStudio,
       * run a simulation and read the results. Every byte it needs is either in
       * this repository or computed on the device — there is no server call
       * anywhere in the app — so caching the whole shell buys real offline
       * capability rather than a degraded version of it.
       */
      registerType: 'autoUpdate',
      /*
       * Generated at BUILD time, not injected into the page.
       *
       * `injectRegister: 'auto'` emits a small registration script that only
       * runs in production. In development the worker would serve stale bundles
       * over HMR, which is the single most common way a service worker makes a
       * dev server appear broken.
       */
      injectRegister: 'auto',
      manifest: false, // hand-written in public/, so it is readable and reviewable
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      workbox: {
        /*
         * Precache the whole build, INCLUDING the lazy chunks.
         *
         * This is the part that is easy to get wrong. `index.html` alone would
         * satisfy a naive glob and produce an app that opens offline and then
         * fails the moment a student opens the 3D viewport or a chart — which
         * is most of the app. The `request` handler below is what makes those
         * lazy imports resolve with no network.
         */
        // `webmanifest` matters more than it looks: the browser re-fetches the
        // manifest when checking for an updated install, and offline that is a
        // 404. The app still runs, but a console error on every cold start is
        // the kind of thing that makes people distrust an install.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // The 3D chunk alone is ~940 KB, and workbox's default per-file limit is
        // 2 MB. Raising it is what makes the viewport work offline; leaving it
        // at the default drops the largest asset from the precache silently.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

        // Hashed filenames mean a cached asset is never stale: a new build
        // changes the hash, so the old one is simply never requested again.
        cleanupOutdatedCaches: true,
        clientsClaim: true,

        /*
         * Navigation requests always resolve to the app shell, cached or not.
         *
         * Without this, a reload while offline 404s: the browser asks for the
         * current URL, which was never itself cached, and there is no network
         * to fall back to. The app has no router today, so this is insurance
         * rather than a current need — but a trailing slash or a `?` query is
         * enough to hit it.
         *
         * Workbox builds this as a NavigationRoute internally. Declaring an
         * equivalent runtimeCaching entry on top is a duplicate, not a safety
         * net, and workbox-build's types reject it.
         */
        navigateFallback: '/index.html',
      },
      devOptions: {
        // Off in dev, on purpose. See the note on `injectRegister` above.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    /*
     * Source maps are OFF by default.
     *
     * With `sourcemap: true` every build emitted ~9 MB of `.map` files into
     * dist. Deploy the folder as-is and they are served to anyone who guesses
     * the URL — nine times the size of the application, for no benefit to a
     * user. The app has no server-side stack to debug in production, and the
     * source is public on GitHub regardless.
     *
     * Opt in when you need to debug a built bundle:
     *     VITE_SOURCEMAP=true npm run build
     *
     * The dev server is unaffected and always has working maps.
     */
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
  },
});
