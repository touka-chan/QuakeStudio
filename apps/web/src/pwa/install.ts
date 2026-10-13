/* =========================================================================
   Which install affordance does this browser deserve?

   Split out from the component for two reasons: the decision is pure and worth
   testing directly, and keeping it in the component file means the component
   exports a non-component, which breaks React Fast Refresh for everyone
   editing the app.

   SCOPE: Android and desktop Chromium only.

   iOS is deliberately NOT supported. Safari has no install API at all — no
   event to catch and nothing to call — so the only route is Share > "Add to
   Home Screen", which cannot be triggered from a page. Shipping a button that
   opens a dialog explaining that is a worse experience than shipping nothing:
   it advertises an install the app cannot perform.

   QuakeStudio still *works* in Safari as a normal web page. What is dropped is
   the promise that it can be installed there. See README "Installing it as an
   app".
   ========================================================================== */

export type InstallState =
  /** A `beforeinstallprompt` event is waiting to be replayed. */
  | 'ready'
  /** Will never be installable. Show nothing. */
  | 'unsupported';

/** Chromium-only event, absent from the DOM lib types. */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** True when running from the home screen, not from a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Chromium's requirements: a secure context and the event being available.
 *
 * A non-secure origin — plain http on a LAN address — is never installable, so
 * showing the button there would be a dead control.
 */
export function chromiumCanInstall(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('onbeforeinstallprompt' in window)) return false;
  return window.isSecureContext;
}

/**
 * The decision, as a pure function.
 *
 * Pure so the whole matrix can be tested without a browser — this is logic,
 * not plumbing, and it is the part most likely to be got wrong.
 */
export function decideInstall(options: {
  standalone: boolean;
  chromiumEvent: boolean;
}): InstallState {
  // Already installed. Offering to install again is noise.
  if (options.standalone) return 'unsupported';
  if (options.chromiumEvent) return 'ready';
  return 'unsupported';
}

/** The same decision, read from the current environment. */
export function currentInstallState(): InstallState {
  return decideInstall({
    standalone: isStandalone(),
    chromiumEvent: chromiumCanInstall(),
  });
}
