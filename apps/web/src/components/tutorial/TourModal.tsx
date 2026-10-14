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

/* =========================================================================
   Narrow-screen presentation of the tour

   The same four steps as the spotlight, as a paged modal.

   WHY A DIFFERENT PRESENTATION AT ALL
   Below the desktop breakpoint the app is tab-based: exactly one of the three
   panels is on screen at a time, chosen from the bottom tab bar. A spotlight
   pointing at "the controls panel" would be pointing at something hidden
   behind the results panel. Forcing the spotlight to work anyway would mean
   driving the tab bar from inside the tour, and the first thing to break would
   be a tour pointing at the wrong panel — which reads as broken, not as
   clever.

   So the content is shared and only the presentation differs. Both read
   `TOUR_STEPS`, so the two cannot say different things.
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
    /* A real modal is correct here and only here. On narrow screens the page
       behind has nothing worth showing, and Radix handles the focus trap and
       Escape for us — which is why the spotlight had to write its own. */
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
  );
}
