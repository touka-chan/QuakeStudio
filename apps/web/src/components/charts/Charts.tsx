import { ComparisonChart } from './ComparisonChart';
import { DisplacementChart } from './DisplacementChart';
import { PeakByFloorChart } from './PeakByFloorChart';

/* =========================================================================
   The Recharts-based charts, gathered into one module.
   -------------------------------------------------------------------------
   This exists purely so they can be lazy-loaded as a SINGLE chunk. Three
   separate `lazy()` calls would make three requests that each pull in their
   own copy of Recharts' shared dependencies — worse than shipping them
   together.

   `ComparisonTable` is deliberately NOT here. It contains no chart code, it
   renders no canvas, and it is the part of comparison mode that carries the
   actual numbers. Deferring it would hide the results behind a spinner for no
   saving at all.
   ========================================================================== */

export function Charts() {
  return (
    <>
      <DisplacementChart />
      <PeakByFloorChart />
      <ComparisonChart />
    </>
  );
}
