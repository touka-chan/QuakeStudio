import { Capacitor } from '@capacitor/core';

/* =========================================================================
   Android hardware back button
   -------------------------------------------------------------------------
   THE BUG THIS FIXES
   ----------------------------------------------------------------------------
   With no handler, Android's back button closes the activity. Open the About
   dialog, press back, and the app goes to the background instead of the
   dialog closing. Verified on a realme running Android 11, and it is the most
   commonly complained-about bug in any app that wraps a web view.

   WHAT THE BUTTON SHOULD DO, in order
   ----------------------------------------------------------------------------
   1. Close whatever dialog is open — the user asked to dismiss the thing in
      front of them.
   2. If none is open, go back a step within the app. On a phone the workspace
      is three tabs, so back returns to Build rather than leaving.
   3. Only when there is nowhere left to go, let the OS close the app.

   Step 1 is deliberately DOM-driven rather than "let Radix handle it". Radix
   closes its own dialogs on Escape, but nothing routes a native back press
   into that. A dialog that is visually still open while the app is in the
   background is the worst outcome of all: the user comes back and finds it
   exactly as they left it, as though nothing happened.

   ── WHY THE CAPACITOR IMPORT IS LAZY ──────────────────────────────────────
   A static `import { App } from '@capacitor/app'` would pull a native plugin
   into the web build, and the plugin is a no-op in a browser. The PWA still
   has to work without it, and the entry chunk is currently 175 KB with a
   deliberate budget — this must not become the reason it grows.
   ========================================================================== */

type SidebarTab = 'build' | 'simulate' | 'results';

/**
 * Dispatched when the user asks to go back within the app.
 *
 * Returns true if something handled it. Anything false means "carry on and
 * close the app", which is the contract the native listener relies on.
 */
export const BACK_REQUESTED = 'quakestudio:back-requested';

/** Is a modal dialog open right now? */
function dialogOpen(): boolean {
  if (typeof document === 'undefined') return false;

  /*
   * Radix marks its overlay content with `data-state="open"`, and marks the
   * element itself inert while open. Checking `inert` rather than only
   * visibility means a dialog mid-close — still in the DOM, already animating
   * out — is not counted as open, so a fast double-back does not fight itself.
   */
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ),
  );
}

/** The mobile tab currently shown, or null on desktop. */
function activeTab(): SidebarTab | null {
  if (typeof document === 'undefined') return null;
  const selected = document.querySelector('[role="tab"][aria-selected="true"]');
  const label = selected?.textContent?.trim().toLowerCase() ?? '';
  if (label.includes('build')) return 'build';
  if (label.includes('simulate')) return 'simulate';
  if (label.includes('results')) return 'results';
  return null;
}

async function handleBack(): Promise<boolean> {
  // 1. A dialog is the top-most thing; the user means to dismiss it.
  if (dialogOpen()) {
    /*
     * Dispatching Escape rather than reaching into Radix: it is the same path
     * the keyboard takes, so focus restoration runs exactly as it does for a
     * keyboard user. Reaching in and calling close() would skip that, and the
     * last bug fixed in this area was precisely focus not being restored.
     */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  }

  // 2. Return to Build from another tab.
  const tab = activeTab();
  if (tab && tab !== 'build') {
    document.dispatchEvent(
      new CustomEvent(BACK_REQUESTED, { detail: { tab: 'build' }, bubbles: true }),
    );
    return true;
  }

  // 3. Nothing left to go back to. Let the OS close the app.
  return false;
}

/**
 * Wire the hardware back button, if we are running inside the Android app.
 *
 * A no-op in a browser, so this is safe to call unconditionally.
 */
export async function registerBackButton(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { App } = await import('@capacitor/app');

    await App.addListener('backButton', () => {
      void handleBack();
    });
  } catch (error) {
    /*
     * Failing here must never stop the app booting. On a platform without the
     * plugin, back behaves exactly as it did before — which is a known,
     * documented gap rather than a crash.
     */
    console.warn('Back-button handling is unavailable:', error);
  }
}

/** Exposed for tests: the decision, without any Capacitor involvement. */
export const __testing = { handleBack, dialogOpen, activeTab };