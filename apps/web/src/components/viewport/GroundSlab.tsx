import { VIEWPORT } from '@/config/engineeringAssumptions';
import { slabExtentM, slabGridDivisions } from '@/lib/sceneScale';
import { useCssVar } from '@/lib/useCssVar';

/* =========================================================================
   Ground slab and grid
   -------------------------------------------------------------------------
   The ground the buildings stand on. Its job is to give them somewhere to
   stand: without it the towers float, and the eye reads them as hovering.

   SIZED TO WHAT STANDS ON IT, NOT TO ONE BUILDING
   It used to measure itself from building A alone — twice its widest dimension,
   clamped between 30 and 90 metres. That was right when there was only ever one
   building. With four in a line the row runs past 200 metres and A is 14, so the
   slab ended up under the first two buildings and the last two stood on nothing
   at all, with the grid lines stopping in mid-air between them.

   The caller passes the footprint it actually needs covered and the arithmetic
   lives in `lib/sceneScale.ts`, which is a plain module with no React in it —
   so "does the slab cover the whole row" is a question that can be asked rather
   than squinted at in a screenshot.
   ========================================================================= */

export function GroundSlab({
  widthM,
  depthM,
}: {
  /** Footprint to cover, in metres. */
  widthM: number;
  depthM: number;
}) {
  const slabColor = useCssVar('--ground-slab');
  const gridColor = useCssVar('--grid-line');

  const extent = slabExtentM(widthM, depthM);
  const divisions = slabGridDivisions(extent, VIEWPORT.defaultGridDivisions);

  return (
    <group>
      <mesh position={[0, -VIEWPORT.groundThicknessM / 2, 0]} receiveShadow>
        <boxGeometry args={[extent, VIEWPORT.groundThicknessM, extent]} />
        <meshLambertMaterial color={slabColor} />
      </mesh>

      {/* Grid at ~30% opacity so it reads as reference, not as content. */}
      <gridHelper args={[extent, divisions, gridColor, gridColor]} position={[0, 0.002, 0]}>
        <lineBasicMaterial attach="material" color={gridColor} transparent opacity={0.3} />
      </gridHelper>
    </group>
  );
}
