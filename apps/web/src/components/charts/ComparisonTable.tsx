import { formatGrouped, formatMm, formatPct } from '@/lib/utils';
import { describeBuilding } from '@/lib/describeBuilding';
import { seriesColor, useCompareStore, type CompareSide } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';
import type { BuildingConfig, SimulationResult } from '@/types';

/* =========================================================================
   Comparison table
   -------------------------------------------------------------------------
   One column per building, a change column measured against A.

   THE BASELINE IS A AND DOES NOT MOVE
   The change is always "this building compared with A". Making it follow the
   selection would give a number whose meaning depends on what else is on
   screen — B +50 % with two buildings is a different statement from B +50 %
   with four — and a student reading last week's notes would have no way to
   tell which of the two they were looking at. A is also the primary building
   everywhere else in the app, so the reference never disagrees with itself.

   WHAT ONE COLUMN IS
   A building and the result solved for it. The two come from the same index
   in the same array, so a column cannot show a name from one building and a
   number from another.

   Two honesty rules this table has to obey:
     • The colours are the building series colours, used in BOTH themes, so a
       row does not change meaning when someone switches theme.
     • The change column says which direction it moved. "+50 %" means this
       building sways more than A. Nothing here says which building is better
       — that would be a verdict the tool is not entitled to.
   ========================================================================= */

const M2S_TO_MM = 1000;

/** Everything a measure needs to render one cell. */
type Subject = {
  building: BuildingConfig;
  result: SimulationResult;
  /** `floors`, kept here so the measures do not all reach for it. */
  top: number;
};

type Measure = {
  label: string;
  /** The printed value for one building. */
  cell: (s: Subject) => string;
  /**
   * The same thing as a number, for the change column.
   *
   * null when the measure has no meaningful scale — floors is a count and
   * material is a name, so a percentage change against them would be nonsense
   * dressed up as a figure.
   */
  raw: (s: Subject) => number | null;
};

const MEASURES: Measure[] = [
  {
    label: 'Floors',
    cell: (s) => String(s.top),
    raw: () => null,
  },
  {
    label: 'Height',
    cell: (s) => `${(s.top * s.building.floorHeightM).toFixed(1)} m`,
    raw: (s) => s.top * s.building.floorHeightM,
  },
  {
    label: 'Total weight',
    /*
     * A saved run from before floor loads has no weight. Saying "not recorded"
     * beside buildings that do have one is the honest comparison; inventing a
     * weight from the current config would compare a measured building with a
     * hypothetical one and label both as results.
     */
    cell: (s) =>
      recorded(s.result) ? `${formatGrouped(s.result.totalWeightKN)} kN` : 'not recorded',
    raw: (s) => (recorded(s.result) ? s.result.totalWeightKN : null),
  },
  {
    label: 'Counted live share',
    cell: (s) => {
      if (!recorded(s.result)) return 'not recorded';
      const live = (s.result.floorLiveCountedKN ?? []).reduce((sum, value) => sum + value, 0);
      const share = s.result.totalWeightKN > 0 ? (live / s.result.totalWeightKN) * 100 : 0;
      return `${share.toFixed(0)} %`;
    },
    // A change of a share against another share is not a percentage change
    // with a useful meaning, so this row deliberately has no comparison.
    raw: () => null,
  },
  {
    label: 'Total mass',
    cell: (s) => {
      if (!recorded(s.result)) return 'not recorded';
      const kg = (s.result.floorMassesKg ?? []).reduce((sum, value) => sum + value, 0);
      return `${formatGrouped(kg / 1000)} t`;
    },
    raw: (s) => {
      if (!recorded(s.result)) return null;
      return (s.result.floorMassesKg ?? []).reduce((sum, value) => sum + value, 0) / 1000;
    },
  },
  {
    label: 'Material',
    cell: (s) => s.building.material,
    raw: () => null,
  },
  {
    label: 'Frame type',
    cell: (s) => s.building.frameType,
    raw: () => null,
  },
  {
    label: 'Peak displacement',
    cell: (s) => formatMm((s.result.peakDisp[s.top - 1] ?? 0) * M2S_TO_MM),
    raw: (s) => s.result.peakDisp[s.top - 1] ?? null,
  },
  {
    label: 'Max story drift',
    cell: (s) => `${formatPct(s.result.maxDriftRatio * 100)} %`,
    raw: (s) => s.result.maxDriftRatio,
  },
  {
    label: 'Natural period',
    cell: (s) => `${s.result.periodsS[0]?.toFixed(2) ?? '—'} s`,
    raw: (s) => s.result.periodsS[0] ?? null,
  },
  {
    label: '2nd mode period',
    cell: (s) => `${s.result.periodsS[1]?.toFixed(2) ?? '—'} s`,
    raw: (s) => s.result.periodsS[1] ?? null,
  },
];

