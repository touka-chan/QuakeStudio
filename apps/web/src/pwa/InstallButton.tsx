import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  chromiumCanInstall,
  currentInstallState,
  type BeforeInstallPromptEvent,
  type InstallState,
} from './install';

/* =========================================================================
   Installing QuakeStudio — Android and desktop Chromium
   -------------------------------------------------------------------------
   One path, via Chromium's `beforeinstallprompt`. The browser fires this so the
   app can suppress its own mini-infobar and offer the install somewhere useful;
   holding the event and replaying it is what turns that into a real one-click
   install.

   The button is deliberately NOT shown when the app is already installed, and
   NOT shown in a browser that can never install it — a permanent dead button
   trains people to ignore the ones that work. The decision itself lives in
   `./install`, where it is a pure function and is tested directly.

   iOS is out of scope on purpose: Safari exposes no install API, so the only
   route is a manual Share-menu action this page cannot perform.
   ========================================================================== */

export function InstallButton() {
  // Lazily initialised from the environment rather than set in an effect: this
  // is a one-time read, and setting state in an effect body would cost an extra
  // render on every mount for a value that is already known.
  const [state, setState] = useState<InstallState>(currentInstallState);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      /*
       * Chrome fires this so the app can suppress its own mini-infobar and
       * offer the install somewhere useful instead. Preventing the default is
       * mandatory — without it the deferred `prompt()` below never opens.
       */
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setState('ready');
    }

    function onInstalled() {
      setDeferred(null);
      setState('unsupported');
    }

    /*
     * `onbeforeinstallprompt` is not a real property until Chromium adds it, so
     * it is feature-detected rather than assumed. Its existence is the only
     * early signal available — the event itself has not fired yet.
     */
    if (!chromiumCanInstall()) return undefined;

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (state !== 'ready' || !deferred) return null;

  async function install() {
    await deferred!.prompt();
    const { outcome } = await deferred!.userChoice;
    /*
     * A dismissal is not a failure — the user changed their mind. Leaving the
     * button up is right here: there is no other install path to fall back to,
     * so someone who was interrupted must still be able to install later.
     */
    if (outcome === 'accepted') setState('unsupported');
    setDeferred(null);
  }

  return (
    <Button variant="outline" size="sm" onClick={install}>
      <Download aria-hidden="true" />
      <span className="hidden lg:inline">Install app</span>
    </Button>
  );
}
