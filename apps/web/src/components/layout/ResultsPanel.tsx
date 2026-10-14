import { Columns2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ComparisonTable } from '@/components/charts/ComparisonTable';
import { LazyCharts } from '@/components/charts/LazyCharts';
import { MetricCard } from '@/components/charts/MetricCard';
import { formatMm, formatPct } from '@/lib/utils';
import { useCompareStore, defaultCompareBuilding } from '@/store/compareStore';
import { useConfigStore, resolveNow } from '@/store/configStore';

/* =========================================================================
   Results panel — the right zone.
   -------------------------------------------------------------------------
   Metric cards, then the charts, then the compare call-to-action.

   The metric cards render immediately and the charts stream in behind a
   placeholder — see `charts/LazyCharts.tsx`. The headline numbers therefore
   never wait on a chart library, which is why the split is here rather than
   around the whole panel.
   ========================================================================= */

const M2S_TO_MM = 1000;

export function ResultsPanel() {
  const result = useConfigStore((s) => s.result);
  const building = useConfigStore((s) => s.building);
  const status = useConfigStore((s) => s.status);

  const compareEnabled = useCompareStore((s) => s.enabled);
  const enable = useCompareStore((s) => s.enable);
  const disable = useCompareStore((s) => s.disable);

  const toggleCompare = () => {
    if (compareEnabled) {
      disable();
      resolveNow();
      return;
    }
    // Give B a genuinely different starting point, so the comparison shows
    // something rather than two identical buildings.
    useConfigStore.getState().setCompareBuilding(defaultCompareBuilding());
    enable();
    resolveNow();
  };

  const topFloor = building.floors;
  const peakAtTop = result.peakDisp[topFloor - 1] ?? 0;
  const driftPct = result.maxDriftRatio * 100;
  const period = result.periodsS[0] ?? 0;
  const worstStory = result.driftRatio.indexOf(result.maxDriftRatio) + 1;
  const engineError = useConfigStore((s) => s.error);

  // The worker's first response has not landed yet — show a skeleton rather
  // than a grid of zeros, which would read as a real (and alarming) result.
  const isLoading = status === 'computing' && result.time.length === 0;

  return (
    <ScrollArea className="min-h-0 flex-1">
      {/*
        The right gutter and the extra bottom padding are both for the floating
        "How to use" button.

        The gutter matters on a phone, where this panel is the thing on the
        right and the button covers the right 60px of it — right through the
        "Compare with another building" control. Bottom padding alone cannot
        fix it, because content in the middle of the scroll passes underneath
        too; that is what the responsive audit caught when it reported a
        control as unclickable even after scrolling it into view.

        Both are mobile-only: a desktop layout is wide enough that the audit
        finds nothing underneath.
      */}
      <div className="space-y-4 p-4 pr-16 pb-32 lg:pr-4 lg:pb-24">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Results</h2>
          {status === 'computing' ? (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Updating…
            </span>
          ) : null}
        </header>

        {engineError ? (
          <p
            role="alert"
            className="rounded-app border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {engineError}
          </p>
        ) : null}

        {isLoading ? <ResultsSkeleton /> : null}

        {/* ---- Metric cards ----
            One column on a phone, three from `sm` up.

            Measured at 360px: three columns left each card 102px of content,
            and "DISPLACEMENT" needs about 96px before padding. That is not a
            font-size problem — there is no size at which three of these
            labels read well on a narrow screen. Stacking is the fix: the
            numbers stay at full size instead of shrinking to survive. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <MetricCard
            label="Peak displacement"
            value={formatMm(peakAtTop * M2S_TO_MM)}
            unit="mm"
            detail={`Floor ${topFloor}, relative to ground`}
            help="The furthest any floor moved sideways, measured from the ground beneath it."
            testId="metric-peak-disp"
          />
          <MetricCard
            label="Max story drift"
            value={formatPct(driftPct)}
            unit="%"
            detail={`Story ${worstStory}`}
            tone="caution"
            help="The biggest gap between one floor and the floor below it, as a percentage of floor height."
            testId="metric-max-drift"
          />
          <MetricCard
            label="Natural period"
            value={period.toFixed(2)}
            unit="s"
            detail="1st mode"
            help="How long the building takes to sway back and forth once, at its natural rhythm."
            testId="metric-period"
          />
        </div>

        <LazyCharts />

        {/* The table stays eager: it carries the numbers, and there is nothing
            to gain by deferring it. */}
        <ComparisonTable />

        <div className="space-y-2">
          <Button
            className="h-11 w-full"
            variant={compareEnabled ? 'outline' : 'default'}
            onClick={toggleCompare}
            data-tour="compare"
          >
            <Columns2 aria-hidden="true" />
            {compareEnabled ? 'Stop comparing' : 'Compare with another building'}
          </Button>
          <p className="text-xs text-muted-foreground">
            {compareEnabled
              ? 'Both buildings felt the same earthquake. Edit building B on the left.'
              : 'Adds a second configuration and runs both under one earthquake.'}
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------------- */

/** Shown while the worker's first result is in flight. */
function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {/* Same breakpoints as the real cards above. If these disagree the whole
          panel jumps the moment results land, which looks like a glitch. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-card border border-line bg-surface-2"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-card border border-line bg-surface-2" />
      <div className="h-72 animate-pulse rounded-card border border-line bg-surface-2" />
    </div>
  );
}
