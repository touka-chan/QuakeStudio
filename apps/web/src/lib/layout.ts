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
 * ONE HORIZONTAL LINE, AT EVERY COUNT
 * The client asked for this directly. An earlier version wrapped into two rows
 * above two buildings, on the reasoning that a single row of four leaves each
 * one small. That reasoning was sound and it was overruled: side by side is what
 * was asked for, and the buildings are easier to compare in a line.
 *
 * The cost is real and is measured rather than argued about — each building
 * gets a smaller share of the frame as the count rises. What carries the
 * reading at small sizes is the roof badge, the hover callout and the exact
 * figures in the table, none of which depend on the building being large.
 *
 * Buildings are packed edge to edge, sized by their own width rather than by
 * the widest anywhere: a 14 m building beside a 40 m one sits next to the 40 m
 * building's edge instead of floating 26 m away from anything.
 *
 * Units are metres throughout, matching the engine.
 */

/** One building's footprint. */
export type Footprint = { width: number; depth: number };

/** Where each building stands, and the box they collectively occupy. */
export type Layout = {
  /** One `[x, z]` per building, in the order they were given. */
  spots: Array<[number, number]>;
  width: number;
  depth: number;
};

/**
 * Lay the buildings out in a single line, packed against one another.
 *
 * @param sizes     each building's footprint, in display order
 * @param clearance gap between neighbouring buildings, in metres
 */
export function layoutSideBySide(sizes: readonly Footprint[], clearance: number): Layout {
  const n = sizes.length;
  // An empty comparison has no layout, and a `reduce` over nothing is not the
  // place to discover why.
  if (n === 0) return { spots: [], width: 0, depth: 0 };

  const totalWidth = sum(sizes.map((s) => s.width)) + clearance * (n - 1);
  // One row, so the depth is the deepest building and nothing else. There is no
  // row-to-row gap to add, and adding one anyway framed the scene loosely for
  // every count.
  const totalDepth = Math.max(0, ...sizes.map((s) => s.depth));

  /*
   * Every building sits at z = 0, packed left to right in the order given.
   *
   * The whole row is centred on the origin, so the camera frames a box whose
   * middle is the middle of the comparison rather than the middle of the first
   * building — keying it on one building crops the last one off the edge.
   */
  let laid = 0;
  const spots = sizes.map((size): [number, number] => {
    const x = -totalWidth / 2 + laid + size.width / 2;
    laid += size.width + clearance;
    return [x, 0];
  });

  return { spots, width: totalWidth, depth: totalDepth };
}

/* ------------------------------------------------------------------------- */

function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
