/**
 * Camera framing
 *
 * Place a camera so a given box fills the frame, from a given direction.
 *
 * -------------------------------------------------------------------------
 * Why this exists rather than drei's <Bounds>
 * -------------------------------------------------------------------------
 * <Bounds> only behaves when there is no orbit-control object to fight. Add
 * `<OrbitControls makeDefault>` and <Bounds> stops framing: the single-building
 * viewport rendered a blank scene, and the comparison viewport cropped the
 * taller building off the top of the canvas.
 *
 * Neither failure was visible in the unit tests, and neither would be obvious
 * to a student reading the JSX. Computing the camera position here is ~30 lines
 * of arithmetic, is covered by unit tests, and cannot drift.
 *
 * Units are metres throughout, matching the engine.
 */

/** Axis-aligned box to frame. Y runs from 0 upward, so `yMin` is usually 0. */
export type BoxSize = {
  width: number;
  height: number;
  depth: number;
  /** Smallest y in the box. Ground level is 0. */
  yMin?: number;
};

export type Frame = {
  position: [number, number, number];
  target: [number, number, number];
};

/** Direction the camera sits in, relative to the centre of what it looks at. */
export type Direction = [number, number, number];

/**
 * Distance needed to fit the box along one axis, for a given half-extent and
 * field of view.
 *
 * The camera sees a half-extent `e` at distance `d` as an angle of
 * `atan(e / d)`, so `d = e / tan(fov / 2)`.
 */
function distanceFor(halfExtent: number, fovRadians: number): number {
  return halfExtent / Math.tan(fovRadians / 2);
}

/** Camera basis: forward, right and up as unit vectors. */
type Basis = {
  forward: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
};

function basisFrom(forward: [number, number, number]): Basis {
  const f = normalize(forward);
  // right = forward × worldUp. Degenerate looking straight up or down, so fall
  // back to the Z axis as the reference.
  const worldUp: [number, number, number] = Math.abs(f[1]) > 0.999 ? [0, 0, 1] : [0, 1, 0];

  const raw: [number, number, number] = [
    f[1] * worldUp[2] - f[2] * worldUp[1],
    f[2] * worldUp[0] - f[0] * worldUp[2],
    f[0] * worldUp[1] - f[1] * worldUp[0],
  ];
  const right = normalize(raw);

  const up: [number, number, number] = [
    right[1] * f[2] - right[2] * f[1],
    right[2] * f[0] - right[0] * f[2],
    right[0] * f[1] - right[1] * f[0],
  ];

  return { forward: f, right, up };
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * How far outside the frustum a point projects, as a ratio.
 *
 * 1 means exactly on the boundary; greater than 1 means cropped. Measured
 * against a frustum shrunk by `margin`, so a value ≤ 1 means "fits with the
 * requested breathing room".
 */
function overshoot(
  point: [number, number, number],
  position: [number, number, number],
  basis: Basis,
  tanV: number,
  tanH: number,
  margin: number,
): number {
  const dx = point[0] - position[0];
  const dy = point[1] - position[1];
  const dz = point[2] - position[2];

  const depth = dx * basis.forward[0] + dy * basis.forward[1] + dz * basis.forward[2];
  if (depth <= 0) return Number.POSITIVE_INFINITY; // behind the camera

  const xView = dx * basis.right[0] + dy * basis.right[1] + dz * basis.right[2];
  const yView = dx * basis.up[0] + dy * basis.up[1] + dz * basis.up[2];

  return Math.max(
    Math.abs(xView) / ((tanH * depth) / margin),
    Math.abs(yView) / ((tanV * depth) / margin),
  );
}

/**
 * Frame `box` from `direction`.
 *
 * @param box      what must fit in the frame
 * @param aspect   canvas width / height — a wide canvas fits more sideways
 * @param fovDeg   vertical field of view in degrees
 * @param direction where the camera sits relative to the box's centre; not
 *                  required to be normalised
 * @param margin   breathing room as a multiplier; 1 leaves nothing spare
 */
export function frameBox(
  box: BoxSize,
  aspect: number,
  fovDeg: number,
  direction: Direction,
  margin = 1.2,
): Frame {
  const safeMargin = Math.max(1, margin);
  const d = normalize(direction);
  const { width: w, height: h, depth: dep, yMin = 0 } = box;

  const target: [number, number, number] = [0, yMin + h / 2, 0];

  // `d` points from the target OUT to the camera. The camera's forward axis
  // points the other way — from the camera towards what it is looking at.
  const basis = basisFrom([-d[0], -d[1], -d[2]]);

  const fovV = (fovDeg * Math.PI) / 180;
  // Horizontal FOV follows from the vertical one and the aspect ratio.
  const tanV = Math.tan(fovV / 2);
  const tanH = tanV * Math.max(aspect, 0.01);
  const fovH = 2 * Math.atan(tanH);

  /* A starting estimate: the half-extents of the box measured along the
   * camera's own right and up axes, so a box seen corner-on is not cropped
   * sideways. That is a good estimate for a shallow viewing angle and a poor
   * one from directly above, because it ignores how much nearer the front of
   * the box is than its centre — which magnifies it on screen. */
  const yaw = Math.atan2(d[0], d[2]);
  const pitch = Math.asin(d[1]);

  const halfRight = (w / 2) * Math.abs(Math.cos(yaw)) + (dep / 2) * Math.abs(Math.sin(yaw));
  const halfUp =
    (w / 2) * Math.abs(Math.sin(pitch) * Math.sin(yaw)) +
    (h / 2) * Math.abs(Math.cos(pitch)) +
    (dep / 2) * Math.abs(Math.sin(pitch) * Math.cos(yaw));

  let distance = Math.max(distanceFor(halfUp, fovV), distanceFor(halfRight, fovH));
  distance = Math.max(distance, 1);

  /* Then check every corner for real and pull back until it genuinely fits.
   *
   * Multiplying by the worst overshoot is exact rather than a search: the
   * projected size of a point shrinks monotonically as the camera backs away,
   * so this converges in a couple of rounds. The cap stops a pathological
   * input from spinning. */
  const corners: Array<[number, number, number]> = [];
  for (const x of [-w / 2, w / 2]) {
    for (const y of [yMin, yMin + h]) {
      for (const z of [-dep / 2, dep / 2]) corners.push([x, y, z]);
    }
  }

  for (let round = 0; round < 24; round++) {
    const position: [number, number, number] = [
      target[0] + d[0] * distance,
      target[1] + d[1] * distance,
      target[2] + d[2] * distance,
    ];

    let worst = 0;
    for (const corner of corners) {
      worst = Math.max(worst, overshoot(corner, position, basis, tanV, tanH, safeMargin));
    }

    if (worst <= 1) break;
    distance *= worst;
  }

  const position: [number, number, number] = [
    target[0] + d[0] * distance,
    target[1] + d[1] * distance,
    target[2] + d[2] * distance,
  ];

  return { position, target };
}

/** Total height of a building in metres. */
export function buildingHeight(b: { floors: number; floorHeightM: number }): number {
  return b.floors * b.floorHeightM;
}
