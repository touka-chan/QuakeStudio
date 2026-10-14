import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTourStore } from '@/store/tourStore';

/* =========================================================================
   "How to use" — re-entry point for the tour, as a floating button.

   It lives at the bottom of the screen rather than in the top bar. The top bar
   had reached seven controls, and it had already cut two of them off at 360px
   once before; a permanent control was the wrong thing to keep adding to it.

   FLOATS ABOVE THINGS, AND THE PLACES IT FLOATS OVER ARE RESERVED
   A fixed button sits on top of whatever is underneath, so the layouts it can
   land on have to leave room for it. Two places, both deliberate:

   - The results panel gets extra bottom padding, because on a desktop layout
     that panel is the thing on the right and the last control in it would
     otherwise sit under the button.
   - It stands higher on a phone, because the bottom of a phone is the tab bar.

   Without those, this would quietly cover the one control a user is most
   likely to be reaching for.

   HIDDEN WHILE THE TOUR IS SHOWING - BUT STILL IN THE DOM
   The card already offers "Skip tour", so a second exit floating over the
   overlay is clutter. The first version returned null, which looked right and
   broke something: this button is the most common way INTO the tour, so it is
   usually what had focus when the tour opened. Unmounting it means the focus
   trap hands focus back to an element that no longer exists, and focus lands
   on <body> - a keyboard user who ran the tour and came back has to tab from
   the top of the page to get oriented again.

   So it is made invisible rather than removed: `opacity-0`, no pointer events,
   `aria-hidden`, and out of the tab order. Nothing can see it, reach it or Tab
   to it, and it is still in the document to be focused when the tour closes.
   The `tabIndex: -1` is not decoration - it is what makes an `aria-hidden`
   element legal, and axe checks for exactly that pairing.
   ========================================================================= */

export function TourButton() {
  const start = useTourStore((s) => s.start);
  const tourOpen = useTourStore((s) => s.open);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          onClick={start}
          /*
           * Icon only, so the name has to be on the control. Without this a
           * screen reader announces a bare button with no way of telling it from
           * the other three in the corner — which is exactly what happened to
           * the feedback button here once already.
           */
          aria-label="How to use"
          aria-hidden={tourOpen || undefined}
          tabIndex={tourOpen ? -1 : undefined}
          className={cn(
            /*
             * 48px on a phone, 56px on a desktop. Both are above the 44px
             * minimum, and on a 360px screen every pixel the button takes is a
             * pixel of scrolling content it is sitting on.
             */
            'fixed right-3 bottom-20 z-40 size-12 rounded-full bg-surface p-0 shadow-lg lg:right-5 lg:bottom-5 lg:size-14',
            tourOpen && 'pointer-events-none opacity-0',
          )}
        >
          <CircleHelp aria-hidden="true" className="size-6" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        Walk through the four things you can do here.
      </TooltipContent>
    </Tooltip>
  );
}
