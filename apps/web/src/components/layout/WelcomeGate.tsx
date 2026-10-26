import { useState } from 'react';
import { ArrowLeftRight, Play, Waves } from 'lucide-react';

import { BRANDING, WELCOME } from '@/content/branding';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { STORAGE_KEYS } from '@/config/engineeringAssumptions';

/* =========================================================================
   The welcome gate.
   -------------------------------------------------------------------------
   Three steps, a plain-language explanation, and an explicit acknowledgement
   that this is a learning tool. The checkbox gates the start button - the
   brief asks for acknowledgement, so it has to be a real gate rather than
   decorative copy.

   SHOWN ON EVERY VISIT, NOT ONLY THE FIRST ONE.

   It used to appear once per browser: acknowledging it wrote a flag and it never
   came back. The client asked for it on every restart and every refresh, the
   same as the tour, which already behaves that way. So dismissing it now closes
   it for the rest of the session and for nothing else. Nothing is written to
   storage and there is nothing to remember it with.

   It still waits its turn behind the tour rather than competing with it — see
   `blocked` below.
   ========================================================================= */

const STEP_ICONS = {
  play: Play,
  waves: Waves,
  compare: ArrowLeftRight,
} as const;

/**
 * Whether something has asked for the gate to stay out of the way.
 *
 * THE APP NEVER WRITES THIS, exactly like `tourSuppressed`. There is nothing
 * left for it to suppress: the gate is meant to open on every visit, so
 * recording that someone acknowledged it once would be recording the opposite of
 * what the product now does.
 *
 * It is here for the two cases that legitimately want the workspace without the
 * gate — the end-to-end suite, which would otherwise tick a checkbox before
 * every single test, and anyone embedding the tool somewhere the disclaimer has
 * already been given.
 *
 * Read lazily on first render rather than in an effect: the app is client-only,
 * so there is no SSR flash to avoid, and this avoids a wasted render pass. If
 * storage is unavailable the gate shows, which is the safe direction.
 */
function gateSuppressed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.disclaimerSuppressed) === 'true';
  } catch {
    return false;
  }
}

/**
 * The disclaimer gate.
 *
 * `blocked` is true while something else owns the screen — currently the
 * guided tour. The gate waits rather than competing: two overlays open at once
 * would fight over focus, and a race between them shows up as "the app is
 * stuck" — which on every-visit behaviour is the very first thing anyone sees.
 *
 * Defaults to false, so this component still behaves exactly as it always has
 * when rendered on its own.
 */
export function WelcomeGate({
  onOpenAssumptions,
  blocked = false,
}: {
  onOpenAssumptions: () => void;
  blocked?: boolean;
}) {
  /*
   * Read once, and separately from `blocked`. Something may have suppressed the
   * gate entirely, in which case the tour is free to run with nothing behind it.
   */
  const [suppressed] = useState(gateSuppressed);
  const [dismissed, setDismissed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const open = WELCOME.enabled && !suppressed && !dismissed && !blocked;

  function start() {
    // Nothing is written down, on purpose. It closes for the rest of this
    // session and opens again on the next visit, which is the behaviour that
    // was asked for; remembering it would be remembering how not to do that.
    setDismissed(true);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && acknowledged && start()}>
      <DialogContent className="max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <div
              className="grid size-11 place-items-center rounded-app bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <Play className="size-5" />
            </div>
            <DialogTitle className="text-2xl">{WELCOME.title}</DialogTitle>
          </div>
          <DialogDescription>{WELCOME.description}</DialogDescription>
        </DialogHeader>

        <ol className="grid gap-3 sm:grid-cols-3">
          {WELCOME.steps.map((step, index) => {
            const Icon = STEP_ICONS[step.icon] ?? Play;
            return (
              <li key={step.id} className="rounded-card border border-line bg-surface-2 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                </div>
                <p className="font-semibold">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </li>
            );
          })}
        </ol>

        <p className="rounded-app border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-warning-text">
          {BRANDING.disclaimerLong}
        </p>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
              setAcknowledged(checked === true)
            }
            className="mt-0.5"
          />
          <span>{WELCOME.acknowledgement}</span>
        </label>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              /*
               * Close this first, then open the assumptions. Both are modal, and
               * two stacked modals trap focus twice over.
               *
               * The acknowledgement is deliberately NOT recorded here: reading
               * the assumptions is not the same as agreeing to them, and the
               * gate must mean something.
               */
              setDismissed(true);
              onOpenAssumptions();
            }}
          >
            {WELCOME.assumptionsLabel}
          </Button>
          <Button onClick={start} disabled={!acknowledged}>
            {WELCOME.startLabel}
          </Button>
        </DialogFooter>
        <p className="text-center text-xs text-muted-foreground">{WELCOME.footer}</p>
      </DialogContent>
    </Dialog>
  );
}
