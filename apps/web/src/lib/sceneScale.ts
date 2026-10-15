/**
 * How big the two ground-level props are, in metres.
 *
 * -------------------------------------------------------------------------
 * Why this is a file and not two lines in each component
 * -------------------------------------------------------------------------
 * Both props were wrong in the same way and for the same reason: each sized
 * itself from something convenient rather than from what actually stands on it.
 *
 *   - The ground slab measured itself from building A alone, so with four in a
 *     line the last two stood on nothing and the grid lines ended in mid-air.
 *   - The shaking arrow measured itself from the whole framed row, so at four
 *     buildings it was about 87 m long and ran off both edges of the viewport.
 *
 * Neither is fixable by reading the component. They are arithmetic, they are
 * shared by the single-building view and the comparison view, and they are the
 * kind of thing that is right at the default and wrong at the corners. Pure
 * functions in a file with no React in them can simply be asked.
 */

/** Widest footprint the slab will be drawn at. See `slabExtentM`. */
export const MAX_SLAB_M = 300;

/** Smallest. A single narrow building on an enormous plane reads as a speck. */
export const MIN_SLAB_M = 30;

/**
 * Gap between neighbouring comparison buildings, as a fraction of the widest
 * one. Lives here so the test that checks the slab covers a full row uses the
 * same number the scene does, rather than a copy of it that can drift.
 */
export const SIDE_CLEARANCE_RATIO = 0.35;

/** Metres of ground per grid line. Keeps the grid readable at any slab size. */
const TARGET_GRID_CELL_M = 5;

/**
 * The ground plane, sized to cover what stands on it.
 *
 * Square, so the grid reads as ground rather than as a mat laid under the
 * model, and so a row of buildings in one direction still has somewhere to
 * stand along the other.
 *
 * @param widthM  the footprint to cover, along x
 * @param depthM  the footprint to cover, along z
 */
export function slabExtentM(widthM: number, depthM: number): number {
  // `|| MIN` rather than a clamp: a NaN from a half-typed config field has to
  // produce a slab, not a scene with nothing in it.
  const needed = Math.max(widthM, depthM, 0) * 1.25;
  if (!Number.isFinite(needed)) return MIN_SLAB_M;
  return Math.min(MAX_SLAB_M, Math.max(MIN_SLAB_M, needed));
}

/**
 * Grid lines across the slab.
 *
 * Derived rather than fixed, because a fixed count means a fixed count of cells
 * no matter how big the plane is: 40 lines over 30 m is a 0.75 m cell, and 40
 * lines over 252 m is a 6 m one. One of those is a reference grid and the other
 * is wallpaper.
 */
export function slabGridDivisions(extentM: number, maxDivisions: number): number {
  const wanted = Math.round(extentM / TARGET_GRID_CELL_M);
  return Math.max(8, Math.min(maxDivisions, wanted));
}

/**
 * Length of the ground-shaking arrow, in metres.
 *
 * The arrow shows a DIRECTION. It only has to be big enough to read as one and
 * to sit against something for scale, and a single building is that something —
 * which is exactly what the single-building view always passed.
 *
 * So the caller passes the width of one building, and adding a building to the
 * comparison does not make the arrow longer. Scaling it with the row meant the
 * picture changed meaning every time a building was added, and at four it ran
 * off the frame.
 *
 * @param referenceWidthM the width of the one building it is drawn against
 */
export function arrowLengthM(referenceWidthM: number): number {
  return Math.max(12, referenceWidthM * 1.25);
}

/** Arrowhead length as a fraction of the whole. See `ShakeArrow`. */
export const ARROW_HEAD_RATIO = 0.11;

/**
 * What the shaking arrow should be measured against when several buildings are
 * on screen at once.
 *
 * The WIDEST ONE, not the row and not the first. It has to be one of them: the
 * row makes the arrow grow every time a building is added, and "the first" is
 * arbitrary — a comparison of a 4 m building and a 40 m one would get an arrow
 * sized to the one nobody is looking at.
 *
 * @param widths each building's own width, in metres
 */
export function arrowReferenceWidthM(widths: readonly number[]): number {
  return widths.length === 0 ? 0 : Math.max(0, ...widths);
}
