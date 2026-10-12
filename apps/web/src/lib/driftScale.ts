/* =========================================================================
   Drift scale — the shared mapping from drift ratio to colour band.
   -------------------------------------------------------------------------
   Lives apart from the chart component so both the chart and the 3D view read
   the SAME bands. If they each defined their own thresholds, the legend would
   eventually disagree with the bars — which is the kind of bug a student
   would report as "the colours are wrong".

   IMPORTANT: these are display bands, NOT safety limits. QuakeStudio must
   never imply a verdict about a building's safety, so the labels run Low to
   Very high and never use the words safe or unsafe.

   The band boundaries are placeholder values pending engineering review —
   see docs/assumptions.md.
   ========================================================================= */

export type DriftBand = {
  /** Upper bound of this band, as a fraction. Infinity for the last band. */
  readonly max: number;
  readonly label: string;
  /** Token name for the band colour. Resolved at render time via useCssVar. */
  readonly token: string;
  /** Short plain-language description, used in legends and tooltips. */
  readonly note: string;
};

export const DRIFT_BANDS: readonly DriftBand[] = [
  { max: 0.001, label: 'Very small', token: '--drift-1', note: 'The floors stay close together.' },
  { max: 0.002, label: 'Small', token: '--drift-2', note: 'A small gap opens between floors.' },
  { max: 0.0035, label: 'Moderate', token: '--drift-3', note: 'The gap is easy to see.' },
  {
    max: 0.005,
    label: 'Large',
    token: '--drift-4',
    note: 'Neighbouring floors move noticeably apart.',
  },
  {
    max: Infinity,
    label: 'Very large',
    token: '--drift-5',
    note: 'The largest movement in this run.',
  },
];

/** Map a drift ratio (a fraction, e.g. 0.0034) onto its band. */
export function driftBand(driftRatio: number): DriftBand {
  return DRIFT_BANDS.find((band) => driftRatio < band.max) ?? DRIFT_BANDS[DRIFT_BANDS.length - 1]!;
}

/** Render a drift ratio as a percentage string, e.g. 0.0034 -> "0.34 %". */
export function formatDrift(driftRatio: number, decimals = 2): string {
  return (driftRatio * 100).toFixed(decimals);
}
