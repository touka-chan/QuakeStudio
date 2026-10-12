import { Bounds } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';

import { useCssVar } from '@/lib/useCssVar';
import { useConfigStore } from '@/store/configStore';
import { BuildingMesh } from './BuildingMesh';
import { GroundSlab } from './GroundSlab';
import { ShakeArrow } from './ShakeArrow';

/* =========================================================================
   3D viewport — the centre zone.
   -------------------------------------------------------------------------
   The camera frames the whole building without the user having to zoom out and
   re-orient. A hard-coded camera distance works for one building and is wrong
   for every other one, so drei's <Bounds> fits the actual bounding box — from a
   4-floor house to a 20-floor tower alike — and re-fits whenever the shape
   changes.

   The bounds are keyed on the building's dimensions, so dragging a slider
   re-frames. It does NOT re-fit on every render, so the user keeps their orbit
   angle while adjusting values.
   ========================================================================= */

export function Viewport() {
  const building = useConfigStore((s) => s.building);
  const viewportBg = useCssVar('--viewport-bg');

  // Re-fit only when the building's overall proportions change.
  const boundsKey = useMemo(
    () => `${building.floors}:${building.widthM}:${building.depthM}:${building.floorHeightM}`,
    [building.floors, building.widthM, building.depthM, building.floorHeightM],
  );

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ backgroundColor: viewportBg }}>
      <Canvas
        camera={{ position: [26, 20, 30], fov: 45, near: 0.1, far: 500 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        aria-label="3D view of the building. Drag to orbit, scroll to zoom."
      >
        <hemisphereLight args={['#ffffff', '#94a3b8', 1.15]} />
        <directionalLight position={[24, 34, 18]} intensity={1.4} />
        <directionalLight position={[-16, 12, -12]} intensity={0.3} />

        <Bounds fit clip observe margin={1.35} key={boundsKey}>
          <SceneContent />
        </Bounds>
      </Canvas>

      <ViewportHints />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Everything that gets framed. Grouped so <Bounds> measures the building
 * itself plus its arrow, and not the (deliberately oversized) ground slab —
 * fitting to the slab would push the camera so far back that a 20-storey tower
 * becomes a thin line.
 */
function SceneContent() {
  const building = useConfigStore((s) => s.building);

  return (
    <>
      <group>
        <BuildingMesh />
        <ShakeArrow widthM={building.widthM} depthM={building.depthM} />
      </group>
      <GroundSlab />
    </>
  );
}

/* ------------------------------------------------------------------------- */

function ViewportHints() {
  const building = useConfigStore((s) => s.building);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const setActiveFloor = useConfigStore((s) => s.setActiveFloor);
  const shakingLabelColor = useCssVar('--shaking-arrow-label');

  return (
    <>
      {/* Hidden on narrow screens: at 360px the two top chips overlapped, and the
            orbit hint is a nicety, not information. */}
      <div className="pointer-events-none absolute top-3 right-3 hidden sm:block">
        <Chip>Drag to orbit · scroll to zoom</Chip>
      </div>

      {/* Top-left stack: which building, and the floor-selection control. */}
      <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
        <Chip>
          {building.floors}-story {building.material} · {building.frameType} frame
        </Chip>
        <button
          type="button"
          onClick={() => setActiveFloor(null)}
          className="rounded-app border border-line bg-surface/90 px-2.5 py-1 text-xs backdrop-blur hover:bg-surface-2"
        >
          {activeFloor === null ? 'Whole building' : `Floor ${activeFloor} selected — clear`}
        </button>
      </div>

      {/* Caption for the arrow, in the accent-yellow the arrow itself uses.
          Sits alone at the bottom centre — at 360px it collided with the
          floor control when both were pinned to the bottom edge. */}
      <p
        className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface/90 px-3 py-1 text-xs font-semibold backdrop-blur"
        style={{ color: shakingLabelColor }}
      >
        Ground shaking (left ↔ right)
      </p>
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line bg-surface/85 px-3 py-1 text-xs backdrop-blur">
      {children}
    </span>
  );
}
