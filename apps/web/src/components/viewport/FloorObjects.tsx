import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { FloorContentItem } from '@/lib/floorScene';

/* =========================================================================
   Instanced floor objects
   -------------------------------------------------------------------------
   The cutaway view draws up to six objects on every floor, and a 20-storey
   building would otherwise add a hundred-odd meshes and draw calls. One
   InstancedMesh per floor keeps that to a single call; the objects differ only
   in position, size and rotation, so a unit box and a matrix per instance is
   enough.

   The unit geometry is shared by every floor and owned by the caller, which
   disposes it when the building's footprint changes.
   ========================================================================= */

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function FloorObjects({
  items,
  geometry,
  color,
  opacity = 1,
}: {
  items: FloorContentItem[];
  geometry: THREE.BufferGeometry;
  color: string;
  opacity?: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color,
        transparent: opacity < 1,
        opacity,
      }),
    [color, opacity],
  );

  // Materials are created here rather than by JSX so the same one can be given
  // to the InstancedMesh constructor. Dispose it when the colour changes.
  useLayoutEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const instance = mesh.current;
    if (!instance) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    items.forEach((item, index) => {
      position.set(...item.position);
      quaternion.setFromAxisAngle(Y_AXIS, item.rotationY);
      scale.set(...item.size);
      matrix.compose(position, quaternion, scale);
      instance.setMatrixAt(index, matrix);
    });

    instance.instanceMatrix.needsUpdate = true;
    instance.count = items.length;
  }, [items]);

  if (items.length === 0) return null;

  return <instancedMesh ref={mesh} args={[geometry, material, items.length]} />;
}
