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
import { formatMm } from '@/lib/utils';
import { useCssVar } from '@/lib/useCssVar';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';
import type { SimulationResult } from '@/types';

/* =========================================================================
   Displacement over time
   -------------------------------------------------------------------------
   Plots the selected floor's displacement from `result.floorDisp` — the same
   array the 3D view samples. There is deliberately no second copy: if the
   animation and the chart could disagree, they eventually will.

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

export function DisplacementChart() {
  const result = useConfigStore((s) => s.result);
  const building = useConfigStore((s) => s.building);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const showGround = activeFloor === null;

  const seriesColor = useCssVar('--series-a');
  const groundColor = useCssVar('--series-ground');
  const gridColor = useCssVar('--border');
  const textMuted = useCssVar('--text-muted');
  const cursorColor = useCssVar('--series-cursor');

  const floorIndex = (activeFloor ?? building.floors) - 1;
  const floorLabel = activeFloor ?? building.floors;

  const data = buildChartData(result, floorIndex, showGround);

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

            <Line
              type="monotone"
              dataKey="floor"
              stroke={seriesColor}
              strokeWidth={2}
              dot={false}
              name={`Floor ${floorLabel}`}
              isAnimationActive={false}
            />
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

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: seriesColor }} />
          Floor {floorLabel} displacement
        </li>
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
  const result = useConfigStore((s) => s.result);
  const building = useConfigStore((s) => s.building);
  const activeFloor = useConfigStore((s) => s.activeFloor);

  const floorIndex = (activeFloor ?? building.floors) - 1;
  // Same interpolating sampler the 3D view uses, so the two readouts agree.
  const value = sampleDisplacement(result.floorDisp, result.time, floorIndex, time);

  return (
    <p className="mt-2 font-mono-nums text-xs text-muted-foreground">
      Now: <span className="text-foreground">{time.toFixed(1)} s</span> ·{' '}
      <span className="text-foreground">{formatMm(value * M2S_TO_MM)} mm</span>
    </p>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Downsample before plotting. A 60 s run at dt = 0.01 is 6,000 points; a chart
 * that has to react to a slider must not render all of them per frame.
 */
function buildChartData(result: SimulationResult, floorIndex: number, includeGround: boolean) {
  const total = result.time.length;
  if (total === 0) return [];
  const stride = Math.max(1, Math.ceil(total / MAX_POINTS));
  const series = result.floorDisp[floorIndex] ?? [];

  const rows: Array<{ t: number; floor: number; ground: number }> = [];
  for (let i = 0; i < total; i += stride) {
    rows.push({
      t: result.time[i]!,
      floor: (series[i] ?? 0) * M2S_TO_MM,
      ground: includeGround ? result.groundAccel[i]! * 40 : 0,
    });
  }
  return rows;
}
