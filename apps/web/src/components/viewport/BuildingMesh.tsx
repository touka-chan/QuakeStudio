import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { sampleDisplacement } from '@/lib/time';
import { useCssVar, useCssVars } from '@/lib/useCssVar';
import { driftBand } from '@/lib/driftScale';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';

/* =========================================================================
   Building mesh — a stack of boxes, one per floor.
   -------------------------------------------------------------------------
   PHASE 3: floors now SWAY. The animation reads playback time inside
   `useFrame` and writes straight to each floor group's transform. It never
   calls setState, so a 60 fps animation causes zero React renders — that is
   what keeps 20 floors at 60 fps.

   Both the chart cursor and this view sample displacement from the SAME
   `result.floorDisp` array via `sampleDisplacement`, so they cannot drift
   apart. There is no second copy of the response anywhere.

   Drift colouring: each floor is coloured by its interstory drift ratio
   through the shared magnitude-map scale. The value is also printed in the
   hover tooltip and on the chart, so colour is never the only cue.
   ========================================================================= */

const SIDE_DARKEN = 0.8;

export function BuildingMesh() {
  const building = useConfigStore((s) => s.building);
  const result = useConfigStore((s) => s.result);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const setActiveFloor = useConfigStore((s) => s.setActiveFloor);

  const palette = useCssVars([
    '--undeformed',
    '--selection',
    '--drift-1',
    '--drift-2',
    '--drift-3',
    '--drift-4',
    '--drift-5',
  ]);

  const hoverLabel = useCssVar('--text');

  const floorRefs = useRef<(THREE.Group | null)[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  const { widthM, depthM, floorHeightM, floors } = building;
  const slabHeight = floorHeightM * 0.86;
  const totalHeight = floors * floorHeightM;

  const geometries = useMemo(() => {
    const box = new THREE.BoxGeometry(widthM, slabHeight, depthM);
    const outline = new THREE.EdgesGeometry(box);
    const restOutline = new THREE.EdgesGeometry(new THREE.BoxGeometry(widthM, totalHeight, depthM));
    return { box, outline, restOutline };
  }, [widthM, depthM, slabHeight, totalHeight]);

  useLayoutEffect(() => {
    return () => {
      geometries.box.dispose();
      geometries.outline.dispose();
      geometries.restOutline.dispose();
    };
  }, [geometries]);

  // Colour per floor. Recomputed only when the result changes — not per frame.
  const floorColors = useMemo(
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
                color={floorColors[index]}
                emissive={isActive ? palette['--selection'] : '#000000'}
                emissiveIntensity={isActive ? 0.35 : 0}
              />
            </mesh>

            <lineSegments geometry={geometries.outline}>
              <lineBasicMaterial
                color={isActive ? palette['--selection'] : darken(floorColors[index]!)}
              />
            </lineSegments>

            {/* Hover readout. Rendered as 3D text so it follows the cursor. */}
            {isHovered ? (
              <FloorCallout
                floor={floor}
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

/** Multiply an RGB hex by a factor, for the darker side-face shade. */
function darken(hex: string, factor = SIDE_DARKEN): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1]!, 16);
  const r = Math.round(((value >> 16) & 0xff) * factor);
  const g = Math.round(((value >> 8) & 0xff) * factor);
  const b = Math.round((value & 0xff) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Hover readout for one floor.
 *
 * Shows the numbers, not just the colour — a student must never have to
 * interpret a hue to find out what happened.
 */
function FloorCallout({
  floor,
  width,
  color,
  peakMm,
  driftPct,
}: {
  floor: number;
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
          {floor === 1 ? ' (ground floor)' : ''}
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
