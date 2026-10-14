import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTourStore } from '@/store/tourStore';

/* =========================================================================
   "How to use" — re-entry point for the tour.

   The tour runs once, then this is the only way back to it. Without it the
   tutorial would be a one-shot wall: a user who dismissed it in a hurry has no
   route back, which is the main way a first-run tour ends up resented.
   ========================================================================= */

export function TourButton() {
  const start = useTourStore((s) => s.start);
  const open = useTourStore((s) => s.open);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="How to use"
          onClick={start}
          /*
           * Disabled while the tour is showing. `start` rewinds to step 0, so
           * leaving it live would let a click silently throw away progress
           * part way through.
           */
          disabled={open}
        >
          <CircleHelp aria-hidden="true" />
          {/*
            Same reasoning as the Feedback button: the label is hidden below
            `lg` and this is the only text in the control, so without the
            aria-label there is no accessible name on a phone.
          */}
          <span className="hidden lg:inline">How to use</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        Walk through the four things you can do here.
      </TooltipContent>
    </Tooltip>
  );
}
