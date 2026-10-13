/**
 * Generate deterministic SUS cases and score them with the TypeScript scorer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * The scoring rule has a real trap in it (items 8 and 10 are scored contrary
 * to their wording) and it is implemented twice: once in TypeScript, for the
 * score a participant sees, and once in Python, for the report a researcher
 * reads. If those two disagree, a reported score will not match what the app
 * showed — which is precisely the class of quiet wrongness this project treats
 * as a defect.
 *
 * So the Python side re-scores exactly these cases and the results must match.
 *
 * Usage:
 *     npx tsx --tsconfig apps/web/tsconfig.app.json tools/usability/cross-check.ts > cases.json
 *     python tools/usability/cross-check.py cases.json
 */

import { SUS_ITEMS, type SusAnswers, type SusScaleValue } from '@/feedback/susItems';
import { scoreSus } from '@/feedback/susScore';

/**
 * Cases chosen to exercise the scoring table, not to be representative.
 *
 * Includes both reversed-polarity items, the extremes, the neutral midpoint,
 * and deliberately uneven patterns — because the bug this guards against only
 * shows up when 8 and 10 are answered differently from their parity peers.
 */
const CASES: Array<{ id: string; why: string; answers: SusAnswers }> = [
  {
    id: 'all-1',
    why: 'Every answer at the bottom of the scale.',
    answers: filled(1),
  },
  {
    id: 'all-5',
    why: 'Every answer at the top of the scale.',
    answers: filled(5),
  },
  {
    id: 'all-3',
    why: 'Fully neutral. Must score exactly 50.',
    answers: filled(3),
  },
  {
    id: 'odd-high-even-low',
    why: 'Odd items 5, even items 1 — the maximum, 100.',
    answers: Object.fromEntries(SUS_ITEMS.map((i) => [i.number, i.number % 2 ? 5 : 1])),
  },
  {
    id: 'odd-low-even-high',
    why: 'Odd items 1, even items 5 — the minimum, 0.',
    answers: Object.fromEntries(SUS_ITEMS.map((i) => [i.number, i.number % 2 ? 1 : 5])),
  },
  {
    id: 'reversed-items-disagree',
    why:
      'The trap. Items 8 and 10 disagree with their parity peers, so a scorer ' +
      'that follows the WORDING rather than the item number scores this wrong.',
    answers: { 1: 1, 2: 5, 3: 1, 4: 5, 5: 1, 6: 5, 7: 1, 8: 5, 9: 1, 10: 5 },
  },
  {
    id: 'reversed-items-alone',
    why: 'Only items 8 and 10 answered differently; isolates the two reversed items.',
    answers: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 5, 9: 3, 10: 1 },
  },
  {
    id: 'realistic-mixed',
    why: 'A plausible set of answers, not uniform — closer to what a person produces.',
    answers: { 1: 5, 2: 2, 3: 4, 4: 2, 5: 4, 6: 3, 7: 2, 8: 4, 9: 4, 10: 3 },
  },
  {
    id: 'single-step-above-neutral',
    why: 'Everything at 3 except item 1 at 4 — the smallest possible positive score.',
    answers: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3 },
  },
  {
    id: 'single-step-below-neutral',
    why: 'Everything at 3 except item 1 at 2 — the smallest possible negative score.',
    answers: { 1: 2, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3 },
  },
];

function filled(value: SusScaleValue): SusAnswers {
  return Object.fromEntries(SUS_ITEMS.map((item) => [item.number, value]));
}

const results = CASES.map((testCase) => {
  const scored = scoreSus(testCase.answers);
  return {
    id: testCase.id,
    why: testCase.why,
    // String keys, because that is how the answers are stored in an export.
    answers: Object.fromEntries(
      Object.entries(testCase.answers).map(([key, value]) => [key, value]),
    ),
    tsScore: scored.score,
    raw: scored.raw,
  };
});

process.stdout.write(
  `${JSON.stringify(
    {
      instrument: 'System Usability Scale — Brooke (1996), Bangor, Kortum & Miller (2008)',
      scoring: 'odd items score value-1; even items score 5-value; sum x 2.5',
      cases: results,
    },
    null,
    2,
  )}\n`,
);
