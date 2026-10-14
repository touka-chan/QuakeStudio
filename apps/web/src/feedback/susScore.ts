import { SUS_ITEMS, isComplete, type SusAnswers } from './susItems';

/* =========================================================================
   System Usability Scale — scoring
   -------------------------------------------------------------------------
   Reproduced from Brooke (1996), as presented by Bangor, Kortum & Miller
   (2008). Do not "improve" it:

     • ODD items (1, 3, 5, 7, 9)  score as (value − 1)   → 0 … 4
     • EVEN items (2, 4, 6, 8, 10) score as (5 − value)   → 0 … 4
     • Sum the ten, then × 2.5                            → 0 … 100

   THE TRAP, AND IT IS AN UNUSUAL ONE. The rule is by ITEM NUMBER, and for two
   items the number does not match the wording:

     item 8  "I found the system to be easy to use."   positive wording,
                                                        scored NEGATIVE
     item 10 "I needed to learn a great deal…"        negative wording,
                                                        scored POSITIVE

   So the natural "correction" — matching polarity to how a statement reads —
   is wrong, and costs 10 points on a participant's score. That is enough to
   move a study across the client's 68 target, and enough to invert an item's
   apparent meaning when it is quoted in a write-up.

   Scoring is therefore keyed off the item NUMBER, never off the `positive`
   flag in `susItems.ts`. That flag is documentation and UI only; if the two
   ever disagree, the number wins and the flag is what a test should catch.
   ========================================================================= */

/**
 * Item numbers whose response counts upward — the odd items.
 * From the published scoring table (Brooke 1996).
 */
const POSITIVE_ITEMS: ReadonlySet<number> = new Set([1, 3, 5, 7, 9]);

/** A SUS score for one participant. */
export type SusScore = {
  /** 0–100, the standard figure. */
  readonly score: number;
  /** Sum before the ×2.5 scaling — 0 … 40. Kept so the maths is checkable. */
  readonly raw: number;
  /** Per-item contributions, for spotting which statement dragged the score. */
  readonly perItem: ReadonlyArray<{ item: number; points: number }>;
};

/**
 * Thrown when a response set cannot be scored.
 *
 * A plain class rather than `extends Error` with a parameter property: the
 * project compiles with `erasableSyntaxOnly`, which forbids that syntax.
 */
export class IncompleteSusError extends Error {
  readonly missingItems: number[];

  constructor(missingItems: number[]) {
    super(
      `Cannot score an incomplete SUS: unanswered items ${missingItems.join(', ')}. ` +
        'An unanswered question is a missing answer, not a low score — averaging over ' +
        'the answered ones would make someone who skipped a hard question look worse than ' +
        'someone who answered everything.',
    );
    this.name = 'IncompleteSusError';
    this.missingItems = missingItems;
  }
}

/** Score one response set. Throws if any item is unanswered. */
export function scoreSus(answers: SusAnswers): SusScore {
  if (!isComplete(answers)) {
    const missing = SUS_ITEMS.filter((item) => {
      const value = answers[item.number];
      return typeof value !== 'number' || value < 1 || value > 5;
    }).map((item) => item.number);

    throw new IncompleteSusError(missing);
  }

  const perItem = SUS_ITEMS.map((item) => {
    const value = answers[item.number]!;
    const points = POSITIVE_ITEMS.has(item.number) ? value - 1 : 5 - value;
    return { item: item.number, points };
  });

  const raw = perItem.reduce((sum, entry) => sum + entry.points, 0);

  return {
    // ×2.5 maps 0…40 onto 0…100. toFixed then strips float noise like
    // 67.49999999999999, which would otherwise show a participant a score
    // that does not match the arithmetic they could do on paper.
    score: Number((raw * 2.5).toFixed(2)),
    raw,
    perItem,
  };
}

/* ------------------------------------------------------------- interpretation */

/**
 * Descriptive labels from Bangor, Kortum & Miller's published ranges.
 *
 * These are descriptive of a sample, not a pass mark. SUS is explicitly
 * RELATIVE: a score means "better than X% of the systems in the comparison
 * corpus", which is why the same number can be excellent in one domain and
 * mediocre in another.
 */
export type SusInterpretation = 'Excellent' | 'Good' | 'OK' | 'Poor' | 'Awful';

export function interpretSus(score: number): SusInterpretation {
  if (score >= 85) return 'Excellent';
  if (score >= 72.6) return 'Good';
  if (score >= 62.7) return 'OK';
  if (score >= 51.7) return 'Poor';
  return 'Awful';
}

/** Letter grades, from the same published percentile bands. */
export type SusGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export function gradeSus(score: number): SusGrade {
  if (score > 85) return 'A';
  if (score >= 78.5) return 'B';
  if (score >= 72.6) return 'C';
  if (score >= 62.7) return 'D';
  return 'F';
}

/**
 * The benchmark this project is judged against.
 *
 * A mean SUS score of 68 sits at the 50th percentile of Bangor's reference
 * corpus — in other words, "average". It is the target agreed with the client,
 * not a pass/fail threshold.
 */
export const SUS_TARGET_SCORE = 68;

/* ----------------------------------------------------------------- aggregate */

export type SusAggregate = {
  readonly participants: number;
  /** Mean score, 0–100. */
  readonly mean: number;
  /** Median, which is the safer summary for a small sample. */
  readonly median: number;
  readonly min: number;
  readonly max: number;
  /** Sample standard deviation (n−1). Zero for a single participant. */
  readonly standardDeviation: number;
  /** Mean confidence interval half-width at 95%, using a t-distribution. */
  readonly confidence95: number;
  readonly interpretation: SusInterpretation;
  readonly grade: SusGrade;
  readonly meetsTarget: boolean;
};

/**
 * t critical values for 95% two-sided, by degrees of freedom.
 *
 * Hard-coded rather than pulled from scipy: this runs in the browser, and a
 * 400 KB statistics library to compute eleven numbers would be a poor trade.
 * Values beyond df = 30 fall back to 2.042, the limit, good to within 0.6% for any
 * plausible study size.
 */
const T_95: Readonly<Record<number, number>> = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  11: 2.201,
  12: 2.179,
  13: 2.16,
  14: 2.145,
  15: 2.131,
  16: 2.12,
  17: 2.11,
  18: 2.101,
  19: 2.093,
  20: 2.086,
  21: 2.08,
  22: 2.074,
  23: 2.069,
  24: 2.064,
  25: 2.06,
  26: 2.056,
  27: 2.052,
  28: 2.048,
  29: 2.045,
  30: 2.042,
};

function tCritical(df: number): number {
  if (df <= 0) return 0;
  return T_95[df] ?? 2.042;
}

export function aggregateSus(scores: number[]): SusAggregate | null {
  if (scores.length === 0) return null;

  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / n;

  // Median: the middle value, or the mean of the two middle ones for even n.
  const median = n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;

  const variance =
    n > 1 ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  const standardDeviation = Math.sqrt(variance);

  return {
    participants: n,
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    min: sorted[0]!,
    max: sorted[n - 1]!,
    standardDeviation: Number(standardDeviation.toFixed(2)),
    confidence95: Number((tCritical(n - 1) * (standardDeviation / Math.sqrt(n))).toFixed(2)),
    interpretation: interpretSus(mean),
    grade: gradeSus(mean),
    meetsTarget: mean >= SUS_TARGET_SCORE,
  };
}
