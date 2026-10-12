import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useCssVar } from '@/lib/useCssVar';
import { describeBuilding } from '@/lib/describeBuilding';
import { formatMm } from '@/lib/utils';
import { useCompareStore } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';
import type { SimulationResult } from '@/types';

/* =========================================================================
   A / B overlay chart
   -------------------------------------------------------------------------
   Both top floors plotted on one axis, in the fixed A/B series colours.

   Colours do not change with the theme: in a comparison, hue IS the identity
   of a series, so shifting it when someone toggles dark mode would be a lie
   about the data. The same reasoning applies to the legend — it is text, not
   colour alone.
   ========================================================================= */

const M2S_TO_MM = 1000;
const MAX_POINTS = 400;

export function ComparisonChart() {
  const resultA = useConfigStore((s) => s.result);
  const resultB = useConfigStore((s) => s.resultB);
  const buildingA = useConfigStore((s) => s.building);
  const buildingB = useConfigStore((s) => s.compareBuilding);
  const enabled = useCompareStore((s) => s.enabled);

  const colorA = useCssVar('--series-a');
  const colorB = useCssVar('--series-b');
  const gridColor = useCssVar('--border');
  const textMuted = useCssVar('--text-muted');

  if (!enabled || !resultB) return null;

  const data = overlaySeries(resultA, resultB, buildingA.floors, buildingB.floors);

  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      aria-labelledby="overlay-heading"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="overlay-heading" className="text-base font-semibold">
          Top-floor displacement over time
        </h2>
        <span className="font-mono-nums text-xs text-muted-foreground">mm</span>
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

            <Line
              type="monotone"
              dataKey="a"
              stroke={colorA}
              strokeWidth={2}
              dot={false}
              name="A"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="b"
              stroke={colorB}
              strokeWidth={2}
              dot={false}
              name="B"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: colorA }} />A —{' '}
          {describeBuilding(buildingA)}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: colorB }} />B —{' '}
          {describeBuilding(buildingB)}
        </li>
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Merge two results onto a shared time axis.
 *
 * The two runs always share a timestep and duration (they are solved from one
 * request with one motion), but this resamples defensively rather than
 * assuming index equality — an assumption that would silently plot garbage if
 * the durations ever diverged.
 */
function overlaySeries(a: SimulationResult, b: SimulationResult, topA: number, topB: number) {
  const seriesA = a.floorDisp[topA - 1] ?? [];
  const seriesB = b.floorDisp[topB - 1] ?? [];
  const total = Math.max(a.time.length, b.time.length);
  if (total === 0) return [];

  const stride = Math.max(1, Math.ceil(total / MAX_POINTS));

  const rows: Array<{ t: number; a: number; b: number }> = [];
  for (let i = 0; i < total; i += stride) {
    rows.push({
      t: a.time[Math.min(i, a.time.length - 1)] ?? 0,
      a: (seriesA[Math.min(i, seriesA.length - 1)] ?? 0) * M2S_TO_MM,
      b: (seriesB[Math.min(i, seriesB.length - 1)] ?? 0) * M2S_TO_MM,
    });
  }
  return rows;
}
