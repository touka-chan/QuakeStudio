import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEffect, useRef } from 'react';

import { sampleDisplacement } from '@/lib/time';
import { describeBuilding } from '@/lib/describeBuilding';
import { formatMm } from '@/lib/utils';
import { useCssVar } from '@/lib/useCssVar';
import { useConfigStore } from '@/store/configStore';
import { seriesColor, sideAt, sideIndex, useCompareStore } from '@/store/compareStore';
import { usePlaybackStore } from '@/store/playbackStore';
import type { BuildingConfig, SimulationResult } from '@/types';

/* =========================================================================
   Displacement over time
   -------------------------------------------------------------------------
   Plots the selected floor's displacement from `result.floorDisp` — the same
   array the 3D view samples. There is deliberately no second copy: if the
   animation and the chart could disagree, they eventually will.

   ONE LINE PER BUILDING IN PLAY
   It used to plot building A only, with a second card below it doing the
   A-against-B overlay. Two charts for one question meant scrolling to
   compare, and the overlay card could not show a selected floor at all.
   Plotting them all here means the comparison sits next to the 3D view it
   explains, and follows whatever floor is highlighted.

   FOUR LINES ON A PHONE IS BUSY, AND THAT IS FINE
   This chart is for the SHAPE of the response — which building sways more,
   and when. The numbers are in the table below, at full precision, with a
   scroll rather than a squeeze. Thinning this to fit would remove the only
   place the phase difference between four buildings is visible, so the lines
   stay and the legend carries the names.

   COLOUR IS NEVER THE ONLY CUE
   Every legend entry names its building and prints its letter, so the four
   lines are readable in greyscale, under a colour deficiency, and on a
   screen in sunlight. The dash patterns differ for the same reason: two solid
   lines in colours a reader cannot tell apart are one line.

   CURSOR PERFORMANCE: the playback cursor is an absolutely-positioned div
   moved with `transform`, driven from a requestAnimationFrame loop reading the
   playback store directly. A `<ReferenceLine>` bound to React state would
   re-render the whole Recharts tree on every animation frame.

   The ground-motion trace is scaled to fit and drawn dashed. It is a shape
   reference, not a measurement in millimetres, so it is never presented as a
   comparable quantity.
   ========================================================================= */

const M2S_TO_MM = 1000;
const MAX_POINTS = 400;

/**
 * Dash patterns, so the lines are separable without colour.
 *
 * Index 0 (building A) is solid because it is the one shown when nothing is
 * being compared, and changing its look would change the single-building
 * reading for no reason.
 */
const DASHES = [undefined, '6 3', '2 3', '8 3 2 3'] as const;

/** One building, and where its line comes from. */
type Series = {
  side: string;
  key: string;
  color: string;
  name: string;
  result: SimulationResult;
  floorIndex: number;
  /** False when this building is shorter than the floor on show. */
  hasFloor: boolean;
  floors: number;
};

