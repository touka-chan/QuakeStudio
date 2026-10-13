/* =========================================================================
   System Usability Scale — the questionnaire
   -------------------------------------------------------------------------
   Ten statements, each rated on a 5-point agreement scale. Standardised
   instrument by Bangor, Kortum and Miller (2008); the scoring rules are in
   `susScore.ts` and are reproduced here unchanged, because changing the
   wording invalidates comparison with every other SUS study ever published.

   WHAT THIS FILE IS NOT: results. Usability testing needs real people. QuakeStudio
   ships the instrument and the analysis; the scores come from a study a team
   runs with students — see `docs/usability-plan.md`.

   A NOTE ON LICENCE: the SUS is distributed by Bangor, Kortum & Miller and the
   authors hold rights to the instrument. It is used here without charge for
   evaluation, which is its intended use, and the wording is reproduced from
   the published instrument. Confirm the terms with the authors before
   redistributing this repository or publishing it — it is a two-line email
   and worth doing rather than assuming.
   ========================================================================= */

/** Answer scale. Deliberately labelled at both ends. */
export const SUS_SCALE = [
  'Strongly disagree',
  'Disagree',
  'Neither agree nor disagree',
  'Agree',
  'Strongly agree',
] as const;

export type SusScaleValue = 1 | 2 | 3 | 4 | 5;

export type SusItem = {
  /** 1-based position, matching the published instrument. */
  readonly number: number;
  readonly text: string;
  /**
   * Polarity as the published scoring table assigns it — that is, true for the
   * odd items.
   *
   * This is NOT how each statement reads. Item 8 is worded positively and
   * item 10 negatively, yet both are scored by parity. See the long note in
   * `susScore.ts`, which is the reason this field is here at all.
   *
   * Scoring never reads this field: it keys off the item number, so a wrong
   * flag cannot change a score. `sus.test.ts` asserts the two agree, because a
   * flag that quietly disagreed would be documentation that lies.
   */
  readonly positive: boolean;
};

export const SUS_ITEMS: readonly SusItem[] = [
  { number: 1, text: 'I would like to use this system again.', positive: true },
  { number: 2, text: 'I found the system unnecessarily complex.', positive: false },
  { number: 3, text: 'I thought the system was easy to use.', positive: true },
  {
    number: 4,
    text: 'I think that I would need technical support in order to use this system.',
    positive: false,
  },
  {
    number: 5,
    text: 'I thought the various functions in this system were well integrated.',
    positive: true,
  },
  {
    number: 6,
    text: 'I thought there was too much inconsistency in this system.',
    positive: false,
  },
  { number: 7, text: 'I found the system to be very cumbersome to use.', positive: true },
  { number: 8, text: 'I found the system to be easy to use.', positive: false },
  { number: 9, text: 'I felt very confident using the system.', positive: true },
  {
    number: 10,
    text: 'I needed to learn a great deal before I could get going with the system.',
    positive: false,
  },
] as const;

/** An unanswered instrument is not a low score — it is a missing one. */
export type SusAnswers = Record<number, SusScaleValue | undefined>;

/** Every question answered. Used to decide whether a response may be scored. */
export function isComplete(answers: SusAnswers): boolean {
  return SUS_ITEMS.every((item) => {
    const value = answers[item.number];
    return typeof value === 'number' && value >= 1 && value <= 5;
  });
}

export const SUS_ATTRIBUTION =
  'System Usability Scale — Bangor, Kortum & Miller (2008). Score 0–100.' as const;
