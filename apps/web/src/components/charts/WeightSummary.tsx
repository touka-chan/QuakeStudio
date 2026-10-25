import { Button } from '@/components/ui/button';
import { LOAD_ASSUMPTIONS } from '@/config/engineeringAssumptions';
import { normalizeFloorLoads, participationFor } from '@/config/floorLoads';
import { formatGrouped } from '@/lib/utils';
import { seriesColor } from '@/store/compareStore';
import { resolveNow } from '@/store/configStore';
import type { BuildingConfig, SimulationResult } from '@/types';

/* =========================================================================
   Floor weights
   -------------------------------------------------------------------------
   The eager half of the floor-loads answer: total weight, the counted-live
   share, and one stacked bar per floor. CSS bars, not Recharts, for the same
   reason the metric cards are eager — this block is the headline of the
   feature and must not wait on a chart chunk.

   A saved run from before floor loads has no `floorWeightsKN`. It says so.
   It does not divide a total of zero into a plausible-looking bar chart.
   ========================================================================= */

export function WeightSummary({
  building,
  result,
  side,
  showOwner = false,
}: {
  building: BuildingConfig;
  result: SimulationResult;
  side?: 'A' | 'B' | 'C' | 'D';
  /** Label the block with the building letter when more than one is on screen. */
  showOwner?: boolean;
}) {
  // Optional-chained because a result imported from before floor loads may
  // genuinely lack these fields, not merely hold empty arrays.
  const weights = result.floorWeightsKN ?? [];
  const livePerFloor = result.floorLiveCountedKN ?? [];
  const recorded = weights.length > 0 && result.totalWeightKN > 0;

  if (!recorded) {
    return (
      <section
        className="rounded-card border border-line bg-surface p-4"
        aria-labelledby="weight-heading"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="weight-heading" className="text-base font-semibold">
            Floor weights
          </h2>
          {showOwner && side ? (
            <span className="text-xs text-muted-foreground">Building {side}</span>
          ) : null}
        </div>
        <p className="mt-2 text-sm font-medium">Weights not recorded</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This run was saved before floor loads were added to QuakeStudio. No weight has been
          estimated for it. Re-running uses the all-Office loads this run was migrated to and
          replaces the saved response with a new one.
        </p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => resolveNow()}>
          Re-run with these loads
        </Button>
      </section>
    );
  }

  const loads = normalizeFloorLoads(building.floors, building.floorLoads);
  const floors = weights.length;
  const maxWeight = Math.max(...weights, 0);
  const totalLive = livePerFloor.reduce((sum, value) => sum + value, 0);
  const liveShare = result.totalWeightKN > 0 ? (totalLive / result.totalWeightKN) * 100 : 0;

  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      aria-labelledby="weight-heading"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="weight-heading" className="text-base font-semibold">
          Floor weights
        </h2>
        <span className="text-xs text-muted-foreground">
          {showOwner && side ? `Building ${side} · ` : ''}
          {floors} {floors === 1 ? 'floor' : 'floors'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-app bg-surface-2 px-3 py-2">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Total weight</p>
          <p className="font-mono-nums mt-0.5 text-lg font-semibold">
            {formatGrouped(result.totalWeightKN)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">kN</span>
          </p>
        </div>
        <div className="rounded-app bg-surface-2 px-3 py-2">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Counted live</p>
          <p className="font-mono-nums mt-0.5 text-lg font-semibold">
            {liveShare.toFixed(0)}
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">% of weight</span>
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Each floor weighs its dead load plus{' '}
        {/*
          The run's participation, not the catalogue default. A configuration
          may have raised ψ, and a caption that still said 25% would explain a
          number the engine did not use.
        */}
        {Math.round(participationFor(building) * 100)}% of its live load, times its area. A longer
        bar is a heavier floor.
      </p>

      <ul className="mt-3 space-y-1.5" aria-label="Weight of each floor, highest first">
        {Array.from({ length: floors }, (_, index) => floors - 1 - index).map((index) => {
          const dead = result.floorDeadKN?.[index] ?? 0;
          const live = livePerFloor[index] ?? 0;
          const weight = weights[index] ?? 0;
          const floor = index + 1;
          const use = loads[index]
            ? LOAD_ASSUMPTIONS.occupancies[loads[index]!.occupancy].label
            : 'Office';
          const fullWidth = maxWeight > 0 ? (weight / maxWeight) * 100 : 0;
          const deadShare = weight > 0 ? (dead / weight) * 100 : 0;
          const liveShareOfFloor = weight > 0 ? (live / weight) * 100 : 0;

          return (
            <li
              key={floor}
              className="flex items-center gap-2"
              aria-label={`Floor ${floor}, ${use}: ${formatGrouped(weight)} kilonewtons, ${liveShareOfFloor.toFixed(0)} percent counted live`}
            >
              <span className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">
                Floor {floor} · {use}
              </span>
              <span
                className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2"
                aria-hidden="true"
                title={`Dead ${formatGrouped(dead)} kN + counted live ${formatGrouped(live)} kN`}
              >
                <span className="flex h-full" style={{ width: `${fullWidth}%` }}>
                  <span
                    className="h-full"
                    style={{ width: `${deadShare}%`, backgroundColor: 'var(--load-dead)' }}
                  />
                  <span
                    className="h-full"
                    style={{ width: `${liveShareOfFloor}%`, backgroundColor: 'var(--load-live)' }}
                  />
                </span>
              </span>
              <span className="font-mono-nums w-16 shrink-0 text-right text-xs">
                {formatGrouped(weight)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: 'var(--load-dead)' }}
            aria-hidden="true"
          />
          Dead load
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: 'var(--load-live)' }}
            aria-hidden="true"
          />
          Counted live load
        </span>
        {showOwner && side ? (
          <span className="ml-auto flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: seriesColor(side) }}
              aria-hidden="true"
            />
            Building {side}
          </span>
        ) : null}
      </div>
    </section>
  );
}
