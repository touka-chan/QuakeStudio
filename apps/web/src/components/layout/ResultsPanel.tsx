import { Columns2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ComparisonTable } from '@/components/charts/ComparisonTable';
import { LazyCharts } from '@/components/charts/LazyCharts';
import { MetricCard } from '@/components/charts/MetricCard';
import { WeightSummary } from '@/components/charts/WeightSummary';
import { formatGrouped, formatMm, formatPct } from '@/lib/utils';
import {
  defaultCompareBuilding,
  seriesColor,
  sideIndex,
  useCompareStore,
} from '@/store/compareStore';
import { useConfigStore, resolveNow } from '@/store/configStore';
import type { BuildingConfig } from '@/types';

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
  /*
   * THE CARDS FOLLOW THE SELECTED BUILDING
   *
   * These used to read `s.result` and `s.building` — building A, always — so a
   * user who switched the controls over to B, changed a slider, and came to
   * read the outcome was shown A's numbers with no indication of whose they
   * were. A metric panel that answers a question about something other than the
   * thing being edited is worse than no panel, because it is confidently wrong.
   *
   * The building's own index is what indexes the store, so A through D are one
   * code path rather than four.
   */
  const editing = useCompareStore((s) => s.editing);
  const index = sideIndex(editing);
  const result = useConfigStore((s) =>
    index === 0 ? s.result : (s.results[index - 1] ?? s.result),
  );
  const building = useConfigStore((s) =>
    index === 0 ? s.building : (s.compareBuildings[index - 1] ?? s.building),
  );
  const status = useConfigStore((s) => s.status);

  const count = useCompareStore((s) => s.count);
  const enable = useCompareStore((s) => s.enable);
  const disable = useCompareStore((s) => s.disable);
  const compareEnabled = count > 1;

  const toggleCompare = () => {
    if (compareEnabled) {
      disable();
      resolveNow();
      return;
    }
    // Give B a genuinely different starting point, so the comparison shows
    // something rather than two identical buildings.
    useConfigStore.getState().setCompareBuildings([defaultCompareBuilding(0)]);
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
    <ScrollArea className="qs-scroll-x min-h-0 flex-1">
      <div className="space-y-4 p-4 pr-16 pb-32 lg:pr-4 lg:pb-24">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Results</h2>
          {/*
            Whose numbers these are.

            With one building this is noise worth suppressing. With four, the
            cards follow the selection in the controls panel, and a number with
            no owner is a number the reader has to guess about — and they will
            guess A, because A is what was on screen when they last looked.

            The letter is text, not just a coloured badge, so this survives a
            colour deficiency, a greyscale print and a screen in sunlight.
          */}
          {compareEnabled ? (
            <span
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              data-testid="results-owner"
            >
              <span
                className="grid size-4 place-items-center rounded text-[10px] font-semibold text-white"
                style={{ backgroundColor: seriesColor(editing) }}
                aria-hidden="true"
              >
                {editing}
              </span>
              Building {editing}
            </span>
          ) : status === 'computing' ? (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Updating…
            </span>
          ) : null}
        </header>

        {compareEnabled && status === 'computing' ? (
          <span className="sr-only" aria-live="polite">
            Updating building {editing}
          </span>
        ) : null}

        {engineError ? (
          <p
            role="alert"
            className="rounded-app border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {engineError}
          </p>
        ) : null}

        {isLoading ? (
          <ResultsSkeleton />
        ) : (
          <Tabs defaultValue="summary" className="gap-0">
            <TabsList className="w-full">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="response">Response</TabsTrigger>
            </TabsList>

            {/* ---- Summary ------------------------------------------------- */}
            <TabsContent value="summary" className="mt-4 space-y-4">
              {/* ---- Metric cards ----
                  Stacked at every width. Three columns would leave each card
                  under 102px of content, and "DISPLACEMENT" needs about 96px
                  before padding — stacking keeps the labels readable without
                  shrinking the numbers. */}
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

              <WeightSummary
                building={building}
                result={result}
                side={editing}
                showOwner={compareEnabled}
              />

              {/* The table stays eager: it carries the numbers, and there is
                  nothing to gain by deferring it. */}
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
                    ? // Generated from the count, because "Both buildings" under
                      // four columns is a caption that is quietly wrong.
                      `${count} buildings felt the same earthquake. Pick one on the left to edit it.`
                    : 'Adds a second, third or fourth configuration and runs them all under one earthquake.'}
                </p>
              </div>
            </TabsContent>

            {/* ---- Response ------------------------------------------------ */}
            <TabsContent value="response" className="mt-4 space-y-4">
              <LazyCharts />
              <ResponseNotes building={building} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * The dimensions and definitions behind the charts.
 *
 * Kept on the Response tab rather than the Summary: the Summary answers "how
 * heavy is it and how much did it move", while this is the reference a reader
 * reaches for when they want to check a number rather than read a headline.
 */
function ResponseNotes({ building }: { building: BuildingConfig }) {
  const heightM = building.floors * building.floorHeightM;
  const areaM2 = building.widthM * building.depthM;

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="text-base font-semibold">Dimensions and formulas</h2>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Height</dt>
        <dd className="font-mono-nums text-right">
          {building.floors} × {building.floorHeightM} m = {heightM.toFixed(1)} m
        </dd>
        <dt className="text-muted-foreground">Floor area</dt>
        <dd className="font-mono-nums text-right">
          {building.widthM} × {building.depthM} m = {formatGrouped(areaM2, 2)} m²
        </dd>
        <dt className="text-muted-foreground">Floor weight</dt>
        <dd className="font-mono-nums text-right">W = (dead + ψ × live) × A</dd>
      </dl>
      <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Displacement</span> is sideways movement
          from the ground, in millimetres. Each line is one floor.
        </p>
        <p>
          <span className="font-medium text-foreground">Story drift</span> is the difference between
          one floor&apos;s peak and the floor below&apos;s, as a percentage of floor height. The
          difference is taken between the peaks, not instant by instant.
        </p>
        <p>
          <span className="font-medium text-foreground">Period</span> is the time for one full sway
          at the building&apos;s natural rhythm. A longer period is not by itself better or worse.
        </p>
      </div>
    </section>
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
