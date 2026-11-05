import { describe, expect, it } from 'vitest';

import { reviewSusAnswers } from '@/admin/feedbackReview';

/*
 * The review dialog is only useful if it reproduces the published scoring
 * rules. Item 8 is worded positively and item 10 negatively, but the published
 * table scores them by parity — 8 as a negative item and 10 as a positive one.
 * The dialog has to follow the same rule as the participant report.
 */

function answersAll(value: 1 | 2 | 3 | 4 | 5): Record<string, number> {
  return Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), value]));
}

describe('admin feedback review', () => {
  it('builds one row per SUS statement with the stored answer', () => {
    const review = reviewSusAnswers(answersAll(4));
    expect(review.rows).toHaveLength(10);
    expect(review.rows[0]!.label).toBe('Agree');
    expect(review.rows[9]!.label).toBe('Agree');
    expect(review.rows.every((row) => row.points !== null)).toBe(true);
  });

  it('follows the published parity rule for items 8 and 10', () => {
    const review = reviewSusAnswers(answersAll(4));
    const item8 = review.rows.find((row) => row.item === 8)!;
    const item10 = review.rows.find((row) => row.item === 10)!;
    // Both are even items: 5 − 4 = 1 point, even though item 8 reads positive.
    expect(item8.points).toBe(1);
    expect(item10.points).toBe(1);
    expect(review.raw).toBe(20);
    expect(review.computedScore).toBe(50);
  });

  it('reports a missing answer instead of scoring it as low', () => {
    const answers = answersAll(4);
    delete answers['5'];
    const review = reviewSusAnswers(answers);
    expect(review.rows.find((row) => row.item === 5)!.label).toBe('Not answered');
    expect(review.rows.find((row) => row.item === 5)!.value).toBeNull();
    expect(review.raw).toBeNull();
    expect(review.computedScore).toBeNull();
  });
});
