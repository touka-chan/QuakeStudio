import type { CapacitorConfig } from '@capacitor/cli';

/* =========================================================================
   Capacitor — wrapping QuakeStudio as an Android app.
   -------------------------------------------------------------------------
   WHY THIS EXISTS ALONGSIDE THE PWA
   ----------------------------------------------------------------------------
   The PWA installs from a browser over HTTPS. This builds a real `.apk` file
   that sideloads onto a phone with no browser and no hosting at all, which is
   what a lab full of students on a captive network actually needs.

   `webDir` is the built output, and Capacitor COPIES it into the APK. That is
   the important part: the app is self-contained, so it works offline because
   everything it needs is inside the package, not because a service worker
   cached it.

   ── CHANGING THE APP ID ──────────────────────────────────────────────────
   `appId` is permanent once an app is published to Play. It should be a domain
   the client controls, reverse-DNS style. The placeholder below is fine for
   sideloading and for talking to the client, but settle it BEFORE anyone
   installs this on a store — changing it later means a new app, not an update.

   ── THE SERVICE WORKER IS DISABLED INSIDE THE APK ──────────────────────────
   See `src/pwa/registerServiceWorker.ts`. Assets are local, so a worker adds
   nothing — and it actively creates a stale-content trap on app updates,
   because the worker keeps serving the previous precache after a new APK ships.
   ========================================================================== */

const config: CapacitorConfig = {
  appId: 'app.quakestudio.simulator',
  appName: 'QuakeStudio',
  webDir: 'dist',

  android: {
    /*
     * The WebView serves bundled assets from `https://localhost` via a local
     * scheme. Nothing leaves the device, which is what makes the app work with
     * no network at all.
     */
    allowMixedContent: false,

    // The app is offline-first and has no server; capture nothing so there is
    // nothing to leak.
    webContentsDebuggingEnabled: false,
  },

  server: {
    androidScheme: 'https',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#f8fafc',
      showSpinner: false,
    },
  },
};

export default config;
