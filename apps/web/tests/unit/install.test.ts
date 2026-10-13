import { describe, expect, it } from 'vitest';

import { decideInstall, isStandalone } from '@/pwa/install';

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
