import { DisplacementChart } from './DisplacementChart';
import { PeakByFloorChart } from './PeakByFloorChart';

/* =========================================================================
   The Recharts-based charts, gathered into one module.

   This exists purely so they can be lazy-loaded as a SINGLE chunk. Two
   separate `lazy()` calls would make two requests that each pull in their own
   copy of Recharts' shared dependencies - worse than shipping them together.

   `ComparisonTable` is deliberately NOT here. It contains no chart code, it
   renders no canvas, and it is the part of comparison mode that carries the
   actual numbers. Deferring it would hide the results behind a spinner for no
   saving at all.

   A third chart used to live here: `ComparisonChart`, an A-against-B overlay of
   the top floor. It is gone because `DisplacementChart` now plots both
   buildings itself. Keeping both meant scrolling down to compare, and the
   overlay could not follow the floor you had highlighted in 3D.
   ========================================================================= */

export function Charts() {
  return (
    <>
      <DisplacementChart />
      <PeakByFloorChart />
    </>
  );
}