export function ComparisonTable() {
  const count = useCompareStore((s) => s.count);
  const compareEnabled = count > 1;

  const buildingA = useConfigStore((s) => s.building);
  const compareBuildings = useConfigStore((s) => s.compareBuildings);
  const resultA = useConfigStore((s) => s.result);
  const results = useConfigStore((s) => s.results);
  const motion = useConfigStore((s) => s.motion);

  if (!compareEnabled) {
    return (
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Comparison</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Switch on comparison to build a second configuration and run it under the same earthquake.
        </p>
      </section>
    );
  }

  /*
   * One entry per building in play.
   *
   * Sliced rather than mapped over a fixed four: a building left over from a
   * longer comparison, or a result that has not come back yet, must not put an
   * empty column on screen pretending to be a measurement.
   */
  const subjects: Subject[] = [buildingA, ...compareBuildings.slice(0, count - 1)].map(
    (building, i) => ({
      building,
      result: i === 0 ? resultA : (results[i - 1] ?? resultA),
      top: building.floors,
    }),
  );

  const sides: CompareSide[] = subjects.map((_, i) => 'ABCD'[i] as CompareSide);

  const rows = MEASURES.map((measure) => {
    const a = measure.raw(subjects[0]!);
    return {
      label: measure.label,
      cells: subjects.map((s) => measure.cell(s)),
      /*
       * ONE change column, holding one figure per building after A.
       *
       * The first version emitted a cell per building, which put an em-dash
       * under A's own column and made the table a column wider than its header
       * described — a mismatch that also pushed the table past the width of
       * the results column at every desktop size.
       *
       * A gets no entry. A change of zero against itself is true and useless,
       * and printing it would imply that A is a comparison.
       */
      changes: subjects.slice(1).map((s, i) => ({
        side: sides[i + 1]!,
        pct: pct(a, measure.raw(s)),
      })),
    };
  });

  const others = subjects.length - 1;

  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      aria-labelledby="compare-heading"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="compare-heading" className="text-base font-semibold">
          Comparison
        </h2>
        <p className="font-mono-nums text-xs text-muted-foreground">
          {others === 1 ? 'B compared with A' : `Each of B, C and D compared with A`}
        </p>
      </div>

      {/*
        Horizontal scroll, and it is the honest answer rather than a fudge.

        Six columns will not fit a phone at a readable size, and shrinking the
        type to make them fit is the version where the numbers stop being
        legible — which defeats the table. Scrolling keeps them at full size,
        and the first two columns stay put in view for the whole scroll.
      */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted-foreground">
              <th scope="col" className="sticky left-0 bg-surface py-2 pr-3 font-medium">
                Measure
              </th>
              {sides.map((side, i) => (
                <th key={side} scope="col" className="py-2 pr-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Badge color={seriesColor(side)}>{side}</Badge>
                    {describeBuilding(subjects[i]!.building)}
                  </span>
                </th>
              ))}
              <th scope="col" className="py-2 text-right font-medium">
                vs A
              </th>
            </tr>
          </thead>
          <tbody className="font-mono-nums">
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 bg-surface py-2 pr-3 text-left font-sans font-normal"
                >
                  {row.label}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={sides[i]} className="py-2 pr-3 text-right">
                    {cell}
                  </td>
                ))}
                <td className="py-2 text-right">
                  {/*
                    One cell, one figure per building after A, each labelled
                    with its letter. Stacked rather than side by side: at four
                    buildings three columns of changes would be a third of the
                    table spent on differences, and the letter beside each
                    figure is what keeps a reader from pairing the wrong change
                    with the wrong building.
                  */}
                  {row.changes.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="flex flex-col items-end gap-0.5">
                      {row.changes.map((change) => (
                        <ChangeCell key={change.side} pct={change.pct} side={change.side} />
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {/*
          This sentence is the reason the table means anything, so it is
          generated from the actual count rather than left saying "both".
          "Both buildings" under four columns was a caption that was quietly
          wrong, which is worse than no caption.
        */}
        All {subjects.length} buildings felt the identical earthquake — strength {motion.pgaG} g for{' '}
        {motion.durationS} s. Any difference comes from the buildings, not the shaking.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Whether a result carries floor weights at all.
 *
 * An old saved run has an empty array. A genuine building cannot weigh zero,
 * so an empty array is unambiguous: there is nothing to divide, and nothing
 * should be guessed.
 */
function recorded(result: SimulationResult): boolean {
  // A zero total cannot be a solved building either. Requiring both keeps a
  // malformed record from printing "0 kN" beside real measurements.
  return (result.floorWeightsKN?.length ?? 0) > 0 && result.totalWeightKN > 0;
}

/** Percentage change of `b` from `a`, or null when it cannot be computed. */
function pct(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

/**
 * The change cell.
 *
 * Direction is carried by an arrow as well as a sign, so the meaning does not
 * depend on colour or on reading a minus sign. Neutral grey when the two are
 * equal — highlighting "no difference" would be misleading emphasis.
 *
 * The side letter is spelled out in the accessible name. With four columns of
 * near-identical figures, "▼12 %" on its own is a number attached to nothing.
 */
function ChangeCell({ pct: value, side }: { pct: number | null; side: CompareSide }) {
  if (value === null) {
    return (
      <span className="text-muted-foreground" aria-label={`Building ${side}: not comparable`}>
        {side} —
      </span>
    );
  }
  if (Math.abs(value) < 0.5) {
    return (
      <span className="text-muted-foreground" aria-label={`Building ${side}: the same as A`}>
        {side} same
      </span>
    );
  }

  const increased = value > 0;
  const sign = increased ? '+' : '−'; // U+2212, not a hyphen

  // One element, not three: a screen reader should hear "B, plus 50 percent
  // against A" as a phrase, not three disconnected fragments.
  return (
    <span
      className="inline-flex items-center justify-end gap-1 whitespace-nowrap"
      aria-label={`Building ${side}: ${sign}${Math.abs(value).toFixed(0)} percent against A`}
    >
      <span aria-hidden="true" className="w-3 text-left">
        {side}
      </span>
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
