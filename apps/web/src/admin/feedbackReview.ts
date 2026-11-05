import {
  SUS_ITEMS,
  SUS_SCALE,
  isComplete,
  type SusAnswers,
  type SusScaleValue,
} from '@/feedback/susItems';
import { scoreSus } from '@/feedback/susScore';

/* =========================================================================
   Feedback review
   -------------------------------------------------------------------------
   The admin response log used to show a score and a comment but not the ten
   answers behind them. A researcher reading "50, Awful" cannot tell whether a
   participant hated the building controls, the charts or the wording of one
   statement — which is the only reason to collect item-level SUS responses.

   This builds one row per statement from the stored answer map. The answer
   keys arrive as JSON strings, so they are read through `String(number)` and
   re-keyed numerically before the published scoring function sees them.
   ========================================================================= */

export type SusAnswerRow = {
  /** 1-based position in the published instrument. */
  item: number;
  text: string;
  /** 1–5, or null when the response is incomplete. */
  value: number | null;
  /** The scale label the participant chose, or "Not answered". */
  label: string;
  /** 0–4 contribution under the published scoring rules, or null. */
  points: number | null;
};

export type FeedbackReview = {
  rows: SusAnswerRow[];
  /** Sum before the ×2.5 scaling, 0–40, or null for an incomplete response. */
  raw: number | null;
  /** The score recomputed from the stored answers, or null. */
  computedScore: number | null;
};

export function reviewSusAnswers(
  answers: Readonly<Record<string, number | undefined>>,
): FeedbackReview {
  const numeric: SusAnswers = {};
  for (const item of SUS_ITEMS) {
    const value = answers[String(item.number)];
    if (typeof value === 'number' && value >= 1 && value <= 5) {
      numeric[item.number] = value as SusScaleValue;
    }
  }

  const scored = isComplete(numeric) ? scoreSus(numeric) : null;

  return {
    rows: SUS_ITEMS.map((item) => {
      const value = numeric[item.number] ?? null;
      const points = scored?.perItem.find((entry) => entry.item === item.number)?.points ?? null;
      return {
        item: item.number,
        text: item.text,
        value,
        label: value === null ? 'Not answered' : SUS_SCALE[value - 1]!,
        points,
      };
    }),
    raw: scored?.raw ?? null,
    computedScore: scored?.score ?? null,
  };
}
