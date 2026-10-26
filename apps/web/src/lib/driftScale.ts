import { driftBandsSchema } from '@/content/schema';
import { readStoredContent } from '@/content/storage';
import type { DriftBandContent } from '@/content/types';

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
   see docs/assumptions.md. They are editable in the admin and are restored
   after a reload so the chart, legend and 3D scene stay in step.
   ========================================================================= */

export type DriftBand = {
  readonly id: string;
  /** Upper bound of this band, as a fraction. Infinity for the last band. */
  readonly max: number;
  readonly label: string;
  /** Token name for the band colour. Resolved at render time via useCssVar. */
  readonly token: string;
  /** Short plain-language description, used in legends and tooltips. */
  readonly note: string;
  readonly colorLight: string;
  readonly colorDark: string;
};

export const BASELINE_DRIFT_BANDS: readonly DriftBandContent[] = [
  {
    id: 'drift-very-small',
    max: 0.001,
    label: 'Very small',
    note: 'The floors stay close together.',
    colorLight: '#bfdbfe',
    colorDark: '#bfdbfe',
  },
  {
    id: 'drift-small',
    max: 0.002,
    label: 'Small',
    note: 'A small gap opens between floors.',
    colorLight: '#86efac',
    colorDark: '#86efac',
  },
  {
    id: 'drift-moderate',
    max: 0.0035,
    label: 'Moderate',
    note: 'The gap is easy to see.',
    colorLight: '#fde047',
    colorDark: '#fde047',
  },
  {
    id: 'drift-large',
    max: 0.005,
    label: 'Large',
    note: 'Neighbouring floors move noticeably apart.',
    colorLight: '#fb923c',
    colorDark: '#fb923c',
  },
  {
    id: 'drift-very-large',
    max: null,
    label: 'Very large',
    note: 'The largest movement in this run.',
    colorLight: '#ea580c',
    colorDark: '#ea580c',
  },
];

const saved = readStoredContent()?.driftBands;
const parsed = driftBandsSchema.safeParse(saved);

export const DRIFT_BAND_CONTENT: readonly DriftBandContent[] = parsed.success
  ? parsed.data
  : BASELINE_DRIFT_BANDS;

export const DRIFT_BANDS: readonly DriftBand[] = DRIFT_BAND_CONTENT.map((band, index) => ({
  id: band.id,
  max: band.max ?? Infinity,
  label: band.label,
  token: `--drift-${index + 1}`,
  note: band.note,
  colorLight: band.colorLight,
  colorDark: band.colorDark,
}));

/** Map a drift ratio (a fraction, e.g. 0.0034) onto its band. */
export function driftBand(driftRatio: number): DriftBand {
  return DRIFT_BANDS.find((band) => driftRatio < band.max) ?? DRIFT_BANDS[DRIFT_BANDS.length - 1]!;
}

/** Render a drift ratio as a percentage string, e.g. 0.0034 -> "0.34 %". */
export function formatDrift(driftRatio: number, decimals = 2): string {
  return (driftRatio * 100).toFixed(decimals);
}
