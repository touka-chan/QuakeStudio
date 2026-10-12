import { formatMm, formatPct } from '@/lib/utils';
import { describeBuilding } from '@/lib/describeBuilding';
import { useCssVar } from '@/lib/useCssVar';
import { useCompareStore } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Comparison table
   -------------------------------------------------------------------------
   A · B · CHANGE, as the brief asks. The "change" column is the difference as
   a percentage of A, which is the only way to compare a millimetre figure with
   a time figure meaningfully.

   Two honesty rules this table has to obey:
     • The colours are the fixed A/B series colours, used in BOTH themes, so a
       row does not change meaning when someone switches theme.
     • The change column says which direction it moved. "−64 %" means B sways
       less. Nothing here says which building is better — that would be a
       verdict the tool is not entitled to.
   ========================================================================= */

const M2S_TO_MM = 1000;

type Row = {
  label: string;
  a: string;
  b: string;
  /** Percentage change from A to B, or null when it cannot be computed. */
  changePct: number | null;
  /** Raw values, for computing the percentage. */
  aRaw: number;
  bRaw: number;
};

export function ComparisonTable() {
  const resultA = useConfigStore((s) => s.result);
  const resultB = useConfigStore((s) => s.resultB);
  const buildingA = useConfigStore((s) => s.building);
  const buildingB = useConfigStore((s) => s.compareBuilding);
  const compareEnabled = useCompareStore((s) => s.enabled);

  const colorA = useCssVar('--series-a');
  const colorB = useCssVar('--series-b');

  if (!compareEnabled || !resultB) {
    return (
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Comparison</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Switch on comparison to build a second configuration and run both under the same
          earthquake.
        </p>
      </section>
    );
  }

  const topA = buildingA.floors;
  const topB = buildingB.floors;

  const rows: Row[] = [
    row('Floors', String(topA), String(topB), null, topA, topB),
    row('Height', `${(topA * buildingA.floorHeightM).toFixed(1)} m`, `${(topB * buildingB.floorHeightM).toFixed(1)} m`, null, topA * buildingA.floorHeightM, topB * buildingB.floorHeightM),
    row('Material', buildingA.material, buildingB.material, null, 0, 0),
    row('Frame type', buildingA.frameType, buildingB.frameType, null, 0, 0),
    row(
      'Peak displacement',
      formatMm(resultA.peakDisp[topA - 1]! * M2S_TO_MM),
      formatMm(resultB.peakDisp[topB - 1]! * M2S_TO_MM),
      pct(resultA.peakDisp[topA - 1]!, resultB.peakDisp[topB - 1]!),
      resultA.peakDisp[topA - 1]!,
      resultB.peakDisp[topB - 1]!,
    ),
    row(
      'Max story drift',
      `${formatPct(resultA.maxDriftRatio * 100)} %`,
      `${formatPct(resultB.maxDriftRatio * 100)} %`,
      pct(resultA.maxDriftRatio, resultB.maxDriftRatio),
      resultA.maxDriftRatio,
      resultB.maxDriftRatio,
    ),
    row(
      'Natural period',
      `${resultA.periodsS[0]?.toFixed(2) ?? '—'} s`,
      `${resultB.periodsS[0]?.toFixed(2) ?? '—'} s`,
      pct(resultA.periodsS[0] ?? 0, resultB.periodsS[0] ?? 0),
      resultA.periodsS[0] ?? 0,
      resultB.periodsS[0] ?? 0,
    ),
    row(
      '2nd mode period',
      `${resultA.periodsS[1]?.toFixed(2) ?? '—'} s`,
      `${resultB.periodsS[1]?.toFixed(2) ?? '—'} s`,
      pct(resultA.periodsS[1] ?? 0, resultB.periodsS[1] ?? 0),
      resultA.periodsS[1] ?? 0,
      resultB.periodsS[1] ?? 0,
    ),
  ];

  return (
    <section className="rounded-card border border-line bg-surface p-4" aria-labelledby="compare-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="compare-heading" className="text-base font-semibold">
          Results
        </h2>
        <p className="font-mono-nums text-xs text-muted-foreground">B compared with A</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                Measure
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <Badge color={colorA}>A</Badge>
                  {describeBuilding(buildingA)}
                </span>
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <Badge color={colorB}>B</Badge>
                  {describeBuilding(buildingB)}
                </span>
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Change
              </th>
            </tr>
          </thead>
          <tbody className="font-mono-nums">
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-sans font-normal">
                  {row.label}
                </th>
                <td className="py-2 pr-3 text-right">{row.a}</td>
                <td className="py-2 pr-3 text-right">{row.b}</td>
                <td className="py-2 text-right">
                  <ChangeCell pct={row.changePct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Both buildings felt the identical earthquake — strength {useConfigStore.getState().motion.pgaG} g
        for {useConfigStore.getState().motion.durationS} s. Any difference comes from the
        buildings, not the shaking.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

function row(
  label: string,
  a: string,
  b: string,
  changePct: number | null,
  aRaw: number,
  bRaw: number,
): Row {
  return { label, a, b, changePct, aRaw, bRaw };
}

function pct(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

/**
 * The change cell.
 *
 * Direction is carried by an arrow as well as a sign, so the meaning does not
 * depend on colour or on reading a minus sign. Neutral grey when the two are
 * equal — highlighting "no difference" would be misleading emphasis.
 */
function ChangeCell({ pct: value }: { pct: number | null }) {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (Math.abs(value) < 0.5) {
    return <span className="text-muted-foreground">same</span>;
  }

  const increased = value > 0;
  const sign = increased ? '+' : '−'; // U+2212, not a hyphen

  // One element, not three: a screen reader should hear "+50 %" as a phrase,
  // not three disconnected fragments.
  return (
    <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
      <span aria-hidden="true">{increased ? '▲' : '▼'}</span>
      <span>
        {sign}
        {Math.abs(value).toFixed(0)} %
      </span>
    </span>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="grid size-4 place-items-center rounded text-[10px] font-semibold text-white"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}