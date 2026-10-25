import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, Building2, Layers, Play, Waves } from 'lucide-react';

import { VIEWPORT } from '@/config/engineeringAssumptions';

/* =========================================================================
   Tour steps — the single source of truth

   One definition, two presentations: the spotlight tour on desktop and the
   paged modal on narrow screens both read this array. They cannot drift
   apart, because there is only one place to change the words.

   `target` matches a `data-tour` attribute placed on the real element. An
   attribute rather than a CSS selector on purpose: restyling cannot silently
   break the tour, and a broken tour fails by pointing at nothing rather than
   by highlighting the wrong panel.

   COPY RULES FOR THIS FILE
   - No claim about safety, ever. This tool does not assess real structures.
   - Never present a number as real. Where a number appears, it is a teaching
     placeholder and the page says so.
   - The exaggeration figure is interpolated from VIEWPORT, not typed in. If
     the default changes, the sentence follows it. A hardcoded "20" here would
     be a claim that quietly stops being true.
   ========================================================================= */

export type TourStep = {
  /** Matches `data-tour` on the element this step points at. */
  target: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

const EXAGGERATION = VIEWPORT.defaultExaggeration;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'controls',
    title: 'Set up your building',
    body: 'Pick a template, then set how many floors it has, how big each one is, what it is made of, and whether the frame is braced. Every one of those changes how the building answers a shake.',
    icon: Building2,
  },
  {
    target: 'loads',
    title: 'Give each floor a use',
    body: 'Choose what each floor is for — office, home, parking or storage — or type your own dead and live loads. The use sets how much live load is counted, which changes the building’s weight and how it sways. These are teaching defaults, not a design check.',
    icon: Layers,
  },
  {
    /*
     * The Play button, not the viewport.
     *
     * Pointing at the whole 3D viewport sounds tidier, but that region is the
     * full height of the middle column, so there is nowhere to put a card that
     * is not on top of it. And it is less useful: the viewport is where the
     * result appears, the button is the thing you press to start it.
     */
    target: 'play',
    title: 'Shake it',
    body: `Press play to run the earthquake. The movement you see is drawn about ${EXAGGERATION} times larger than it really is, so the sway is easy to follow — but the numbers are never scaled. That setting only changes the drawing.`,
    icon: Waves,
  },
  {
    target: 'results',
    title: 'Read the numbers',
    body: 'Peak displacement, max story drift and natural period. Colour on the building shows how far each floor moved compared to its own height. These come from a teaching model, not from a safety check.',
    icon: Play,
  },
  {
    target: 'compare',
    title: 'Compare two buildings',
    body: 'Turn on compare to add a second building and watch both react to the same earthquake. Useful for asking what actually makes a building handle shaking better.',
    icon: ArrowLeftRight,
  },
] as const;
