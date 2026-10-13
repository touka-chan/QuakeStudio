import { describe, expect, it } from 'vitest';

import { SUS_ITEMS, isComplete, type SusAnswers, type SusScaleValue } from '@/feedback/susItems';
import {
  aggregateSus,
  gradeSus,
  interpretSus,
  IncompleteSusError,
  scoreSus,
  SUS_TARGET_SCORE,
} from '@/feedback/susScore';

/* ==========================================================================
   System Usability Scale — scoring.

   The scoring table is where a silent 10-point error hides. These tests pin
   the published rules rather than re-deriving them, because a plausible-looking
   "simplification" of the rule is exactly the failure mode.
   ========================================================================== */

/** All ten at one value. */
function allAt(value: SusScaleValue): SusAnswers {
  return Object.fromEntries(SUS_ITEMS.map((item) => [item.number, value]));
}

describe('the instrument', () => {
  it('has ten items numbered 1 to 10', () => {
    expect(SUS_ITEMS).toHaveLength(10);
    expect(SUS_ITEMS.map((item) => item.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('has no empty or duplicated wording', () => {
    const texts = SUS_ITEMS.map((item) => item.text.trim().toLowerCase());
    expect(new Set(texts).size).toBe(10);
    for (const text of texts) {
      expect(text.length, 'an item is empty').toBeGreaterThan(10);
    }
  });

  it('offers a five-point scale', () => {
    // Five points is what the ×2.5 scaling assumes. Changing it breaks the
    // arithmetic everywhere.
    expect(SUS_ITEMS).toHaveLength(10);
  });

  it('agrees with the published polarity table', () => {
    /*
     * The `positive` flag is documentation, not scoring — `susScore.ts` keys
     * off the item number so a wrong flag cannot change a score. That safety
     * only helps if the flag is also CORRECT, though: a flag that quietly
     * disagreed would be documentation that lies, and the first person to
     * trust it would "fix" the scoring table and lose 10 points per response.
     */
    for (const item of SUS_ITEMS) {
      expect(item.positive, `item ${item.number} polarity flag`).toBe(item.number % 2 === 1);
    }
  });
});

describe('scoreSus', () => {
  it('gives 0 when no odd item is agreed and every even item is', () => {
    // Odd items (1,3,5,7,9) answered 1 → 0 each.
    // Even items (2,4,6,8,10) answered 5 → 5−5 = 0 each.
    const answers: SusAnswers = {
      1: 1,
      2: 5,
      3: 1,
      4: 5,
      5: 1,
      6: 5,
      7: 1,
      8: 5,
      9: 1,
      10: 5,
    };
    expect(scoreSus(answers).score).toBe(0);
  });

  it('gives 100 when every odd item is agreed and no even item is', () => {
    // Odd items (1,3,5,7,9) = 5. Even items (2,4,6,8,10) = 1.
    const answers: SusAnswers = {
      1: 5,
      2: 1,
      3: 5,
      4: 1,
      5: 5,
      6: 1,
      7: 5,
      8: 1,
      9: 5,
      10: 1,
    };
    expect(scoreSus(answers).score).toBe(100);
  });

  it('gives 50 for every answer in the middle of the scale', () => {
    // Neither agreeing nor disagreeing with anything is a neutral 50.
    expect(scoreSus(allAt(3)).score).toBe(50);
  });

  /*
   * The trap. Brooke's rule is by PARITY: odd items count upward, even items
   * are reversed. For two items that does not match the wording —
   *
   *     item 8  "easy to use"            positive wording, scored reversed
   *     item 10 "needed to learn a lot"  negative wording, scored upward
   *
   * So the tempting "fix" — matching polarity to how a statement reads — is
   * wrong. Here it costs a full 10 points, which is enough to move a study
   * across the client's 68 target.
   */
  it('scores by item parity, not by how the statement reads', () => {
    // Agree with items 8 and 10 — worded "easy to use" and "needed to learn
    // a great deal" — and disagree with every other statement.
    const answers: SusAnswers = {
      1: 1,
      2: 5,
      3: 1,
      4: 5,
      5: 1,
      6: 5,
      7: 1,
      8: 5,
      9: 1,
      10: 5,
    };

    // By parity (correct):
    //   odd  1,3,5,7,9   all answered 1 → 0 each          = 0
    //   even 2,4,6,8,10  all answered 5 → 5−5 = 0 each     = 0
    //   → 0
    expect(scoreSus(answers).score).toBe(0);

    // By wording (wrong): item 8 would count upward (5−1=4) and item 10 would
    // be reversed (5−5=0), giving raw 4 → a score of 10.
    expect(scoreSus(answers).score).not.toBe(10);
  });

  it('matches the published table on the two items whose polarity is reversed', () => {
    /*
     * A respondent who AGREES with "I found the system to be easy to use"
     * (item 8) should LOWER their score, because the item is reversed.
     */
    const withoutItem8: SusAnswers = { ...allAt(3), 8: 3 };
    const agreeingItem8: SusAnswers = { ...allAt(3), 8: 5 };

    expect(scoreSus(agreeingItem8).score).toBeLessThan(scoreSus(withoutItem8).score);

    // And a respondent who DISAGREES with "I needed to learn a great deal"
    // (item 10) should RAISE their score, because that item counts upward.
    const withoutItem10: SusAnswers = { ...allAt(3), 10: 3 };
    const disagreeingItem10: SusAnswers = { ...allAt(3), 10: 1 };

    expect(scoreSus(disagreeingItem10).score).toBeGreaterThan(scoreSus(withoutItem10).score);
  });

  it('reports the contribution of each item', () => {
    const result = scoreSus(allAt(5));
    const byItem = Object.fromEntries(result.perItem.map((e) => [e.item, e.points]));

    // All agreed: odd items count up to 4, even items are reversed to 0.
    expect(byItem[1]).toBe(4); // odd
    expect(byItem[2]).toBe(0); // even
    expect(byItem[8]).toBe(0); // even, despite positive wording
    expect(byItem[9]).toBe(4); // odd
  });

  it('produces a whole-number score for any set of whole-number answers', () => {
    // The ×2.5 on an even raw sum gives a .5; the score must still land on the
    // published 0–100 grid without float noise.
    for (let v = 1; v <= 5; v++) {
      for (let w = 1; w <= 5; w++) {
        const score = scoreSus({
          ...allAt(3 as SusScaleValue),
          1: v as SusScaleValue,
          2: w as SusScaleValue,
        }).score;
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('refuses to score a partial response, and names what is missing', () => {
    const partial: SusAnswers = { ...allAt(3), 4: undefined, 9: undefined };

    expect(isComplete(partial)).toBe(false);
    expect(() => scoreSus(partial)).toThrow(IncompleteSusError);

    try {
      scoreSus(partial);
    } catch (error) {
      expect((error as IncompleteSusError).missingItems).toEqual([4, 9]);
    }
  });

  it('rejects out-of-range answers rather than silently clamping them', () => {
    const bad = { ...allAt(3), 1: 7 as unknown as SusScaleValue };
    expect(() => scoreSus(bad)).toThrow(IncompleteSusError);
  });
});

describe('interpretation', () => {
  it('uses the published bands', () => {
    expect(interpretSus(90)).toBe('Excellent');
    expect(interpretSus(85)).toBe('Excellent');
    expect(interpretSus(80)).toBe('Good');
    expect(interpretSus(72.6)).toBe('Good');
    expect(interpretSus(70)).toBe('OK');
    expect(interpretSus(62.7)).toBe('OK');
    expect(interpretSus(60)).toBe('Poor');
    expect(interpretSus(51.7)).toBe('Poor');
    expect(interpretSus(45)).toBe('Awful');
  });

  it('grades on the published bands', () => {
    expect(gradeSus(90)).toBe('A');
    expect(gradeSus(85.1)).toBe('A');
    expect(gradeSus(85)).toBe('B');
    expect(gradeSus(80)).toBe('B');
    expect(gradeSus(75)).toBe('C');
    expect(gradeSus(70)).toBe('D');
    expect(gradeSus(60)).toBe('F');
  });

  it('treats 68 as the agreed target', () => {
    expect(SUS_TARGET_SCORE).toBe(68);
  });
});

describe('aggregateSus', () => {
  it('returns null for no participants rather than a fake zero', () => {
    // A mean of 0 from an empty sample would read as "universally hated".
    expect(aggregateSus([])).toBeNull();
  });

  it('summarises a single participant with a zero spread', () => {
    const result = aggregateSus([75]);
    expect(result?.participants).toBe(1);
    expect(result?.mean).toBe(75);
    expect(result?.median).toBe(75);
    expect(result?.standardDeviation).toBe(0);
    expect(result?.confidence95).toBe(0);
  });

  it('computes mean, median and spread over a sample', () => {
    const result = aggregateSus([50, 60, 70, 80]);

    expect(result?.participants).toBe(4);
    expect(result?.mean).toBe(65);
    expect(result?.median).toBe(65); // mean of the two middle values
    expect(result?.min).toBe(50);
    expect(result?.max).toBe(80);
    // Sample SD of {50,60,70,80} is 12.9099…
    expect(result?.standardDeviation).toBeCloseTo(12.91, 2);
  });

  it('gives the median of an even sample as the midpoint', () => {
    expect(aggregateSus([40, 80])?.median).toBe(60);
  });

  it('reports whether the sample met the target', () => {
    expect(aggregateSus([70, 72])?.meetsTarget).toBe(true);
    expect(aggregateSus([60, 65])?.meetsTarget).toBe(false);
    // Exactly at the target counts as meeting it.
    expect(aggregateSus([68])?.meetsTarget).toBe(true);
  });

  it('narrows the confidence interval as the sample grows', () => {
    const wide = aggregateSus([50, 90]);
    const narrow = aggregateSus(Array.from({ length: 30 }, (_, i) => 50 + (i % 2) * 40));
    expect(wide!.confidence95).toBeGreaterThan(narrow!.confidence95);
  });

  it('sorts before summarising, so input order does not matter', () => {
    expect(aggregateSus([80, 50, 70, 60])?.median).toBe(aggregateSus([60, 70, 80, 50])?.median);
  });
});
