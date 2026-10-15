import { describe, expect, it } from 'vitest';

import { layoutSideBySide } from '@/lib/layout';

/* =========================================================================
   Side-by-side layout

   The camera is framed from this same function's output, so a mistake here
   does not put a building in the wrong place — it crops it, or puts the
   camera so far out that the buildings are specks. Neither shows up in a
   screenshot of one floor count.

   One horizontal line at every count, which is what the client asked for. The
   two-row version that came before is gone, and the tests for it with it:
   "wraps to two per row", "centres a short final row" and "gives each column
   the widest building that shares it" described behaviour that no longer
   exists, and a test for behaviour that does not exist is a test that cannot
   fail.
   ========================================================================= */

const sq = (size: number) => ({ width: size, depth: size });

describe('layoutSideBySide', () => {
  it('returns nothing to frame for an empty comparison', () => {
    const layout = layoutSideBySide([], 5);
    expect(layout.spots).toEqual([]);
    expect(layout.width).toBe(0);
    expect(layout.depth).toBe(0);
  });

  it('puts a single building on the origin', () => {
    const layout = layoutSideBySide([sq(10)], 5);
    expect(layout.width).toBe(10);
    // The depth of one building is its own depth — no gap is added for a row
    // that does not exist, which framed the scene loosely for no reason.
    expect(layout.depth).toBe(10);
    expect(layout.spots).toEqual([[0, 0]]);
  });

  it('lays every count out in ONE line, never wrapping', () => {
    for (const n of [1, 2, 3, 4]) {
      const layout = layoutSideBySide(
        Array.from({ length: n }, () => sq(10)),
        4,
      );
      // The whole point of the change. Every building at z = 0, so they are
      // side by side rather than in rows.
      expect(
        layout.spots.map(([, z]) => z),
        `${n} buildings wrapped onto a second row`,
      ).toEqual(Array(n).fill(0));
      expect(layout.width, `${n} buildings did not fit in one line`).toBe(n * 10 + (n - 1) * 4);
      expect(layout.depth, `${n} buildings made the frame deeper than one building`).toBe(10);
    }
  });

  it('keeps them left to right, in the order given', () => {
    const layout = layoutSideBySide([sq(10), sq(10), sq(10), sq(10)], 4);
    const xs = layout.spots.map(([x]) => x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]!, `building ${i} is not right of building ${i - 1}`).toBeGreaterThan(xs[i - 1]!);
    }
  });

  it('centres the whole line on the origin', () => {
    const layout = layoutSideBySide([sq(10), sq(10)], 4);
    // A, B, A. Keying the frame on the first building instead pushes the last
    // one off the right edge, which is the bug the shared function exists to
    // make impossible.
    expect(layout.spots[0]![0]).toBeCloseTo(-7);
    expect(layout.spots[1]![0]).toBeCloseTo(7);
  });

  it('leaves exactly `clearance` between neighbouring buildings', () => {
    for (const gap of [1, 4, 12.5]) {
      const layout = layoutSideBySide([sq(10), sq(10), sq(10)], gap);
      const xs = layout.spots.map(([x]) => x);
      const gapSeen = xs[1]! - xs[0]! - 10;
      expect(gapSeen, `gap wrong with clearance ${gap}`).toBeCloseTo(gap);
    }
  });

  it('packs each building by its OWN width, not by the widest anywhere', () => {
    // A 14 m building next to a 40 m one. Sizing both slots by the 40 m one
    // leaves the 14 m floating 13 m from anything, which is the empty stretch
    // this was written to avoid.
    const layout = layoutSideBySide(
      [
        { width: 14, depth: 10 },
        { width: 40, depth: 10 },
      ],
      4,
    );

    expect(layout.width).toBe(14 + 4 + 40);
    const [small, large] = layout.spots;
    // The small one's right edge meets the gap, and the large one's left edge
    // is exactly `clearance` away.
    expect(small![0] + 7).toBeCloseTo(large![0] - 20 - 4);
  });

  it('takes the depth from the deepest building', () => {
    const layout = layoutSideBySide([sq(10), { width: 10, depth: 22 }, sq(10)], 4);
    expect(layout.depth).toBe(22);
  });

  it('keeps every building inside the box it reports', () => {
    /*
     * The contract the camera depends on: frame `width` by `depth` and every
     * building is inside it. If this ever fails, a building is cropped, and it
     * will only be cropped at the sizes where it fails.
     */
    const cases: Array<Array<{ width: number; depth: number }>> = [
      [sq(10)],
      [sq(10), sq(10)],
      [sq(10), sq(10), sq(10)],
      [sq(10), sq(10), sq(10), sq(10)],
      [
        { width: 14, depth: 10 },
        { width: 40, depth: 22 },
      ],
      [
        { width: 40, depth: 22 },
        { width: 14, depth: 10 },
        { width: 25, depth: 18 },
      ],
      [
        { width: 40, depth: 22 },
        { width: 14, depth: 10 },
        { width: 25, depth: 18 },
        { width: 9, depth: 8 },
      ],
    ];

    for (const sizes of cases) {
      const layout = layoutSideBySide(sizes, 3);
      const label = sizes.map((s) => `${s.width}x${s.depth}`).join(',');
      for (const [i, size] of sizes.entries()) {
        const [x, z] = layout.spots[i]!;
        expect(
          Math.abs(x) + size.width / 2,
          `${label}: building ${i} sticks out sideways`,
        ).toBeLessThanOrEqual(layout.width / 2 + 1e-9);
        expect(
          Math.abs(z) + size.depth / 2,
          `${label}: building ${i} sticks out in depth`,
        ).toBeLessThanOrEqual(layout.depth / 2 + 1e-9);
      }
    }
  });

  it('never lets two buildings overlap', () => {
    /*
     * The whole point of the exercise. `clearance` is the gap the caller asked
     * for, and a negative one would be a caller bug — but an overlap at a
     * positive clearance means the packing arithmetic is wrong, and two
     * buildings drawn through each other is the single most obvious possible
     * symptom of a side-by-side view.
     */
    const sizes = [
      { width: 10, depth: 10 },
      { width: 14, depth: 10 },
      { width: 9, depth: 8 },
      { width: 22, depth: 12 },
    ];
    const layout = layoutSideBySide(sizes, 5);

    for (let i = 0; i < layout.spots.length; i += 1) {
      for (let j = i + 1; j < layout.spots.length; j += 1) {
        const [xi, zi] = layout.spots[i]!;
        const [xj, zj] = layout.spots[j]!;
        // Two boxes are apart on an axis when their centres are at least half
        // of each one's extent on that axis.
        const apart =
          Math.abs(xi - xj) >= (sizes[i]!.width + sizes[j]!.width) / 2 ||
          Math.abs(zi - zj) >= (sizes[i]!.depth + sizes[j]!.depth) / 2;
        expect(apart, `buildings ${i} and ${j} overlap`).toBe(true);
      }
    }
  });
});
