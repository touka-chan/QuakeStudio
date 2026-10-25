import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TourStep } from './tourSteps';
import { TOUR_BACKDROP_FILTER } from './tourBackdrop';

/* =========================================================================
   Narrow-screen presentation of the tour

   The same five steps as the spotlight, as a paged modal.

   WHY A DIFFERENT PRESENTATION AT ALL
   Below the desktop breakpoint the app opens on the Continue-anyway notice,
   and choosing to continue mounts the desktop workspace with sideways
   scrolling. The workspace under the modal is therefore the same three zones
   the spotlight points at — but a spotlight is built around targets it can
   outline in place, and narrow screens reach that workspace by scrolling, so
   the spotlight's geometry (outline, hole, card placement) is measured
   against a viewport that does not hold most of the workspace. The modal
   says the same words without pretending the workspace is all in view.

   So the content is shared and only the presentation differs. Both read
   `TOUR_STEPS`, so the two cannot say different things.

   AND THE BACKDROP IS SHARED TOO, WHICH IT WAS NOT
   This file had no blur in it at all. Radix's overlay is a plain `bg-black/50`
   scrim, so below 1024px the app behind the tour was dimmed and otherwise
   completely untouched — the client reported it as "the background is not
   blurred", and it was right, and the work done on the spotlight last time had
   not touched this side at all.

   It went unnoticed because every test of the blur ran at 1280px, which is
   desktop, so the presentation that was broken was never rendered in a check.

   A separate overlay, painted below Radix's, because Radix renders its own and
   takes no styling hook for it. `pointer-events-none` and `aria-hidden` for the
   same reason the spotlight's layers carry them: this is purely visual, and the
   scrim above it is what stops clicks.
   ========================================================================= */

type Props = {
  step: TourStep;
  index: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

export function TourModal({ step, index, total, isLast, onNext, onBack, onSkip }: Props) {
  return (
    <>
      {/* The softened app behind the tour. See the note at the top. */}
      <div
        aria-hidden="true"
        data-tour-backdrop=""
        className="pointer-events-none fixed inset-0 z-50"
        style={{
          backdropFilter: TOUR_BACKDROP_FILTER,
          WebkitBackdropFilter: TOUR_BACKDROP_FILTER,
        }}
      />

      {/* A real modal is correct here: the workspace behind is reached by
       sideways scrolling, so nothing in it is reliably in view to point at,
       and Radix handles the focus trap and Escape — which is why the spotlight
       had to write its own. */}
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onSkip();
        }}
      >
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <div className="mb-1 flex items-center gap-3">
              <div
                className="grid size-10 shrink-0 place-items-center rounded-app bg-primary text-primary-foreground"
                aria-hidden="true"
              >
                <step.icon className="size-5" />
              </div>
              <DialogTitle>{step.title}</DialogTitle>
            </div>
            <DialogDescription>{step.body}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              Step {index + 1} of {total}
            </span>
            <ol className="flex gap-1.5" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <li
                  key={i}
                  className={`size-1.5 rounded-full ${i === index ? 'bg-primary' : 'bg-line'}`}
                />
              ))}
            </ol>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip tour
            </Button>
            <Button variant="outline" size="sm" onClick={onBack} disabled={index === 0}>
              <ChevronLeft aria-hidden="true" />
              Back
            </Button>
            <Button size="sm" onClick={onNext}>
              {isLast ? 'Finish' : 'Next'}
              {isLast ? null : <ChevronRight aria-hidden="true" />}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
