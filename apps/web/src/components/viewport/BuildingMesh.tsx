import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { LOAD_ASSUMPTIONS } from '@/config/engineeringAssumptions';
import { normalizeFloorLoads } from '@/config/floorLoads';
import { driftBand } from '@/lib/driftScale';
import { floorContents, SLAB_THICKNESS_M, storyColumns } from '@/lib/floorScene';
import { sampleDisplacement } from '@/lib/time';
import { useCssVar, useCssVars } from '@/lib/useCssVar';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { useUiStore } from '@/store/uiStore';
import { FloorObjects } from './FloorObjects';
import { CarGroup } from './CarGroup';

/* =========================================================================
   Building mesh — a stack of floors that sway.
   -------------------------------------------------------------------------
   TWO READS OF THE SAME BUILDING

     Solid    the floor is a full-height box: the building as a mass.
     Cutaway  the floor is a 0.22 m slab on four corner columns, with the
              objects that belong to its use on top.

   OCCUPANCY IS THE BASE COLOUR, DRIFT IS THE SECONDARY CUE
   Before floor loads, a floor was coloured by its story drift. That made the
   3D view answer one question. Now a floor also has a use, and the use is the
   thing the student chose and can change. So the slab takes the use tint, and
   the drift colour moves to its outline: still visible, still on the same
   scale as the chart, but no longer the only thing the eye can read.

   The animation reads playback time inside `useFrame` and writes straight to
   each floor group's transform. It never calls setState, so a 60 fps animation
   causes zero React renders. Both the chart cursor and this view sample
   displacement from the same `result.floorDisp` array.
   ========================================================================= */

