import { describe, expect, it, vi } from 'vitest';

import { decideInstall, isStandalone } from '@/pwa/install';
import { isNativeApp, registerServiceWorker } from '@/pwa/registerServiceWorker';

/* ==========================================================================
   Which install affordance this browser deserves.

   The whole matrix is a pure function, so it is tested exhaustively.

   There is deliberately no iOS branch to test. Safari exposes no install API,
   so the honest behaviour there is to show nothing rather than to show a
   button that cannot work — and `decideInstall` returns 'unsupported' for it
   because `onbeforeinstallprompt` does not exist outside Chromium.
   ========================================================================== */

describe('decideInstall', () => {
  it('offers a one-click install where the API exists', () => {
    expect(decideInstall({ standalone: false, chromiumEvent: true })).toBe('ready');
  });

  it('offers nothing when already installed', () => {
    /*
     * The most important case. A permanent "Install" button on an app that is
     * already installed is the clearest possible way to look unfinished.
     */
    expect(decideInstall({ standalone: true, chromiumEvent: true })).toBe('unsupported');
  });

  it('offers nothing in a browser that will never be installable', () => {
    // Which includes Safari, and any non-secure origin such as plain http on a
    // LAN address. A dead button teaches people to ignore the one that works.
    expect(decideInstall({ standalone: false, chromiumEvent: false })).toBe('unsupported');
  });

  it('never returns an unknown state', () => {
    const states = new Set<string>();
    for (const standalone of [false, true]) {
      for (const chromiumEvent of [false, true]) {
        states.add(decideInstall({ standalone, chromiumEvent }));
      }
    }
    expect([...states].sort()).toEqual(['ready', 'unsupported']);
  });

  it('shows the button before the event fires, but only once it has', () => {
    /*
     * `chromiumEvent` stands for "this browser supports installing", not "an
     * event is queued". The button additionally requires a queued event to
     * exist — a button that appears before the browser has decided the app is
     * installable is a button that might do nothing.
     */
    expect(decideInstall({ standalone: false, chromiumEvent: true })).toBe('ready');
    expect(decideInstall({ standalone: false, chromiumEvent: false })).toBe('unsupported');
  });
});

describe('isStandalone', () => {
  it('is false in an ordinary browser tab', () => {
    // jsdom reports no display-mode, so this is the "opened from a link" case.
    expect(isStandalone()).toBe(false);
  });
});

/* ==========================================================================
   Where the service worker is allowed to register.

   Three places, three different answers, and getting any of them wrong
   produces a failure that looks like something else entirely.
   ========================================================================== */

describe('service worker registration', () => {
  it('is skipped in dev, where /sw.js does not exist', async () => {
    /*
     * Vitest runs with import.meta.env.PROD false, so this exercises the real
     * guard rather than a simulated one.
     *
     * In dev the dev server answers `/sw.js` with the SPA fallback —
     * index.html, served as text/html — and the browser rejects it with
     * "The script has an unsupported MIME type ('text/html')". That error on
     * every dev reload is how a console warning becomes invisible.
     */
    expect(import.meta.env.PROD).toBe(false);
    await expect(registerServiceWorker()).resolves.toBeNull();
  });

  it('never calls register, even when one is available', async () => {
    /*
     * jsdom does not implement navigator.serviceWorker at all, so a stub is
     * installed. Without it this test would pass for the wrong reason — the
     * guard could be returning early because the API is missing, rather than
     * because we are in dev.
     */
    const register = vi.fn();
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'serviceWorker');
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    });

    try {
      await registerServiceWorker();
      expect(register).not.toHaveBeenCalled();
    } finally {
      if (original) {
        Object.defineProperty(globalThis.navigator, 'serviceWorker', original);
      } else {
        delete (globalThis.navigator as unknown as Record<string, unknown>).serviceWorker;
      }
    }
  });

  it('detects the native Android wrapper', () => {
    expect(isNativeApp()).toBe(false);

    // Capacitor injects `window.Capacitor` into the WebView. Its presence is
    // the only signal available, and it is what stops a worker from serving a
    // stale precache after a new APK is installed.
    (globalThis as Record<string, unknown>).Capacitor = { isNativePlatform: () => true };
    try {
      expect(isNativeApp()).toBe(true);
    } finally {
      delete (globalThis as Record<string, unknown>).Capacitor;
    }
  });
});
