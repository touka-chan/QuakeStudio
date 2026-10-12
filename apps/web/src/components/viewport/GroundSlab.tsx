import { useMemo } from 'react';

import { VIEWPORT } from '@/config/engineeringAssumptions';
import { useCssVar } from '@/lib/useCssVar';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Ground slab and grid
   -------------------------------------------------------------------------
   Sized generously relative to the building so the model never floats at the
   edge of the visible ground, at any floor count.
   ========================================================================= */

export function GroundSlab() {
  const building = useConfigStore((s) => s.building);
  const slabColor = useCssVar('--ground-slab');
  const gridColor = useCssVar('--grid-line');

  const extent = useMemo(() => {
    const span = Math.max(building.widthM, building.depthM) * 2.4;
    return Math.max(30, Math.min(90, span));
  }, [building.widthM, building.depthM]);

  const gridDivisions = VIEWPORT.defaultGridDivisions;

  return (
    <group>
      <mesh position={[0, -VIEWPORT.groundThicknessM / 2, 0]} receiveShadow>
        <boxGeometry args={[extent, VIEWPORT.groundThicknessM, extent]} />
        <meshLambertMaterial color={slabColor} />
      </mesh>

      {/* Grid at ~15% opacity so it reads as reference, not as content. */}
      <gridHelper args={[extent, gridDivisions, gridColor, gridColor]} position={[0, 0.002, 0]}>
        <lineBasicMaterial attach="material" color={gridColor} transparent opacity={0.3} />
      </gridHelper>
    </group>
  );
}
