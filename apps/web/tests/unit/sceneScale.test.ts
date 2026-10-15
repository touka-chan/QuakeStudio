import { describe, expect, it } from 'vitest';

import { GEOMETRY } from '@/config/engineeringAssumptions';
import { layoutSideBySide } from '@/lib/layout';
import {
  arrowLengthM,
  arrowReferenceWidthM,
  MAX_SLAB_M,
  MIN_SLAB_M,
  SIDE_CLEARANCE_RATIO,
  slabExtentM,
  slabGridDivisions,
} from '@/lib/sceneScale';
import { MAX_BUILDINGS } from '@/store/compareStore';

/* =========================================================================
   Ground-level scale

   Two bugs, both the same shape: something sized itself from whatever was
   convenient instead of from what actually stands on it. The slab stopped a
   third of the way along a row of four, so the last two buildings stood on
   nothing. The shaking arrow was measured against the whole framed row, so at
   four buildings it was about 87 m and ran off both edges of the viewport.

   The tests below are named after those two bugs, so that when one of them
   comes back the failure says which one it was.
   ========================================================================= */

const sq = (size: number) => ({ width: size, depth: size });

/** The row four legal buildings occupy, using the numbers the app really uses. */
function widestLegalRow() {
  const width = GEOMETRY.widthM.max;
  const clearance = width * SIDE_CLEARANCE_RATIO;
  const sizes = Array.from({ length: MAX_BUILDINGS }, () => sq(width));
  return { sizes, clearance, layout: layoutSideBySide(sizes, clearance) };
}

describe('slabExtentM', () => {
  it('covers the footprint it is given, with margin', () => {
    const extent = slabExtentM(70, 20);
    expect(extent).toBeGreaterThanOrEqual(70);
    expect(extent).toBeGreaterThanOrEqual(20);
  });

  it('covers a full row of four buildings at the widest the app allows', () => {
    /*
     * THE BUG, RESTATED. The slab used to measure itself from building A alone.
     * At four 40 m buildings the row is about 200 m, and the old slab came out
     * at 33.6 m — under the first building and a bit of the second.
     */
    const { layout } = widestLegalRow();
    const extent = slabExtentM(layout.width, layout.depth);

    expect(layout.width).toBeGreaterThan(150);
    expect(
      extent,
      `the slab is ${extent}m but the row of ${MAX_BUILDINGS} buildings is ${Math.round(layout.width)}m — they would be standing on nothing`,
    ).toBeGreaterThanOrEqual(layout.width);
  });

  it('covers the row at every count, not only the largest', () => {
    const width = GEOMETRY.widthM.max;
    for (let count = 1; count <= MAX_BUILDINGS; count += 1) {
      const sizes = Array.from({ length: count }, () => sq(width));
      const layout = layoutSideBySide(sizes, width * SIDE_CLEARANCE_RATIO);
      expect(
        slabExtentM(layout.width, layout.depth),
        `${count} buildings stick out past the slab`,
      ).toBeGreaterThanOrEqual(layout.width);
    }
  });

  it('never draws a plane too small to read as ground', () => {
    // A narrow single building would otherwise get a 6 m mat.
    expect(slabExtentM(4, 4)).toBe(MIN_SLAB_M);
    expect(slabExtentM(0, 0)).toBe(MIN_SLAB_M);
  });

  it('still produces a plane when the numbers are nonsense', () => {
    // A half-typed config field must not leave the buildings floating.
    expect(slabExtentM(Number.NaN, 10)).toBe(MIN_SLAB_M);
    expect(slabExtentM(Number.POSITIVE_INFINITY, 10)).toBe(MIN_SLAB_M);
  });

  it('bounds the plane so a wide row cannot draw off into infinity', () => {
    expect(MAX_SLAB_M).toBeGreaterThan(0);
    expect(slabExtentM(100000, 100000)).toBe(MAX_SLAB_M);
    // And the bound has to sit ABOVE the worst legal row, or it is the old bug
    // wearing a different hat.
    const { layout } = widestLegalRow();
    expect(MAX_SLAB_M).toBeGreaterThanOrEqual(layout.width);
  });
});

describe('slabGridDivisions', () => {
  it('keeps cells a readable size instead of scaling the count with the plane', () => {
    /*
     * A fixed 40 lines is a 0.75 m cell over a 30 m plane and a 6 m cell over a
     * 240 m one. One of those is a reference grid and the other is wallpaper.
     */
    const small = slabGridDivisions(slabExtentM(14, 10), 40);
    const large = slabGridDivisions(slabExtentM(200, 20), 40);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
    expect(30 / small).toBeLessThan(8);
    expect(240 / large).toBeLessThan(8);
  });

  it('never exceeds the caller cap, and never collapses to nothing', () => {
    expect(slabGridDivisions(10000, 40)).toBe(40);
    expect(slabGridDivisions(0.4, 40)).toBe(8);
  });
});

describe('arrowLengthM', () => {
  it('is measured against ONE building, so adding buildings does not change it', () => {
    /*
     * THE BUG, RESTATED. The arrow used to be `widthM * 1.25` where the
     * comparison passed the whole framed row: 30 m at two buildings, 87 m at
     * four, running off both edges of the viewport.
     */
    const widths = Array.from({ length: MAX_BUILDINGS }, () => GEOMETRY.widthM.max);

    const atFour = arrowLengthM(arrowReferenceWidthM(widths));
    const atTwo = arrowLengthM(arrowReferenceWidthM(widths.slice(0, 2)));

    expect(atFour).toBe(atTwo);
    // And it is a fraction of the row, which is the whole point.
    const row = layoutSideBySide(
      widths.map((w) => sq(w)),
      widths[0]! * SIDE_CLEARANCE_RATIO,
    ).width;
    expect(atFour).toBeLessThan(row);
  });

  it('stays big enough to read as a direction on a narrow building', () => {
    expect(arrowLengthM(4)).toBe(12);
  });
});
