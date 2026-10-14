import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMm } from '@/lib/utils';
import { DRIFT_BANDS, driftBand } from '@/lib/driftScale';
import { useCssVars } from '@/lib/useCssVar';
import { useCompareStore } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Peak displacement by floor
   -------------------------------------------------------------------------
   Bar colour carries the story drift ratio through the magnitude-map scale.
   The number is always printed beside the bar, so the chart never relies on
   colour alone — which also means it still works for a colourblind reader and
   in greyscale print.

   The band thresholds live in lib/driftScale.ts, shared with the 3D view, so
   the legend can never disagree with the bars.
   ========================================================================= */

const M2S_TO_MM = 1000;

export function PeakByFloorChart() {
  const result = useConfigStore((s) => s.result);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const setActiveFloor = useConfigStore((s) => s.setActiveFloor);
  const resultB = useConfigStore((s) => s.resultB);
  const buildingB = useConfigStore((s) => s.compareBuilding);
  const comparing = useCompareStore((s) => s.enabled) && Boolean(resultB);

  const colors = useCssVars([
    '--drift-1',
    '--drift-2',
    '--drift-3',
    '--drift-4',
    '--drift-5',
    '--series-a',
    '--series-b',
    '--surface-2',
    '--border',
    '--text-muted',
    '--text',
  ]);

  /*
   * One row per floor, carrying a column for each building.
   *
   * The two buildings rarely have the same height, so the axis runs to the
   * taller of the two and the shorter one simply has no bar on its upper
   * floors. `null` rather than 0 there — a 0-length bar would claim "no
   * displacement" about a floor that does not exist.
   */
  const floorCount = comparing
    ? Math.max(result.peakDisp.length, buildingB.floors)
    : result.peakDisp.length;

  const data = Array.from({ length: floorCount }, (_, index) => {
    const floor = index + 1;
    const driftA = result.driftRatio[index] ?? 0;
    const driftB = resultB?.driftRatio[index] ?? 0;
    return {
      floor,
      mm: result.peakDisp[index] === undefined ? null : result.peakDisp[index] * M2S_TO_MM,
      mmB:
        comparing && resultB?.peakDisp[index] !== undefined
          ? resultB.peakDisp[index]! * M2S_TO_MM
          : null,
      drift: driftA,
      driftB,
    };
  });

  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      aria-labelledby="peak-heading"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="peak-heading" className="text-base font-semibold">
          Peak displacement by floor
        </h2>
        <span className="font-mono-nums text-xs text-muted-foreground">mm</span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
            barCategoryGap={4}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="floor"
              width={52}
              tickFormatter={(v: number) => `Floor ${v}`}
              stroke={colors['--text-muted']}
              fontSize={11}
              interval={0}
            />
            <RechartsTooltip
              cursor={{ fill: colors['--surface-2'] }}
              contentStyle={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: 12,
                color: 'var(--text)',
              }}
              formatter={(value, _name, item) => {
                const drift = (item?.payload as { drift?: number } | undefined)?.drift ?? 0;
                return [
                  `${formatMm(Number(value))} mm peak · ${(drift * 100).toFixed(2)} % drift`,
                  '',
                ];
              }}
              labelFormatter={(floor) => `Floor ${floor}`}
            />

            <Bar
              dataKey="mm"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              onClick={(entry: unknown) => {
                const payload = entry as { payload?: { floor?: number } };
                const floor = payload.payload?.floor;
                if (floor) setActiveFloor(floor === activeFloor ? null : floor);
              }}
            >
              {data.map((row) => (
                <Cell
                  key={row.floor}
                  fill={colors[driftBand(row.drift).token]}
                  stroke={activeFloor === row.floor ? colors['--text'] : 'transparent'}
                  strokeWidth={2}
                  cursor="pointer"
                />
              ))}
            </Bar>

            {/*
              Building B, only while comparing.

              Same click handler and same highlight as A, because "click a bar
              to highlight that floor" is one behaviour and it should not depend
              on which building the bar belongs to.
            */}
            {comparing ? (
              <Bar
                dataKey="mmB"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                onClick={(entry: unknown) => {
                  const payload = entry as { payload?: { floor?: number } };
                  const floor = payload.payload?.floor;
                  if (floor) setActiveFloor(floor === activeFloor ? null : floor);
                }}
              >
                {data.map((row) => (
                  <Cell
                    key={row.floor}
                    fill={colors[driftBand(row.driftB).token]}
                    stroke={activeFloor === row.floor ? colors['--text'] : 'transparent'}
                    strokeWidth={2}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DriftLegend colors={colors} />

      {/*
        The key says which column of bars is which building. Colour alone
        cannot do this job here — both buildings' bars are coloured by drift,
        on purpose, so that same-coloured floors have the same drift across
        the 3D view and this chart.
      */}
      {comparing ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: colors['--series-a'] }}
              aria-hidden="true"
            />
            Building A (left bar)
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: colors['--series-b'] }}
              aria-hidden="true"
            />
            Building B (right bar)
          </li>
        </ul>
      ) : null}

      <p className="mt-3 text-xs text-muted-foreground">
        Bar colour shows story drift. The number is printed beside every bar, so colour is never the
        only cue. Click a bar, or a floor in 3D, to highlight it.
        {comparing
          ? ' Both buildings are coloured on the same drift scale, so floors sharing a colour have the same drift.'
          : ''}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

function DriftLegend({ colors }: { colors: Record<string, string> }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Story drift
      </p>
      <div className="flex h-2 overflow-hidden rounded-full">
        {DRIFT_BANDS.map((band) => (
          <div
            key={band.token}
            style={{ backgroundColor: colors[band.token] }}
            className="flex-1"
            title={band.label}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}
