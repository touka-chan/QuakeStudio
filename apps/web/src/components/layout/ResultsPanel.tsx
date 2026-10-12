import { Columns2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DisplacementChart } from '@/components/charts/DisplacementChart';
import { MetricCard } from '@/components/charts/MetricCard';
import { PeakByFloorChart } from '@/components/charts/PeakByFloorChart';
import { formatMm, formatPct } from '@/lib/utils';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Results panel — the right zone.
   -------------------------------------------------------------------------
   Metric cards, then the two charts, then the compare call-to-action.

   These numbers come from MOCK data in Phase 1. The panel says so, once, near
   the top — a student should never mistake placeholder output for a result.
   ========================================================================= */

const M2S_TO_MM = 1000;

export function ResultsPanel() {
  const result = useConfigStore((s) => s.result);
  const building = useConfigStore((s) => s.building);
  const status = useConfigStore((s) => s.status);

  const topFloor = building.floors;
  const peakAtTop = result.peakDisp[topFloor - 1] ?? 0;
  const driftPct = result.maxDriftRatio * 100;
  const period = result.periodsS[0] ?? 0;
  const worstStory = result.driftRatio.indexOf(result.maxDriftRatio) + 1;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Results</h2>
          {status === 'computing' ? (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Updating…
            </span>
          ) : null}
        </header>

        <p className="rounded-app border border-dashed border-accent-yellow/50 bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-accent-yellow-text">Preview numbers.</span> The
          simulation engine arrives in Phase 2 — these are mock values shaped like the real output
          so the layout can be reviewed.
        </p>

        {/* ---- Metric cards ---- */}
        <div className="grid grid-cols-3 gap-2">
          <MetricCard
            label="Peak displacement"
            value={formatMm(peakAtTop * M2S_TO_MM)}
            unit="mm"
            detail={`Floor ${topFloor}, relative to ground`}
            help="The furthest any floor moved sideways, measured from the ground beneath it."
          />
          <MetricCard
            label="Max story drift"
            value={formatPct(driftPct)}
            unit="%"
            detail={`Story ${worstStory}`}
            tone="caution"
            help="The biggest gap between one floor and the floor below it, as a percentage of floor height."
          />
          <MetricCard
            label="Natural period"
            value={period.toFixed(2)}
            unit="s"
            detail="1st mode"
            help="How long the building takes to sway back and forth once, at its natural rhythm."
          />
        </div>

        <DisplacementChart />
        <PeakByFloorChart />

        <Button className="h-11 w-full" disabled>
          <Columns2 aria-hidden="true" />
          Compare with another building
        </Button>
        <p className="-mt-2 text-center text-xs text-muted-foreground">
          Comparison arrives in Phase 4 — run two configurations under the same shaking.
        </p>
      </div>
    </ScrollArea>
  );
}