export function BuildingMesh() {
  const building = useConfigStore((s) => s.building);
  const result = useConfigStore((s) => s.result);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const setActiveFloor = useConfigStore((s) => s.setActiveFloor);
  const cutaway = useUiStore((s) => s.cutaway);

  const palette = useCssVars([
    '--undeformed',
    '--selection',
    '--drift-1',
    '--drift-2',
    '--drift-3',
    '--drift-4',
    '--drift-5',
    '--load-office',
    '--load-residential',
    '--load-parking',
    '--load-storage',
    '--load-custom',
    '--content',
  ]);

  const hoverLabel = useCssVar('--text');

  const floorRefs = useRef<(THREE.Group | null)[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  const { widthM, depthM, floorHeightM, floors } = building;
  // The switch decides what the picture shows as well as what the engine
  // counts: with loads off there is no use to draw, and the slab stops
  // wearing the use tint, so the 3D says "bare structure" automatically.
  const loadsOn = building.loadsEnabled !== false;
  const loads = useMemo(
    () => normalizeFloorLoads(floors, building.floorLoads),
    [floors, building.floorLoads],
  );

  // The solid shell is nearly a full storey; the cutaway slab is a real slab.
  const slabHeight = cutaway ? SLAB_THICKNESS_M : floorHeightM * 0.86;
  const totalHeight = floors * floorHeightM;

  const geometries = useMemo(() => {
    const box = new THREE.BoxGeometry(widthM, slabHeight, depthM);
    const outline = new THREE.EdgesGeometry(box);
    const restOutline = new THREE.EdgesGeometry(new THREE.BoxGeometry(widthM, totalHeight, depthM));
    // One unit box serves every object and every column on every floor.
    const unit = new THREE.BoxGeometry(1, 1, 1);
    return { box, outline, restOutline, unit };
  }, [widthM, depthM, slabHeight, totalHeight]);

  useLayoutEffect(() => {
    return () => {
      geometries.box.dispose();
      geometries.outline.dispose();
      geometries.restOutline.dispose();
      geometries.unit.dispose();
    };
  }, [geometries]);

  // Occupancy tint per floor — while the loads are counted. With the switch
  // off, no use is counted, so no slab wears a use colour: the bare structure
  // takes the undeformed colour, the one that already means "at rest".
  const slabColors = useMemo(
    () =>
      loads.map((load) =>
        loadsOn
          ? (palette[`--load-${load.occupancy}`] ?? palette['--load-office'] ?? '#dbeafe')
          : (palette['--undeformed'] ?? '#dbeafe'),
      ),
    [loadsOn, loads, palette],
  );

  // Drift on the outline, so it survives alongside the occupancy tint.
  const driftColors = useMemo(
    () =>
      Array.from({ length: floors }, (_, index) => {
        const drift = result.driftRatio[index] ?? 0;
        return palette[driftBand(drift).token] ?? palette['--drift-2'];
      }),
    [floors, result, palette],
  );

  useFrame(() => {
    const time = usePlaybackStore.getState().time;
    const exaggeration = usePlaybackStore.getState().exaggeration;

    for (let index = 0; index < floors; index++) {
      const group = floorRefs.current[index];
      if (!group) continue;

      const displacementM = sampleDisplacement(result.floorDisp, result.time, index, time);
      // Metres to scene units, magnified so a millimetre-scale movement is
      // actually visible. The NUMBERS on screen stay unscaled.
      group.position.x = displacementM * exaggeration;
    }
  });

  const yFor = (floorIndex: number) => floorIndex * floorHeightM + slabHeight / 2;

  return (
    <group>
      {/* Where the building would sit if it were completely rigid. */}
      <lineSegments geometry={geometries.restOutline}>
        <lineBasicMaterial color={palette['--undeformed']} transparent opacity={0.5} />
      </lineSegments>

      {Array.from({ length: floors }, (_, index) => {
        const floor = index + 1;
        const isActive = activeFloor === floor;
        const isHovered = hovered === floor;
        const load = loads[index];
        const occupancyLabel =
          load && loadsOn
            ? LOAD_ASSUMPTIONS.occupancies[load.occupancy].label
            : 'Bare structure (loads off)';

        return (
          <group
            key={floor}
            position={[0, yFor(index), 0]}
            ref={(node) => {
              floorRefs.current[index] = node;
            }}
          >
            <mesh
              geometry={geometries.box}
              onClick={(event) => {
                event.stopPropagation();
                setActiveFloor(isActive ? null : floor);
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHovered(floor);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHovered(null);
                document.body.style.cursor = 'auto';
              }}
            >
              <meshLambertMaterial
                color={slabColors[index]}
                emissive={isActive ? palette['--selection'] : '#000000'}
                emissiveIntensity={isActive ? 0.35 : 0}
              />
            </mesh>

            <lineSegments geometry={geometries.outline}>
              <lineBasicMaterial color={isActive ? palette['--selection'] : driftColors[index]} />
            </lineSegments>

            {cutaway && load && loadsOn ? (
              load.occupancy === 'parking' ? (
                <CarGroup
                  items={floorContents(load.occupancy, widthM, depthM)}
                  color={palette['--load-parking'] ?? '#3b82f6'}
                />
              ) : (
                <FloorObjects
                  items={floorContents(load.occupancy, widthM, depthM)}
                  geometry={geometries.unit}
                  color={palette['--content'] ?? '#64748b'}
                />
              )
            ) : null}
            {/*
             * The columns are structure, not loads: they keep drawing in
             * cutaway even while the loads are off, which is exactly what a
             * bare building is — slabs and columns, no use inside.
             */}
            {cutaway && index > 0 ? (
              <FloorObjects
                items={storyColumns(widthM, depthM, floorHeightM)}
                geometry={geometries.unit}
                color={palette['--content'] ?? '#64748b'}
                opacity={0.55}
              />
            ) : null}

            {/* Hover readout. Rendered as 3D text so it follows the cursor. */}
            {isHovered ? (
              <FloorCallout
                floor={floor}
                useLabel={occupancyLabel}
                width={widthM}
                color={hoverLabel}
                peakMm={(result.peakDisp[index] ?? 0) * 1000}
                driftPct={(result.driftRatio[index] ?? 0) * 100}
              />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Hover readout for one floor.
 *
 * Shows the use and the numbers, not just the colour — a student must never
 * have to interpret a hue to find out what happened.
 */
function FloorCallout({
  floor,
  useLabel,
  width,
  color,
  peakMm,
  driftPct,
}: {
  floor: number;
  useLabel: string;
  width: number;
  color: string;
  peakMm: number;
  driftPct: number;
}) {
  return (
    <Html position={[width * 0.62, 0, 0]} center distanceFactor={18} zIndexRange={[40, 0]}>
      <div
        className="pointer-events-none min-w-44 rounded-app border border-line bg-surface px-3 py-2 text-xs shadow-lg"
        style={{ color }}
      >
        <p className="font-semibold">
          Floor {floor}
          {floor === 1 ? ' (ground floor)' : ''} · {useLabel}
        </p>
        <p className="font-mono-nums mt-1">
          Peak {peakMm.toFixed(1)} mm
          <br />
          Story drift {driftPct.toFixed(2)} %
        </p>
      </div>
    </Html>
  );
}
