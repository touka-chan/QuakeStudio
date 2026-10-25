import type { Occupancy } from '@/config/engineeringAssumptions';

/* =========================================================================
   Floor-scene geometry
   -------------------------------------------------------------------------
   Pure numbers, no Three.js. The cutaway view needs three things per floor:
   a thin slab, four corner columns, and a handful of objects that say "this
   floor is an office / parking / storage". Keeping the layout here means the
   single view and the comparison view draw the same building, and it can be
   unit-tested without a WebGL context.

   The contents are deliberately diagrammatic, not architectural: three desks,
   four parking bays, six crates, two beds. They are cues, not a furniture
   schedule, and `custom` gets none — a custom floor has no use we can draw.
   ========================================================================= */

/** Thickness of a cutaway slab, in metres. Matches the build specification. */
export const SLAB_THICKNESS_M = 0.22;

/** Corner column section, in metres. */
export const COLUMN_SECTION_M = 0.3;

export type FloorContentItem = {
  /** Centre, relative to the floor group's origin (the slab's centre). */
  position: [number, number, number];
  /** Full size, in metres. */
  size: [number, number, number];
  /** Rotation about Y, in radians. */
  rotationY: number;
};

/** Keep a dimension usable on a tiny building without letting it dominate. */
function itemScale(widthM: number, depthM: number): number {
  return Math.min(1.2, Math.max(0.55, Math.min(widthM, depthM) / 12));
}

/**
 * The objects on one floor.
 *
 * Positions are fractions of the floor's half-width and half-depth, so the
 * group stays inside the slab whatever its size. `topY` is the slab's top
 * surface relative to the floor group's origin, so an object sits ON the slab
 * instead of half-sunk into it.
 */
export function floorContents(
  occupancy: Occupancy,
  widthM: number,
  depthM: number,
  topY = SLAB_THICKNESS_M / 2,
): FloorContentItem[] {
  const scale = itemScale(widthM, depthM);
  const halfWidth = widthM * 0.28;
  const halfDepth = depthM * 0.28;

  const place = (
    fx: number,
    fz: number,
    size: [number, number, number],
    rotationY = 0,
  ): FloorContentItem => ({
    position: [fx * halfWidth, topY + (size[1] * scale) / 2, fz * halfDepth],
    size: [size[0] * scale, size[1] * scale, size[2] * scale],
    rotationY,
  });

  switch (occupancy) {
    case 'office':
      // Three desks — taller, narrower, slightly rotated so they read as
      // workstations with a monitor raised above the surface.
      return [
        place(-0.55, -0.3, [0.75, 0.85, 0.55], 0.25),
        place(0.05, 0.35, [0.75, 0.85, 0.55], -0.15),
        place(0.6, -0.25, [0.75, 0.85, 0.55], 0.1),
      ];
    case 'residential':
      // Two beds — lower and longer, running front-to-back like real beds.
      return [
        place(-0.5, 0.05, [1.4, 0.38, 1.9], -0.05),
        place(0.5, 0.05, [1.4, 0.38, 1.9], 0.05),
      ];
    case 'parking':
      // Four parking bays — flatter, wider, shorter height so they read
      // as parked vehicles / bays rather than thin lines.
      return [
        place(-0.72, 0, [0.85, 0.18, 2.05], 0),
        place(-0.24, 0, [0.85, 0.18, 2.05], -0.02),
        place(0.24, 0, [0.85, 0.18, 2.05], 0.02),
        place(0.72, 0, [0.85, 0.18, 2.05], 0),
      ];
    case 'storage':
      // A 3 × 2 grid of crates — square, slightly taller, rotated
      // individually so the grid reads as stacked storage.
      return [-0.6, 0, 0.6].flatMap((x) => [-0.45, 0.45].map((z) => place(x, z, [0.72, 0.78, 0.72], (x + z) * 0.15)));
    case 'custom':
      // Nothing invented for a floor whose use we do not know.
      return [];
  }
}

/**
 * Four corner columns for one story, relative to the upper floor's origin.
 *
 * The column runs from the floor below to this one, so its centre is half a
 * storey down. It is drawn as part of the upper floor's swaying group: when
 * the floors move by different amounts, the columns visibly shear, which is
 * the deformation the whole tool exists to show.
 */
export function storyColumns(
  widthM: number,
  depthM: number,
  floorHeightM: number,
): FloorContentItem[] {
  if (widthM <= COLUMN_SECTION_M * 2 || depthM <= COLUMN_SECTION_M * 2) return [];
  const x = widthM / 2 - COLUMN_SECTION_M;
  const z = depthM / 2 - COLUMN_SECTION_M;
  return [
    [x, z],
    [x, -z],
    [-x, z],
    [-x, -z],
  ].map(([px, pz]) => ({
    position: [px!, -floorHeightM / 2, pz!] as [number, number, number],
    size: [COLUMN_SECTION_M, floorHeightM, COLUMN_SECTION_M] as [number, number, number],
    rotationY: 0,
  }));
}