export function DisplacementChart() {
  const resultA = useConfigStore((s) => s.result);
  const buildingA = useConfigStore((s) => s.building);
  const results = useConfigStore((s) => s.results);
  const compareBuildings = useConfigStore((s) => s.compareBuildings);
  const count = useCompareStore((s) => s.count);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const showGround = activeFloor === null;

  const groundColor = useCssVar('--series-ground');
  const gridColor = useCssVar('--border');
  const textMuted = useCssVar('--text-muted');
  const cursorColor = useCssVar('--series-cursor');

  /*
   * A floor above a building's roof has no value to plot; that series' gap
   * shows as a break rather than as a flat line along the axis.
   */
  const series: Series[] = [buildingA, ...compareBuildings.slice(0, count - 1)].map(
    (building, i) => {
      const result = i === 0 ? resultA : (results[i - 1] ?? resultA);
      const floorIndex = (activeFloor ?? building.floors) - 1;
      return {
        side: sideAt(i),
        key: `s${i}`,
        color: seriesColor(sideAt(i)),
        name: describeBuilding(building),
        result,
        floorIndex,
        hasFloor: floorIndex < building.floors,
        floors: building.floors,
      };
    },
  );

  const comparing = count > 1;
  const floorLabel = activeFloor ?? buildingA.floors;
  const data = buildChartData(series, showGround);

  // ---- Imperative playback cursor ----
  const plotAreaRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;

    const move = () => {
      const area = plotAreaRef.current;
      const cursor = cursorRef.current;
      if (!area || !cursor) return;

      const duration = useConfigStore.getState().motion.durationS;
      const time = usePlaybackStore.getState().time;
      const fraction = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;

      cursor.style.transform = `translateX(${fraction * area.clientWidth}px)`;
    };

    const tick = () => {
      move();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      aria-labelledby="displacement-heading"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="displacement-heading" className="text-base font-semibold">
          Displacement over time
        </h2>
        <span className="font-mono-nums text-xs text-muted-foreground">
          Floor {floorLabel} · mm
        </span>
      </div>

      <div className="relative h-56 w-full" ref={plotAreaRef}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid stroke={gridColor} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, 'dataMax']}
              tickFormatter={(v: number) => v.toFixed(0)}
              stroke={textMuted}
              fontSize={11}
              label={{
                value: 's',
                position: 'insideBottomRight',
                offset: -2,
                fill: textMuted,
                fontSize: 11,
              }}
            />
            <YAxis
              tickFormatter={(v: number) => v.toFixed(0)}
              stroke={textMuted}
              fontSize={11}
              width={44}
              label={{
                value: 'mm',
                angle: -90,
                position: 'insideLeft',
                fill: textMuted,
                fontSize: 11,
              }}
            />

            <RechartsTooltip
              contentStyle={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: 12,
                color: 'var(--text)',
              }}
              formatter={(value, name) => [formatMm(Number(value)), name]}
              labelFormatter={(t) => `t = ${Number(t).toFixed(2)} s`}
            />

            {showGround ? (
              <Line
                type="monotone"
                dataKey="ground"
                stroke={groundColor}
                strokeDasharray="4 3"
                strokeWidth={1.5}
                dot={false}
                name="Ground motion (scaled)"
                isAnimationActive={false}
              />
            ) : null}

            {series.map((s, i) =>
              s.hasFloor ? (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeDasharray={DASHES[i]}
                  strokeWidth={2}
                  dot={false}
                  name={`${s.side} · ${s.name} · Floor ${floorLabel}`}
                  isAnimationActive={false}
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>

        {/* Playback cursor. Moves via transform, never a React re-render. */}
        <div
          ref={cursorRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 h-full w-0.5"
          style={{ backgroundColor: cursorColor, willChange: 'transform' }}
        />
      </div>

      <TimeReadout />

      {/*
        The legend is the only thing separating four lines, so it names each
        one. A swatch alone would leave a reader guessing which of four
        similar curves belongs to the building they just edited.
      */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className={`h-0.5 w-4 rounded ${s.hasFloor ? '' : 'opacity-40'}`}
              style={{
                backgroundColor: s.color,
                ...(DASHES[i]
                  ? {
                      backgroundImage: `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)`,
                      backgroundColor: 'transparent',
                    }
                  : {}),
              }}
            />
            {comparing ? `${s.side} · ` : ''}
            Floor {floorLabel} displacement
            {s.hasFloor ? null : (
              // True, not a silent gap: a reader must know the line is missing
              // because the building has no floor there, not because it stood
              // perfectly still.
              <span>
                {' '}
                — {s.side} is only {s.floors} storeys
              </span>
            )}
          </li>
        ))}
        {showGround ? (
          <li className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 rounded"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, ${groundColor} 0 3px, transparent 3px 6px)`,
              }}
            />
            Ground motion (scaled, not in mm)
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

/** The "now" readout. One of the few places that re-renders on the clock. */
function TimeReadout() {
  const time = usePlaybackStore((s) => s.time);
  const resultA = useConfigStore((s) => s.result);
  const results = useConfigStore((s) => s.results);
  const buildingA = useConfigStore((s) => s.building);
  const compareBuildings = useConfigStore((s) => s.compareBuildings);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const editing = useCompareStore((s) => s.editing);
  const count = useCompareStore((s) => s.count);

  /*
   * Follows the selected building, like the metric cards above it.
   *
   * A "Now: 42 mm" readout sitting under a chart about four buildings, while the
   * cards show a different one, is the sort of quiet inconsistency that makes
   * a tool feel broken in a way nobody can point at.
   */
  const i = count > 1 ? sideIndex(editing) : 0;
  const result = i === 0 ? resultA : (results[i - 1] ?? resultA);
  const building: BuildingConfig = i === 0 ? buildingA : (compareBuildings[i - 1] ?? buildingA);
  const floorIndex = (activeFloor ?? building.floors) - 1;
  // Same interpolating sampler the 3D view uses, so the two readouts agree.
  const value = sampleDisplacement(result.floorDisp, result.time, floorIndex, time);
  const side = sideAt(i);

  return (
    <p className="mt-2 font-mono-nums text-xs text-muted-foreground">
      Now: <span className="text-foreground">{time.toFixed(1)} s</span> ·{' '}
      {/*
        Building A reads "Now: 1.2 s · 42 mm" with nothing added. With several
        in play the owner has to be named, or the number belongs to nobody.
      */}
      {count > 1 ? (
        <>
          <span className="text-foreground">{side}</span> at{' '}
        </>
      ) : null}
      <span className="text-foreground">{formatMm(value * M2S_TO_MM)} mm</span>
    </p>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Downsample before plotting. A 60 s run at dt = 0.01 is 6,000 points; a chart
 * that has to react to a slider must not render all of them per frame.
 */
function buildChartData(
  series: Series[],
  includeGround: boolean,
): Array<Record<string, number | null>> {
  const first = series[0];
  if (!first) return [];
  const total = first.result.time.length;
  if (total === 0) return [];
  const stride = Math.max(1, Math.ceil(total / MAX_POINTS));

  const rows: Array<Record<string, number | null>> = [];
  for (let i = 0; i < total; i += stride) {
    const row: Record<string, number | null> = {
      t: first.result.time[i]!,
      ground: includeGround ? first.result.groundAccel[i]! * 40 : 0,
    };
    for (const s of series) {
      /*
       * `null` rather than 0 for a missing point.
       *
       * A building shorter than the selected floor has no value there, and
       * plotting 0 would draw a flat line along the axis reading "it did not
       * move" — which is a measurement claim about a building that has no floor
       * there at all. Recharts leaves a gap for null.
       */
      const values = s.hasFloor ? (s.result.floorDisp[s.floorIndex] ?? []) : [];
      row[s.key] = values.length === 0 ? null : (values[i] ?? null) * M2S_TO_MM;
    }
    rows.push(row);
  }
  return rows;
}
