import { useState } from 'react';
import { ArrowLeftRight, Play, Waves } from 'lucide-react';

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
import { DISCLAIMER_LONG, STORAGE_KEYS } from '@/config/engineeringAssumptions';

/* =========================================================================
   First-run dialog
   -------------------------------------------------------------------------
   Three steps, a plain-language explanation, and an explicit acknowledgement
   that this is a learning tool. The checkbox gates the start button — the
   brief asks for acknowledgement, so it has to be a real gate rather than
   decorative copy.

   Only ever shown once per browser. Dismissal is remembered in localStorage;
   if storage is unavailable we simply show it again next time, which is the
   safe failure direction for a disclaimer.
   ========================================================================= */

const STEPS = [
  {
    icon: Play,
    title: 'Build',
    body: 'Pick a template or change the floors, size, material and frame type.',
  },
  {
    icon: Waves,
    title: 'Shake',
    body: 'Choose how strong and how fast the ground moves, then press play.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Compare',
    body: 'Add a second building and see how the sway and the numbers differ.',
  },
] as const;

/**
 * Whether the first-run dialog has been dismissed.
 *
 * Read lazily on first render rather than in an effect: the app is
 * client-only, so there is no SSR flash to avoid, and this avoids a wasted
 * render pass. If storage is unavailable we return `true` — showing the
 * disclaimer again is the safe failure direction.
 */
function shouldShowFirstRun(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.firstRunAcknowledged) !== 'true';
  } catch {
    return true;
  }
}

export function FirstRunDialog() {
  const [open, setOpen] = useState(shouldShowFirstRun);
  const [acknowledged, setAcknowledged] = useState(false);

  function start() {
    try {
      localStorage.setItem(STORAGE_KEYS.firstRunAcknowledged, 'true');
    } catch {
      // Non-fatal. The user can still use the app; we just ask again next time.
    }
    setOpen(false);
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
            <DialogTitle className="text-2xl">Welcome to QuakeStudio</DialogTitle>
          </div>
          <DialogDescription>
            Build a simple building, shake it, and watch how it sways.
          </DialogDescription>
        </DialogHeader>

        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-card border border-line bg-surface-2 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <step.icon aria-hidden="true" className="size-4 text-muted-foreground" />
              </div>
              <p className="font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>

        <p className="rounded-app border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-warning-text">
          {/* DISCLAIMER_LONG already opens with "This is a learning tool, not
              a safety check." — restating it here duplicated the sentence. */}
          {DISCLAIMER_LONG}
        </p>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
              setAcknowledged(checked === true)
            }
            className="mt-0.5"
          />
          <span>I understand that results are for learning only.</span>
        </label>

        <DialogFooter>
          <Button variant="ghost" disabled>
            Read the assumptions
          </Button>
          <Button onClick={start} disabled={!acknowledged}>
            Start exploring
          </Button>
        </DialogFooter>
        <p className="text-center text-xs text-muted-foreground">
          The assumptions page opens in Phase 5. See <code>docs/assumptions.md</code> meanwhile.
        </p>
      </DialogContent>
    </Dialog>
  );
}
