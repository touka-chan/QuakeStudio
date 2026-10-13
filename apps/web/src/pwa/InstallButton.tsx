import { useEffect, useState } from 'react';
import { Download, Share } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  chromiumCanInstall,
  currentInstallState,
  type BeforeInstallPromptEvent,
  type InstallState,
} from './install';

/* =========================================================================
   Installing QuakeStudio
   -------------------------------------------------------------------------
   A PWA is only useful if people can find the install affordance, and the two
   platforms need different ones:

   • Chromium (Chrome, Edge, Android) fires `beforeinstallprompt`, which the
     page can hold and replay. That gives a real one-click install.

   • iOS Safari has NO install API. There is no event to catch and nothing to
     call. The only route is Share -> "Add to Home Screen", and iOS only
     *sometimes* offers that menu item — not in every Safari version, not on
     every iPad.

   So the button does two different things depending on what the browser
   supports, and says which one it is rather than failing quietly. A button
   labelled "Install" that does nothing on a student's iPhone is worse than no
   button at all.

   It is deliberately NOT shown when the app is already installed, and NOT
   shown to a browser that will never offer an install — a permanent dead
   button trains people to ignore the ones that work. The decision itself
   lives in `./install`, where it is a pure function and is tested directly.
   ========================================================================== */

export function InstallButton() {
  // Lazily initialised from the environment rather than set in an effect:
  // this is a one-time read, and setting state in an effect body would cost an
  // extra render on every mount for a value that is already known.
  const [state, setState] = useState<InstallState>(currentInstallState);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      /*
       * Chrome fires this so the app can suppress its own mini-infobar and
       * offer the install somewhere useful instead. Preventing the default is
       * mandatory — without it the deferred `prompt()` below never opens.
       */
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setState((current) => (current === 'ios-help' ? current : 'ready'));
    }

    function onInstalled() {
      setDeferred(null);
      setState('unsupported');
    }

    /*
     * `onbeforeinstallprompt` is not a real property until Chromium adds it, so
     * it is feature-detected rather than assumed. `currentInstallState` cannot
     * see the event before it fires — the property's existence is the only
     * early signal there is.
     */
    if (!chromiumCanInstall()) return undefined;

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (state === 'unsupported') return null;

  async function install() {
    if (state === 'ios-help') {
      setHelpOpen(true);
      return;
    }
    if (!deferred) return;

    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    /*
     * A dismissal is not a failure — the user changed their mind. Leave the
     * button up; hiding it after one "no" means a student who was interrupted
     * can never install.
     */
    if (outcome === 'accepted') setState('unsupported');
    setDeferred(null);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={install}>
        {state === 'ios-help' ? <Share aria-hidden="true" /> : <Download aria-hidden="true" />}
        <span className="hidden lg:inline">Install app</span>
      </Button>

      {/* Beside its trigger, so Radix restores focus here on close. */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add QuakeStudio to your home screen</DialogTitle>
            <DialogDescription>
              iOS does not let a website install itself. It takes two taps from the Share menu.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-2.5 text-sm">
            <li className="flex gap-3">
              <Step number="1">
                Tap the <strong>Share</strong> button in Safari’s toolbar — the square with an arrow
                pointing up.
              </Step>
            </li>
            <li className="flex gap-3">
              <Step number="2">
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </Step>
            </li>
            <li className="flex gap-3">
              <Step number="3">
                Tap <strong>Add</strong>. QuakeStudio opens full-screen from then on, and works with
                no signal.
              </Step>
            </li>
          </ol>

          <p className="text-xs text-muted-foreground">
            If you cannot see <em>Add to Home Screen</em> in the Share menu, it is not offered on
            this browser — Safari on iPhone is the usual way in.
          </p>

          <DialogFooter>
            <Button onClick={() => setHelpOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold"
      >
        {number}
      </span>
      <span>{children}</span>
    </>
  );
}
