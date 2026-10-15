import { describe, expect, it } from 'vitest';

import {
  holePolygon,
  holePolygonPoints,
  placeCard,
  type Box,
} from '@/components/tutorial/placeCard';

/* =========================================================================
   Tour geometry.

   Two pure functions, both of which decide where things sit on screen and both
   of which have been wrong in a way nothing noticed.

   `placeCard` put the card on top of the thing it was describing. `holePolygon`
   was the one this file was written for: see below.
   ========================================================================= */

const viewport = { width: 1920, height: 1080 };

describe('holePolygon', () => {
  it('leaves a hole exactly where the outline is', () => {
    const points = holePolygonPoints({ top: 400, left: 700, width: 200, height: 100 }, viewport);
    expect(points).not.toBeNull();
    expect(points!.x0).toBeCloseTo((700 / 1920) * 100);
    expect(points!.x1).toBeCloseTo((900 / 1920) * 100);
    expect(points!.y0).toBeCloseTo((400 / 1080) * 100);
    expect(points!.y1).toBeCloseTo((500 / 1080) * 100);
  });

  /*
   * THE BUG. Named so that if it comes back, the failure says which one it was.
   *
   * Two of the four tour steps point at a full-height side panel, and the
   * outline carries OUTLINE_PAD of slack around the target. At 1920x1080 that
   * panel's outline ran to x 1928 and y 1088 — both outside the window.
   *
   * Percentages outside 0..100 are legal, the resulting ring self-intersects,
   * and under the nonzero fill rule whole regions stop being clipped. The 3D
   * view stayed blurred and everything to the LEFT of the hole stopped being
   * blurred, which is what the client reported and what a screenshot is needed
   * to believe. Steps 2 and 4 were fine throughout, because their targets are
   * small buttons that fit on screen.
   */
  it('never lets the hole hang outside the window', () => {
    const cases: Array<{ name: string; outline: Box }> = [
      {
        name: 'the step 1 and 3 side panel: past the right and the bottom',
        outline: { top: 45, left: -8, width: 336, height: 1043 },
      },
      {
        name: 'the step 3 side panel at 1920 wide',
        outline: { top: 45, left: 1528, width: 400, height: 1043 },
      },
      {
        name: 'pinned to the top left, exactly on the corner',
        outline: { top: 0, left: 0, width: 10, height: 10 },
      },
      {
        name: 'pinned to the bottom right',
        outline: { top: 1070, left: 1910, width: 40, height: 40 },
      },
      {
        name: 'far larger than the window',
        outline: { top: -500, left: -500, width: 4000, height: 3000 },
      },
      {
        name: 'wider than the window but starting inside it',
        outline: { top: 100, left: 900, width: 4000, height: 200 },
      },
    ];

    for (const { name, outline } of cases) {
      const points = holePolygonPoints(outline, viewport);
      expect(points, `${name}: no hole at all`).not.toBeNull();
      for (const [axis, value] of Object.entries(points!)) {
        expect(value, `${name}: ${axis} is ${value}, outside 0..100`).toBeGreaterThanOrEqual(0);
        expect(value, `${name}: ${axis} is ${value}, outside 0..100`).toBeLessThanOrEqual(100);
      }
      // And it is still a ring, not a degenerate shape: ordered corners.
      expect(points!.x0, name).toBeLessThanOrEqual(points!.x1);
      expect(points!.y0, name).toBeLessThanOrEqual(points!.y1);
    }
  });

  it('produces a ring whose corners sit inside the outer rectangle', () => {
    /*
     * The winding order is what makes it a hole rather than a notch, and it is
     * only a hole while the inner ring is enclosed. This reads the string the
     * browser will actually get, not the helper's arithmetic.
     */
    const clip = holePolygon({ top: 45, left: 1528, width: 400, height: 1043 }, viewport);
    expect(clip).toBeTruthy();

    const pairs = [...clip!.matchAll(/(-?[\d.]+)%\s+(-?[\d.]+)%/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(pairs).toHaveLength(8);

    const outer = pairs.slice(0, 4)!;
    const inner = pairs.slice(4)!;
    const xs = outer.map((p) => p[0]);
    const ys = outer.map((p) => p[1]);
    for (const [x, y] of inner) {
      expect(x).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(x).toBeLessThanOrEqual(Math.max(...xs));
      expect(y).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(y).toBeLessThanOrEqual(Math.max(...ys));
    }
  });

  it('cuts no hole at all when the target is not on screen', () => {
    /*
     * The safe reading for a layer that softens the page: with nothing to cut
     * out, blur everything. A half-clipped hole would be the worst of both —
     * a sliver left sharp over nothing in particular.
     */
    expect(holePolygon({ top: -200, left: 100, width: 50, height: 50 }, viewport)).toBeUndefined();
    expect(holePolygon({ top: 100, left: 5000, width: 50, height: 50 }, viewport)).toBeUndefined();
    expect(holePolygon({ top: 100, left: 100, width: 0, height: 50 }, viewport)).toBeUndefined();
    expect(holePolygon({ top: 100, left: 100, width: 50, height: 0.4 }, viewport)).toBeUndefined();
  });

  it('holds at every width the app runs at', () => {
    // The side panel's outline overflows by different amounts at different
    // widths, and the overflow is the bug, so it is checked at all of them.
    for (const size of [
      { width: 1024, height: 768 },
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
    ]) {
      // A full-height panel 320 wide, with 8px of outline padding, at the foot
      // of a scrollable column.
      const panel = { top: 45, left: -8, width: 320 + 16, height: size.height - 32 };
      const points = holePolygonPoints(panel, size)!;
      expect(points.x0, `${size.width}px: hole runs off the left`).toBe(0);
      expect(points.y1, `${size.width}px: hole runs off the bottom`).toBe(100);
      expect(points.x1, `${size.width}px: hole runs off the right`).toBeLessThan(100);
    }
  });
});

describe('placeCard', () => {
  const target: Box = { top: 400, left: 700, width: 120, height: 40 };
  const card = { width: 352, height: 240 };

  it('does not sit on the thing it is describing', () => {
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
    ]) {
      const at = placeCard(target, card, size);
      const covers =
        at.left < target.left + target.width &&
        target.left < at.left + card.width &&
        at.top < target.top + target.height &&
        target.top < at.top + card.height;
      expect(covers, `the card covers its target at ${size.width}px`).toBe(false);
    }
  });

  it('keeps itself on screen', () => {
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 360, height: 720 },
    ]) {
      const at = placeCard(target, card, size);
      expect(at.left, `off the left at ${size.width}px`).toBeGreaterThanOrEqual(0);
      expect(at.top, `off the top at ${size.width}px`).toBeGreaterThanOrEqual(0);
      expect(at.left + card.width, `off the right at ${size.width}px`).toBeLessThanOrEqual(
        size.width + 1,
      );
      expect(at.top + card.height, `off the bottom at ${size.width}px`).toBeLessThanOrEqual(
        size.height + 1,
      );
    }
  });

  it('puts itself above the target when there is room', () => {
    // Above first is deliberate: a card over the content it describes reads as
    // a tutorial pointing at something you cannot see.
    const at = placeCard({ top: 700, left: 700, width: 120, height: 40 }, card, viewport);
    expect(at.top + card.height).toBeLessThanOrEqual(700);
  });
});
