import { describe, expect, it } from 'vitest';

import { decideInstall, isIos, isStandalone } from '@/pwa/install';

/* ==========================================================================
   Which install affordance this browser deserves.

   The whole matrix is a pure function, so it can be tested exhaustively. The
   environment probes need a little faking, because the interesting cases —
   an iPad pretending to be a Mac, a webview — never occur on the machine
   running the tests.
   ========================================================================== */

describe('decideInstall', () => {
  it('offers nothing when already installed', () => {
    // The most important case: a permanent "Install" button on an app that is
    // already installed is the clearest possible way to look unfinished.
    expect(decideInstall({ standalone: true, ios: false, chromiumEvent: true })).toBe(
      'unsupported',
    );
    expect(decideInstall({ standalone: true, ios: true, chromiumEvent: true })).toBe('unsupported');
  });

  it('offers a one-click install where the API exists', () => {
    expect(decideInstall({ standalone: false, ios: false, chromiumEvent: true })).toBe('ready');
  });

  it('offers instructions, not a one-click install, on iOS', () => {
    /*
     * iOS Safari has no install API at all — no event to catch, nothing to
     * call. Offering the Chromium path there would produce a button that
     * silently does nothing.
     */
    expect(decideInstall({ standalone: false, ios: true, chromiumEvent: false })).toBe('ios-help');
  });

  it('prefers the iOS instructions even if a Chromium event somehow arrives', () => {
    // An in-app browser (Chrome on iOS) reports a Chromium UA. Showing the
    // one-click path there gives a button that opens a menu the user cannot
    // complete.
    expect(decideInstall({ standalone: false, ios: true, chromiumEvent: true })).toBe('ios-help');
  });

  it('offers nothing in a browser that will never be installable', () => {
    // A permanent dead button teaches people to ignore the ones that work.
    expect(decideInstall({ standalone: false, ios: false, chromiumEvent: false })).toBe(
      'unsupported',
    );
  });

  it('never returns an unknown state', () => {
    const states = new Set<string>();
    for (const standalone of [false, true]) {
      for (const ios of [false, true]) {
        for (const chromiumEvent of [false, true]) {
          states.add(decideInstall({ standalone, ios, chromiumEvent }));
        }
      }
    }
    expect([...states].sort()).toEqual(['ios-help', 'ready', 'unsupported']);
  });
});

describe('isIos', () => {
  const withUa = (ua: string, maxTouchPoints = 0) => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: maxTouchPoints,
      configurable: true,
    });
    return () => {
      Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true });
    };
  };

  it('recognises an iPhone', () => {
    const restore = withUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isIos()).toBe(true);
    restore();
  });

  it('recognises an iPad pretending to be a Mac', () => {
    /*
     * iPadOS reports a desktop Safari user agent. The only reliable tell is a
     * coarse pointer, which is why this test passes maxTouchPoints — without
     * it, an iPad is indistinguishable from a real Mac and gets the wrong
     * affordance.
     */
    const restore = withUa(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      5,
    );
    expect(isIos()).toBe(true);
    restore();
  });

  it('does not mistake a real Mac for an iPad', () => {
    const restore = withUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0);
    expect(isIos()).toBe(false);
    restore();
  });

  it('recognises an in-app browser, which is not installable at all', () => {
    for (const token of ['CriOS', 'FxiOS', 'EdgiOS']) {
      const restore = withUa(`Mozilla/5.0 (Linux; Android 14) ${token}/120.0`);
      expect(isIos(), token).toBe(true);
      restore();
    }
  });

  it('is false on desktop Chrome', () => {
    const restore = withUa(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(isIos()).toBe(false);
    restore();
  });
});

describe('isStandalone', () => {
  it('is false in an ordinary browser tab', () => {
    // jsdom reports no display-mode, so this is the "opened from a link" case.
    expect(isStandalone()).toBe(false);
  });
});
