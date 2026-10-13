/* =========================================================================
   Which install affordance does this browser deserve?

   Split out from the component for two reasons: the decision is pure and worth
   testing directly, and keeping it in the component file means the component
   exports a non-component, which breaks React Fast Refresh for everyone
   editing the app.

   The short version: Chromium can install itself in one tap, iOS cannot and
   needs hand-holding, and a browser that will never offer an install should
   not be shown a button at all.
   ========================================================================== */

export type InstallState =
  /** Will never be installable. Show nothing. */
  | 'unsupported'
  /** A `beforeinstallprompt` event is waiting to be replayed. */
  | 'ready'
  /** iOS: the user has to go through the Share menu themselves. */
  | 'ios-help';

/** Chromium-only event, absent from the DOM lib types. */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** True when running from the home screen, not from a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes `navigator.standalone` and nothing else useful.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPadOS reports as Mac, so a coarse pointer is the only reliable tell. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iPadOsDesktopMode = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  // The in-app browsers are iOS regardless of platform reporting, and a webview
  // is not installable at all — so they must not be offered an install.
  return /iPad|iPhone|iPod/.test(ua) || iPadOsDesktopMode || /CriOS|FxiOS|EdgiOS/.test(ua);
}

/**
 * Chromium's requirements: a secure context and the event being available.
 * A non-secure origin (plain http on a LAN address) is never installable, and
 * showing the button there would be a dead control.
 */
export function chromiumCanInstall(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('onbeforeinstallprompt' in window)) return false;
  return window.isSecureContext;
}

/**
 * The decision, as a pure function of three booleans.
 *
 * Pure so the whole matrix can be tested without a browser — this is logic,
 * not plumbing, and it is the part most likely to be got wrong.
 */
export function decideInstall(options: {
  standalone: boolean;
  ios: boolean;
  chromiumEvent: boolean;
}): InstallState {
  // Already installed. Offering to install again is noise.
  if (options.standalone) return 'unsupported';
  // iOS has no install API, so it gets instructions rather than a no-op.
  if (options.ios) return 'ios-help';
  if (options.chromiumEvent) return 'ready';
  return 'unsupported';
}

/** The same decision, read from the current environment. */
export function currentInstallState(): InstallState {
  return decideInstall({
    standalone: isStandalone(),
    ios: isIos(),
    chromiumEvent: chromiumCanInstall(),
  });
}
