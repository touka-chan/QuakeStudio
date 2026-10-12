import { describe, expect, it } from 'vitest';

import { buildingHeight, frameBox, type BoxSize } from '@/lib/camera';

/* ==========================================================================
   Camera framing.

   The property that matters is simple: after framing, nothing is cropped.
   The bug this file exists to prevent is subtle and was invisible in every
   other test — a taller building running off the top of the canvas, and a
   blank scene. Both looked like "the 3D view" to a casual reader.
   ========================================================================== */

/** Corners of an axis-aligned box with its base at `yMin`. */
function corners(box: BoxSize): Array<[number, number, number]> {
  const { width: w, height: h, depth: d, yMin = 0 } = box;
  const xs = [-w / 2, w / 2];
  const ys = [yMin, yMin + h];
  const zs = [-d / 2, d / 2];
  const out: Array<[number, number, number]> = [];
  for (const x of xs) for (const y of ys) for (const z of zs) out.push([x, y, z]);
  return out;
}

/**
 * Project a point into the camera's own axes and report whether it lands
 * inside the frustum.
 *
 * Done by hand rather than with Three.js so the geometry being checked is
 * visible: view space puts the camera at the origin looking down −Z.
 */
function insideFrustum(
  point: [number, number, number],
  position: [number, number, number],
  target: [number, number, number],
  fovDeg: number,
  aspect: number,
): boolean {
  // Camera basis. Forward is target − position; right is forward × world-up.
  const f: [number, number, number] = [
    target[0] - position[0],
    target[1] - position[1],
    target[2] - position[2],
  ];
  const flen = Math.hypot(...f);
  const forward: [number, number, number] = [f[0] / flen, f[1] / flen, f[2] / flen];

  const worldUp: [number, number, number] = [0, 1, 0];
  // right = forward × up
  const right: [number, number, number] = [
    forward[1] * worldUp[2] - forward[2] * worldUp[1],
    forward[2] * worldUp[0] - forward[0] * worldUp[2],
    forward[0] * worldUp[1] - forward[1] * worldUp[0],
  ];
  const rlen = Math.hypot(...right) || 1;
  right[0] /= rlen;
  right[1] /= rlen;
  right[2] /= rlen;

  // up = right × forward
  const up: [number, number, number] = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];

  const d: [number, number, number] = [
    point[0] - position[0],
    point[1] - position[1],
    point[2] - position[2],
  ];

  // Depth measured ALONG the view direction, so a point in front is positive.
  // (OpenGL view space would make this negative; keeping it positive here
  // avoids a sign flip that silently rejects every visible point.)
  const depth = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
  const xView = d[0] * right[0] + d[1] * right[1] + d[2] * right[2];
  const yView = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];

  if (depth <= 0) return false; // behind the camera

  const tanV = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  const tanH = tanV * aspect;

  return Math.abs(xView) <= tanH * depth && Math.abs(yView) <= tanV * depth;
}

const FOV = 45;
const ASPECT = 1440 / 900;

/** Direct the camera from a few angles, including the near-frontal one. */
const DIRECTIONS: Array<[string, [number, number, number]]> = [
  ['three-quarter', [0.62, 0.48, 0.72]],
  ['near-frontal', [0.2, 0.38, 0.9]],
  ['straight on', [0, 0.5, 1]],
  ['from above', [0.3, 1, 0.4]],
  ['from below', [0.3, -0.4, 1]],
];

describe('frameBox', () => {
  it.each(DIRECTIONS)('fits a 20-storey tower from %s', (_label, direction) => {
    const box: BoxSize = { width: 14, height: 60, depth: 10 };
    const { position, target } = frameBox(box, ASPECT, FOV, direction);

    for (const corner of corners(box)) {
      expect(insideFrustum(corner, position, target, FOV, ASPECT)).toBe(true);
    }
  });

  it.each(DIRECTIONS)('fits a 4-storey house from %s', (_label, direction) => {
    const box: BoxSize = { width: 9, height: 10, depth: 8 };
    const { position, target } = frameBox(box, ASPECT, FOV, direction);

    for (const corner of corners(box)) {
      expect(insideFrustum(corner, position, target, FOV, ASPECT)).toBe(true);
    }
  });

  it('fits a wide pair side by side, which is the comparison case', () => {
    // Two 14 m buildings with a 4.9 m gap: the exact shape that was cropped.
    const box: BoxSize = { width: 14 + 4.9 + 14, height: 30, depth: 10 };
    const { position, target } = frameBox(box, ASPECT, FOV, [0.2, 0.38, 0.9]);

    for (const corner of corners(box)) {
      expect(insideFrustum(corner, position, target, FOV, ASPECT)).toBe(true);
    }
  });

  it('looks at the middle of the box', () => {
    const box: BoxSize = { width: 14, height: 30, depth: 10 };
    const { target } = frameBox(box, ASPECT, FOV, [0, 0.5, 1]);

    expect(target[0]).toBeCloseTo(0, 6);
    expect(target[1]).toBeCloseTo(15, 6); // half of 30, sitting on the ground
    expect(target[2]).toBeCloseTo(0, 6);
  });

  it('backs off further as the building gets taller', () => {
    const short = frameBox({ width: 14, height: 10, depth: 10 }, ASPECT, FOV, [0, 0.5, 1]);
    const tall = frameBox({ width: 14, height: 60, depth: 10 }, ASPECT, FOV, [0, 0.5, 1]);

    const distanceOf = (f: { position: [number, number, number] }) =>
      Math.hypot(...f.position);

    expect(distanceOf(tall)).toBeGreaterThan(distanceOf(short));
  });

  it('uses the horizontal field of view on a narrow canvas', () => {
    const box: BoxSize = { width: 40, height: 20, depth: 10 };
    const wide = frameBox(box, 2, FOV, [0, 0.4, 1]);
    const narrow = frameBox(box, 0.5, FOV, [0, 0.4, 1]);

    const distanceOf = (f: { position: [number, number, number] }) => Math.hypot(...f.position);

    // A narrow canvas has a smaller horizontal field of view, so it must pull
    // back further to keep the same width in shot.
    expect(distanceOf(narrow)).toBeGreaterThan(distanceOf(wide));
  });

  it('leaves breathing room at the default margin', () => {
    const box: BoxSize = { width: 14, height: 30, depth: 10 };
    const tight = frameBox(box, ASPECT, FOV, [0, 0.5, 1], 1);
    const roomy = frameBox(box, ASPECT, FOV, [0, 0.5, 1], 1.4);

    const distanceOf = (f: { position: [number, number, number] }) => Math.hypot(...f.position);

    expect(distanceOf(roomy)).toBeGreaterThan(distanceOf(tight));
    // ...and even at margin 1 the box still fits.
    for (const corner of corners(box)) {
      expect(insideFrustum(corner, tight.position, tight.target, FOV, ASPECT)).toBe(true);
    }
  });

  it('accepts a direction that is not normalised', () => {
    const box: BoxSize = { width: 14, height: 30, depth: 10 };
    const unit = frameBox(box, ASPECT, FOV, [0, 0.5, 1], 1.2);
    const scaled = frameBox(box, ASPECT, FOV, [0, 25, 50], 1.2);

    expect(scaled.position[0]).toBeCloseTo(unit.position[0], 6);
    expect(scaled.position[2]).toBeCloseTo(unit.position[2], 6);
  });
});

describe('buildingHeight', () => {
  it('is floors times storey height', () => {
    expect(buildingHeight({ floors: 5, floorHeightM: 3 })).toBe(15);
    expect(buildingHeight({ floors: 20, floorHeightM: 3.5 })).toBe(70);
  });
});