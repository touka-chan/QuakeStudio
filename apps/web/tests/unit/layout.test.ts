import { describe, expect, it } from 'vitest';

import { layoutSideBySide } from '@/lib/layout';

/* =========================================================================
   Side-by-side layout

   The camera is framed from this same function's output, so a mistake here
   does not put a building in the wrong place — it crops it, or puts the
   camera so far out that the buildings are specks. Neither shows up in a
   screenshot of one floor count.
   ========================================================================= */

const sq = (size: number) => ({ width: size, depth: size });

describe('layoutSideBySide', () => {
  it('returns nothing to frame for an empty comparison', () => {
    const layout = layoutSideBySide([], 5);
    expect(layout.spots).toEqual([]);
    expect(layout.width).toBe(0);
    expect(layout.depth).toBe(0);
    // Division by `perRow` would be the first thing to blow up on an empty set.
    expect(layout.perRow).toBe(0);
  });

  it('puts a single building on the origin', () => {
    const layout = layoutSideBySide([sq(10)], 5);
    expect(layout.perRow).toBe(1);
    expect(layout.width).toBe(10);
    // Depth of a single row is just its own depth — no gap is added for a row
    // that does not exist, which would frame the scene loosely for no reason.
    expect(layout.depth).toBe(10);
    expect(layout.spots).toEqual([[0, 0]]);
  });

  it('lays two buildings out in one row, left to right', () => {
    const layout = layoutSideBySide([sq(10), sq(10)], 4);

    expect(layout.perRow).toBe(2);
    expect(layout.width).toBe(24); // 10 + 4 + 10
    expect(layout.depth).toBe(10);

    const [a, b] = layout.spots as Array<[number, number]>;
    // Centred as a pair, and in the order they were given.
    expect(a[0]).toBeCloseTo(-7);
    expect(b[0]).toBeCloseTo(7);
    // Same row, so same depth.
    expect(a[1]).toBeCloseTo(b[1]);
  });

  it('wraps to two per row above two buildings', () => {
    expect(layoutSideBySide([sq(10), sq(10), sq(10)], 4).perRow).toBe(2);
    expect(layoutSideBySide([sq(10), sq(10), sq(10), sq(10)], 4).perRow).toBe(2);
  });

  it('puts four buildings in two rows of two, front row nearest the camera', () => {
    const layout = layoutSideBySide([sq(10), sq(10), sq(10), sq(10)], 4);

    // Two columns wide, two rows deep: 24 across, 24 front to back.
    expect(layout.width).toBe(24);
    expect(layout.depth).toBe(24);

    const spots = layout.spots as Array<[number, number]>;
    // Front row is the first two, and nearer the camera means a LARGER z,
    // because the camera sits at +Z.
    expect(spots[0]![1]).toBeGreaterThan(spots[2]![1]);
    expect(spots[1]![1]).toBeCloseTo(spots[0]![1]);
    expect(spots[2]![1]).toBeCloseTo(spots[3]![1]);

    // Left column is left of the right column, in both rows.
    expect(spots[0]![0]).toBeLessThan(spots[1]![0]);
    expect(spots[2]![0]).toBeLessThan(spots[3]![0]);
    // And the second row lines up with the first.
    expect(spots[2]![0]).toBeCloseTo(spots[0]![0]);
    expect(spots[3]![0]).toBeCloseTo(spots[1]![0]);
  });

  it('centres a short final row rather than leaving it hanging', () => {
    const layout = layoutSideBySide([sq(10), sq(10), sq(10)], 4);
    const spots = layout.spots as Array<[number, number]>;

    // Three buildings: a pair on the front row, one alone behind. That one has
    // to sit under the middle of the pair, not off to one side, or the scene
    // looks lopsided and the camera frames empty ground to make room for it.
    expect(spots[2]![0]).toBeCloseTo(0);
    expect(spots[0]![0]).toBeLessThan(0);
    expect(spots[1]![0]).toBeGreaterThan(0);
    // The bounding box is still as wide as two columns — the last row is
    // centred inside it, not measured by it.
    expect(layout.width).toBe(24);
  });

  it('packs columns to their own widest building, not to the widest anywhere', () => {
    // A 14 m building next to a 40 m one. Sizing both columns by the 40 m
    // leaves the 14 m one floating 13 m from anything, which is the empty
    // stretch this was written to avoid.
    const layout = layoutSideBySide(
      [
        { width: 14, depth: 10 },
        { width: 40, depth: 10 },
      ],
      4,
    );

    expect(layout.width).toBe(14 + 4 + 40);
    const [small, large] = layout.spots as Array<[number, number]>;
    // The small one's right edge meets the gap, and the large one's left edge
    // is exactly `clearance` away.
    expect(small[0] + 7).toBeCloseTo(large[0] - 20 - 4);
  });

  it('gives each column the widest building that shares it', () => {
    // Column 0 holds buildings A and C; C is the wider of the two, so column 0
    // has to be wide enough for C.
    const layout = layoutSideBySide(
      [
        { width: 10, depth: 10 },
        { width: 12, depth: 10 },
        { width: 30, depth: 10 },
        { width: 12, depth: 10 },
      ],
      4,
    );
    // Column 0 = 30 (from C), column 1 = 12.
    expect(layout.width).toBe(30 + 4 + 12);
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
     *
     * The first version of this got the gap wrong by one side: it compared
     * centre-to-centre against the SUM of the half-widths instead of the sum
     * of the full widths, which passes for equal-sized buildings and fails the
     * moment one of them is wider than the other.
     */
    const sizes = [
      { width: 10, depth: 10 },
      { width: 14, depth: 10 },
      { width: 9, depth: 8 },
      { width: 22, depth: 12 },
    ];
    const layout = layoutSideBySide(sizes, 5);
    const spots = layout.spots as Array<[number, number]>;

    for (let i = 0; i < spots.length; i += 1) {
      for (let j = i + 1; j < spots.length; j += 1) {
        const [xi, zi] = spots[i]!;
        const [xj, zj] = spots[j]!;
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
