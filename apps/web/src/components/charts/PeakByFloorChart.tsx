import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMm } from '@/lib/utils';
import { describeBuilding } from '@/lib/describeBuilding';
import { DRIFT_BANDS, driftBand } from '@/lib/driftScale';
import { useCssVars } from '@/lib/useCssVar';
import { seriesColor, sideAt, useCompareStore } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Peak displacement by floor
   -------------------------------------------------------------------------
   Bar colour carries the story drift ratio through the magnitude-map scale.
   The number is always printed beside the bar, so the chart never relies on
   colour alone — which also means it still works for a colourblind reader and
   in greyscale print.

   ONE BAR PER BUILDING PER FLOOR
   Two buildings were two named columns. Four are four generated ones, keyed by
   index, so a building is identified by the slot it occupies rather than by a
   hard-wired letter.

   WHICH BAR IS WHICH BUILDING IS NOT CARRIED BY COLOUR HERE, AND CANNOT BE
   Every building's bars are coloured by DRIFT, on purpose, so that a floor
   sharing a colour in the 3D view shares it here too. The series colour is
   therefore not on the bar at all — it is in the key underneath, which names
   each building and says whether it is the 1st, 2nd, 3rd or 4th bar in the
   row. An earlier version used the series colour in that key next to bars
   that were not that colour, which taught a reader a false association.

   The band thresholds live in lib/driftScale.ts, shared with the 3D view, so
   the legend can never disagree with the bars.
   ========================================================================= */

const M2S_TO_MM = 1000;

export function PeakByFloorChart() {
  const resultA = useConfigStore((s) => s.result);
  const buildingA = useConfigStore((s) => s.building);
  const results = useConfigStore((s) => s.results);
  const compareBuildings = useConfigStore((s) => s.compareBuildings);
  const count = useCompareStore((s) => s.count);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const setActiveFloor = useConfigStore((s) => s.setActiveFloor);

  const colors = useCssVars([
    '--drift-1',
    '--drift-2',
    '--drift-3',
    '--drift-4',
    '--drift-5',
    '--surface-2',
    '--border',
    '--text-muted',
    '--text',
  ]);

  const series = [buildingA, ...compareBuildings.slice(0, count - 1)].map((building, i) => ({
    side: sideAt(i),
    /** Bar value for this building on each floor row. */
    mmKey: `mm${i}`,
    /** Story drift for this building on each floor row, for the bar colour. */
    driftKey: `drift${i}`,
    building,
    result: i === 0 ? resultA : (results[i - 1] ?? resultA),
  }));

  const comparing = count > 1;

  /*
   * One row per floor, carrying a column for each building.
   *
   * The buildings rarely have the same height, so the axis runs to the tallest
   * and a shorter one simply has no bar on its upper floors. `null` rather than
   * 0 there — a 0-length bar would claim "no displacement" about a floor that
   * does not exist.
   */
  const floorCount = series.reduce(
    (max, s) => Math.max(max, s.result.peakDisp.length, s.building.floors),
    0,
  );

  const data = Array.from({ length: floorCount }, (_, index) => {
    const row: Record<string, number | null> & { floor: number } = { floor: index + 1 };
    for (const s of series) {
      row[s.driftKey] = s.result.driftRatio[index] ?? 0;
      row[s.mmKey] =
        s.result.peakDisp[index] === undefined ? null : s.result.peakDisp[index] * M2S_TO_MM;
    }
    return row;
  });

  /*
   * Height follows the floor count AND the number of bars in each row.
   *
   * It was a fixed `h-64`, which was fine for five floors and wrong for
   * twenty: 20 floors in 256px is under 13px a row, so the "Floor N" labels
   * printed on top of each other and the chart became unreadable exactly when
   * it had the most to say. Comparing made it worse, because buildings can be
   * twenty storeys apart from one another.
   *
   * Capped rather than left to run away: four buildings over twenty storeys is
   * eighty bars, and a chart taller than the window cannot be read either. Past
   * the cap the bars thin out and the numbers stay printed, which is the cue
   * that saves it.
   */
  const rowHeight = series.length * 12 + 12;
  const chartHeight = Math.min(640, Math.max(256, data.length * rowHeight));

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

      <div className="w-full" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 56, bottom: 0, left: 0 }}
            barCategoryGap={4}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="floor"
              width={64}
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
              formatter={(value, name, item) => {
                const payload = item?.payload as Record<string, number | null> | undefined;
                /*
                 * Read the drift for the SAME building the value came from.
                 * Reading `drift` — building A's — would attach A's drift to B's
                 * millimetres, which is the kind of pairing that is only wrong
                 * on the second building and so survives casual testing.
                 */
                const side = String(name).slice(0, 1);
                const index = series.findIndex((s) => s.side === side);
                const drift = payload?.[series[index]?.driftKey ?? 'drift0'] ?? 0;
                return [
                  `${formatMm(Number(value))} mm peak · ${(drift * 100).toFixed(2)} % drift`,
                  '',
                ];
              }}
              labelFormatter={(floor) => `Floor ${floor}`}
            />

            {series.map((s) => (
              /*
                One behaviour for every bar. "Click a bar to highlight that
                floor" is a single rule and should not depend on which building
                the bar belongs to.
              */
              <Bar
                key={s.mmKey}
                dataKey={s.mmKey}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                stackId={undefined}
                onClick={(entry: unknown) => {
                  const payload = entry as { payload?: { floor?: number } };
                  const floor = payload.payload?.floor;
                  if (floor) setActiveFloor(floor === activeFloor ? null : floor);
                }}
              >
                {data.map((row) => (
                  <Cell
                    key={`${s.side}-${row.floor}`}
                    fill={colors[driftBand(row[s.driftKey] ?? 0).token]}
                    stroke={activeFloor === row.floor ? colors['--text'] : 'transparent'}
                    strokeWidth={2}
                    cursor="pointer"
                  />
                ))}
                <LabelList
                  dataKey={s.mmKey}
                  position="right"
                  offset={6}
                  fontSize={10}
                  formatter={(v) => (v === null || v === undefined ? '' : formatMm(Number(v)))}
                  fill={colors['--text-muted']}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DriftLegend colors={colors} />

      {/*
        The key says which bar of each group is which building. Ordinals, not a
        colour swatch: the bars are coloured by drift, not by building, and a
        swatch in the series colour sitting next to them would be a claim about
        the bars that is not true.
      */}
      {comparing ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((s, i) => (
            <li key={s.side} className="flex items-center gap-1.5">
              <span
                className="grid size-4 place-items-center rounded text-[10px] font-semibold text-white"
                style={{ backgroundColor: seriesColor(s.side) }}
                aria-hidden="true"
              >
                {s.side}
              </span>
              {s.side} · {describeBuilding(s.building)} ({ordinal(i)} bar
              {series.length > 1 ? '' : ''})
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-xs text-muted-foreground">
        Bar colour shows story drift. The peak in millimetres is printed beside every bar, so colour
        is never the only cue. Click a bar, or a floor in 3D, to highlight it.
        {comparing
          ? ` All ${series.length} buildings are coloured on the same drift scale, so floors sharing a colour have the same drift.`
          : ''}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

/** "1st", "2nd", "3rd", "4th". Small list; a lookup beats a grammar library. */
const ORDINALS = ['1st', '2nd', '3rd', '4th'];
function ordinal(index: number): string {
  return ORDINALS[index] ?? `${index + 1}th`;
}

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
