/* =========================================================================
   Service worker registration — web builds only.

   WHY THIS IS NOT JUST `vite-plugin-pwa`'s injected snippet
   -------------------------------------------------------------------------
   Inside the Android APK, Capacitor serves every asset from a local
   `https://localhost` scheme. The app is already offline by construction, so a
   service worker buys nothing there.

   Worse, it actively creates a trap. The worker's precache is keyed to hashed
   filenames from whichever APK installed it. Install a new APK and the new
   hashed filenames are not in the old precache — but the old precache is still
   there, still controlling the page, and still serving the OLD index.html,
   which references the OLD chunks. The app appears to ignore the update.

   That failure is miserable to diagnose from a phone, so it is prevented here
   rather than left to be discovered.

   How to tell the two environments apart
   -------------------------------------------------------------------------
   Capacitor injects `window.Capacitor` into the WebView. Its absence is the
   signal, and it is checked at call time rather than at module load, so the
   same bundle behaves correctly in both places.
   ========================================================================== */

type CapacitorGlobal = typeof globalThis & {
  Capacitor?: { isNativePlatform?: () => boolean };
};

/** True when running inside the native Android wrapper. */
export function isNativeApp(): boolean {
  return typeof globalThis !== 'undefined' && Boolean((globalThis as CapacitorGlobal).Capacitor);
}

/**
 * Register the service worker, unless we are inside the APK or in dev.
 *
 * Returns the registration, or null when it was skipped or failed. Failing to
 * register is never fatal: the app is served from the network and still works.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  // Not a real environment to cache for. `sw.js` is generated at build time,
  // so in dev the dev server answers `/sw.js` with the SPA fallback —
  // index.html, `text/html` — and the browser rejects it with
  // "unsupported MIME type". Registering anyway would print that error on
  // every dev reload and teach people to ignore the console.
  if (!import.meta.env.PROD) return null;

  if (isNativeApp()) return null;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (error) {
    // A failed worker must never take the app down with it.
    console.warn('Service worker registration failed:', error);
    return null;
  }
}
