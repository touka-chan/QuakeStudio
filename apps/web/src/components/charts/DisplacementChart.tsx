import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useCssVar } from '@/lib/useCssVar';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { formatMm } from '@/lib/utils';

/* =========================================================================
   Displacement over time
   -------------------------------------------------------------------------
   Plots the selected floor's displacement from `result.floorDisp`, the same
   array the 3D view reads. There is deliberately no second copy: if the
   animation and the chart could disagree, they eventually will.

   The ground-motion line is scaled to fit the same axis. It is a shape
   reference, not a measurement in millimetres, so it is dashed and labelled
   as scaled — never presented as a comparable quantity.
   ========================================================================= */

const M2S_TO_MM = 1000;

/** Recharts hands us the x value from the axis; snap to the nearest sample. */
function nearestIndex(time: number[], target: number): number {
  let low = 0;
  let high = time.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (time[mid]! < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function DisplacementChart() {
  const result = useConfigStore((s) => s.result);
  const building = useConfigStore((s) => s.building);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const playbackTime = usePlaybackStore((s) => s.time);

  const seriesColor = useCssVar('--series-a');
  const groundColor = useCssVar('--series-ground');
  const gridColor = useCssVar('--border');
  const textMuted = useCssVar('--text-muted');
  const cursorColor = useCssVar('--series-cursor');

  const floorIndex = (activeFloor ?? building.floors) - 1;
  const floorLabel = activeFloor ?? building.floors;

  const data = buildChartData(result, floorIndex, activeFloor !== null);
  const currentValue = result.floorDisp[floorIndex]?.[nearestIndex(result.time, playbackTime)] ?? 0;

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
          Floor {floorLabel} · {seriesColor ? 'mm' : ''}
        </span>
      </div>

      <div className="h-56 w-full">
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

            <ReferenceLine x={playbackTime} stroke={cursorColor} strokeWidth={2} />

            {activeFloor === null ? (
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
      </div>

      <p className="mt-2 font-mono-nums text-xs text-muted-foreground">
        Now: <span className="text-foreground">{playbackTime.toFixed(1)} s</span> ·{' '}
        {formatMm(currentValue * M2S_TO_MM)} mm
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Downsample before plotting. A 60 s run at dt=0.01 is 6000 points; a chart
 * that reacts to a slider must not try to render all of them per frame.
 */
const MAX_POINTS = 400;

function buildChartData(
  result: ReturnType<typeof useConfigStore.getState>['result'],
  floorIndex: number,
  includeGround: boolean,
) {
  const total = result.time.length;
  const stride = Math.max(1, Math.ceil(total / MAX_POINTS));
  const series = result.floorDisp[floorIndex] ?? [];

  const rows: Array<{ t: number; floor: number; ground: number }> = [];
  for (let i = 0; i < total; i += stride) {
    rows.push({
      t: result.time[i]!,
      floor: (series[i] ?? 0) * M2S_TO_MM,
      // Scaled to roughly the same amplitude so the shape is comparable.
      ground: includeGround ? result.groundAccel[i]! * 40 : 0,
    });
  }
  return rows;
}
