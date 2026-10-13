import { lazy, Suspense } from 'react';

/* =========================================================================
   The charts, loaded on demand.
   -------------------------------------------------------------------------
   Recharts and its dependencies are the second-largest thing in the bundle
   after Three.js. The metric cards above these charts carry the headline
   numbers and render immediately, so deferring the graphs costs the user
   nothing they were waiting for.

   The placeholder reserves roughly the height the charts will occupy. Without
   it the results panel would visibly jump as the chunk arrives — a layout
   shift that is more disruptive than the loading itself, and one that WCAG
   2.2 would score as a failure.
   ========================================================================== */

const Charts = lazy(() =>
  import('@/components/charts/Charts').then((module) => ({ default: module.Charts })),
);

export function LazyCharts() {
  return (
    <Suspense fallback={<ChartsPlaceholder />}>
      <Charts />
    </Suspense>
  );
}

function ChartsPlaceholder() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-72 rounded-card border border-line bg-surface" />
      <div className="h-64 rounded-card border border-line bg-surface" />
    </div>
  );
}
