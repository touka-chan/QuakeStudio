/**
 * Where the comparison buildings stand.
 *
 * -------------------------------------------------------------------------
 * Why this is arithmetic and not a <group> with some JSX positions
 * -------------------------------------------------------------------------
 * The camera has to frame the box these buildings occupy, and it is framed
 * from a SEPARATE piece of code in the viewport. When those two disagree the
 * building is cropped or the camera is miles too far out, and the symptom
 * appears only at certain floor counts — which is the kind of bug that is
 * invisible right up until a student tries it.
 *
 * One function, used by both, cannot disagree.
 *
 * TWO PER ROW, FROM THREE BUILDINGS
 * A single row of four needs four footprints and three gaps. Fit that into a
 * viewport and each building is a few pixels across, at which point the view
 * has stopped being a comparison and become a plan of a street. Two per row
 * doubles how much of the frame each building gets.
 *
 * A short final row is CENTRED rather than left-hanging, so three buildings
 * read as a pair over a single one rather than as a pair with a stray.
 *
 * Units are metres throughout, matching the engine.
 */

import { MAX_SIDE_BY_SIDE } from '@/store/compareStore';

/** One building's footprint. */
export type Footprint = { width: number; depth: number };

/** Where each building stands, and the box they collectively occupy. */
export type Layout = {
  /** One `[x, z]` per building, in the order they were given. */
  spots: Array<[number, number]>;
  width: number;
  depth: number;
  /** How many buildings share a row. */
  perRow: number;
};

/**
 * Lay the buildings out in rows, packed against one another.
 *
 * @param sizes         each building's footprint, in display order
 * @param clearance     gap between buildings in the same row, in metres
 * @param rowClearance  gap between rows. Defaults to `clearance`.
 *
 * Rows need MORE room than columns, and the reason is the camera rather than
 * the buildings. Two buildings side by side are separated horizontally, which
 * the eye reads even when one is in front of the other. Two buildings one in
 * front of the other are separated only in depth, and from any camera looking
 * down at an angle the front one hides the bottom of the back one.
 *
 * At the same gap, the back row lost about a third of its height behind the
 * front row and the comparison turned into two towers and two stumps. Doubling
 * the row gap is what lets the back row stand clear of the front one, and it
 * costs nothing: the camera is already backing off to frame the set, and the
 * frame it frames is the one this reports.
 */
export function layoutSideBySide(
  sizes: readonly Footprint[],
  clearance: number,
  rowClearance: number = clearance,
): Layout {
  const n = sizes.length;
  // An empty comparison has no layout, and dividing by zero here would be the
  // first thing to break.
  if (n === 0) return { spots: [], width: 0, depth: 0, perRow: 0 };

  const perRow = n <= MAX_SIDE_BY_SIDE ? n : 2;
  const rows = Math.ceil(n / perRow);

  /*
   * Each column is as wide as its widest building, and each row as deep as its
   * deepest — rather than every column being sized by the widest building
   * anywhere. A 14 m building beside a 40 m one then sits next to the 40 m
   * building's edge instead of floating 26 m away from anything.
   *
   * Columns and rows are DIFFERENT sets of buildings, and using one selector
   * for both silently sizes every column by row 0. With two buildings there is
   * only row 0, so "the second column" is empty — it came out as 0 m wide, and
   * the gap between the two buildings vanished with it.
   */
  const columnWidth = range(perRow).map((c) => widest(sizes, (i) => i % perRow === c, 'width'));
  const rowDepth = range(rows).map((r) =>
    widest(sizes, (i) => Math.floor(i / perRow) === r, 'depth'),
  );

  const rowWidth = (count: number) => sum(columnWidth.slice(0, count)) + clearance * (count - 1);
  const totalWidth = rowWidth(perRow);
  const totalDepth = sum(rowDepth) + rowClearance * (rows - 1);

  const spots = sizes.map((size, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    // The last row may be short, so its width is not the grid's full width.
    const inThisRow = Math.min(perRow, n - row * perRow);

    const before = sum(columnWidth.slice(0, col)) + clearance * col;
    const x = -rowWidth(inThisRow) / 2 + before + size.width / 2;

    /*
     * Row 0 is the one nearest the camera.
     *
     * The viewport's camera sits at +Z looking towards the origin, so a
     * positive z is nearer the viewer. Putting the first row there — rather
     * than walking away from the camera from row 0 — is what makes the order
     * of the switcher match the order on screen, top-left first.
     */
    const depthBefore = sum(rowDepth.slice(0, row)) + rowClearance * row;
    const z = totalDepth / 2 - depthBefore - rowDepth[row]! / 2;

    return [x, z] as [number, number];
  });

  return { spots, width: totalWidth, depth: totalDepth, perRow };
}

/* ------------------------------------------------------------------------- */

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/**
 * The largest `axis` among the buildings `belongsTo` selects.
 *
 * `belongsTo` is passed in rather than derived here, because "which column?"
 * and "which row?" are different questions about the same index and only the
 * caller knows which one it is asking.
 *
 * An empty selection is 0, not -Infinity: a short final row has no second
 * column, and a negative extent would make the bounding box nonsense.
 */
function widest(
  sizes: readonly Footprint[],
  belongsTo: (index: number) => boolean,
  axis: keyof Footprint,
): number {
  const values = sizes.filter((_, i) => belongsTo(i)).map((s) => s[axis]);
  return Math.max(0, ...values);
}
