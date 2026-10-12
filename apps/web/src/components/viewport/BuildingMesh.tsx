import { useMemo } from 'react';
import * as THREE from 'three';

import { useCssVar } from '@/lib/useCssVar';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Building mesh — a stack of boxes, one per floor.
   -------------------------------------------------------------------------
   Phase 1 is static geometry: the shape responds to the sliders, but nothing
   moves yet. Motion arrives in Phase 3.

   Each floor is its own mesh rather than one merged geometry, so a floor can
   be hovered, selected and colour-coded independently later without
   restructuring the scene.

   Colour note: WebGL cannot read CSS variables, so the drift token is resolved
   to a concrete hex by useCssVar. From Phase 3 this comes from that floor's
   interstory drift ratio; in Phase 1 every floor takes the same band because
   there are no results to colour by yet.
   ========================================================================= */

const SIDE_FACTOR = 0.8; // side faces are the darker shade of each band

export function BuildingMesh() {
  const building = useConfigStore((s) => s.building);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const setActiveFloor = useConfigStore((s) => s.setActiveFloor);

  const driftColor = useCssVar('--drift-2');
  const sideColor = useCssVar('--drift-2-side');
  const undeformed = useCssVar('--undeformed');
  const selection = useCssVar('--selection');

  const { widthM, depthM, floorHeightM, floors } = building;

  // Leave a small gap between storeys so the stack reads as floors, not a block.
  const slabHeight = floorHeightM * 0.86;
  const totalHeight = floors * floorHeightM;

  const geometries = useMemo(() => {
    const box = new THREE.BoxGeometry(widthM, slabHeight, depthM);
    const outline = new THREE.EdgesGeometry(box);
    const restOutline = new THREE.EdgesGeometry(new THREE.BoxGeometry(widthM, totalHeight, depthM));
    return { box, outline, restOutline };
  }, [widthM, depthM, slabHeight, totalHeight]);

  const yFor = (floorIndex: number) => floorIndex * floorHeightM + slabHeight / 2;

  return (
    <group>
      {/* Where the building would sit if it were completely rigid. */}
      <lineSegments geometry={geometries.restOutline}>
        <lineBasicMaterial color={undeformed} transparent opacity={0.5} />
      </lineSegments>

      {Array.from({ length: floors }, (_, index) => {
        const floor = index + 1;
        const isActive = activeFloor === floor;

        return (
          <group key={floor} position={[0, yFor(index), 0]}>
            <mesh
              geometry={geometries.box}
              onClick={(event) => {
                event.stopPropagation();
                setActiveFloor(isActive ? null : floor);
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                document.body.style.cursor = 'auto';
              }}
            >
              <meshLambertMaterial
                color={driftColor}
                emissive={isActive ? selection : '#000000'}
                emissiveIntensity={isActive ? 0.3 : 0}
              />
            </mesh>

            {/* Side faces use the darker shade of the same band. */}
            <lineSegments geometry={geometries.outline}>
              <lineBasicMaterial color={isActive ? selection : sideColor} />
            </lineSegments>
          </group>
        );
      })}
    </group>
  );
}

export { SIDE_FACTOR };
