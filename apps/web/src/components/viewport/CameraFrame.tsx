import { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';

import { frameBox, type BoxSize } from '@/lib/camera';

/* =========================================================================
   CameraFrame
   -------------------------------------------------------------------------
   Applies a computed camera position and look-at point to the scene, and keeps
   them in step when the box or the canvas changes.

   This replaces drei's <Bounds>, which silently stops framing as soon as an
   <OrbitControls makeDefault> is present. See `lib/camera.ts` for the whole
   story.

   Everything it needs arrives as primitives, because the effect compares them
   by value: passing a freshly-built object each render would re-run it on
   every frame and fight the user's orbiting.
   ========================================================================= */

/**
 * The two members CameraFrame needs from whatever controls R3F has made
 * default.
 *
 * `state.controls` is typed as a bare EventDispatcher, because the precise
 * type depends on which controls package is installed. Narrowing to the members
 * actually used keeps this file free of that coupling — and if the installed
 * controls ever stop providing them, this is where it fails, loudly.
 */
type FrameableControls = {
  target: { set: (x: number, y: number, z: number) => void };
  update: () => void;
};

function asFrameable(controls: unknown): FrameableControls | null {
  if (controls === null || typeof controls !== 'object') return null;
  const candidate = controls as Partial<FrameableControls>;
  if (!candidate.target || typeof candidate.update !== 'function') return null;
  return candidate as FrameableControls;
}

export function CameraFrame({
  width,
  height,
  depth,
  directionX,
  directionY,
  directionZ,
  margin = 1.2,
}: BoxSize & {
  directionX: number;
  directionY: number;
  directionZ: number;
  margin?: number;
}) {
  const camera = useThree((s) => s.camera);
  const rawControls = useThree((s) => s.controls);
  const canvasWidth = useThree((s) => s.size.width);
  const canvasHeight = useThree((s) => s.size.height);

  // `useMemo` so the effect below is not re-run on every render: `controls`
  // changes identity whenever the component re-renders, which would undo the
  // user's orbit on every frame.
  const controls = useMemo(() => asFrameable(rawControls), [rawControls]);

  useLayoutEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const aspect = canvasWidth / Math.max(1, canvasHeight);

    const { position, target } = frameBox(
      { width, height, depth },
      aspect,
      perspective.fov,
      [directionX, directionY, directionZ],
      margin,
    );

    camera.position.set(position[0], position[1], position[2]);

    if (controls) {
      controls.target.set(target[0], target[1], target[2]);
      // OrbitControls recomputes the camera from its own target, so it has to
      // be told about the new one before the next frame is drawn.
      controls.update();
    } else {
      camera.lookAt(target[0], target[1], target[2]);
    }
  }, [
    camera,
    controls,
    canvasWidth,
    canvasHeight,
    width,
    height,
    depth,
    directionX,
    directionY,
    directionZ,
    margin,
  ]);

  return null;
}
