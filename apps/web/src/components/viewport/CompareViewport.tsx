import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { buildingHeight } from '@/lib/camera';
import { describeBuilding } from '@/lib/describeBuilding';
import { driftBand } from '@/lib/driftScale';
import { useCssVar, useCssVars } from '@/lib/useCssVar';
import { sampleDisplacement } from '@/lib/time';
import { useCompareStore } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';
import type { BuildingConfig } from '@/types';
import { CameraFrame } from './CameraFrame';
import { GroundSlab } from './GroundSlab';
import { ShakeArrow } from './ShakeArrow';

/* =========================================================================
   Comparison viewport
   -------------------------------------------------------------------------
   Two presentations of the same pair of buildings:

     • SIDE BY SIDE — A and B on one ground slab, separated along X. Easiest to
       read when the buildings are very different.
     • GHOST OVERLAY — both drawn in the same place, B translucent over A. Best
       for spotting that two differently-shaped buildings happen to sway almost
       the same amount, which side-by-side makes hard to see.

   Both sample displacement from the same playback clock as the single-building
   view, and from each building's own `floorDisp`. There is no second clock.
   ========================================================================= */

export function CompareViewport() {
  const view = useCompareStore((s) => s.view);
  const setView = useCompareStore((s) => s.setView);
  const buildingA = useConfigStore((s) => s.building);
  const buildingB = useConfigStore((s) => s.compareBuilding);

  const viewportBg = useCssVar('--viewport-bg');

  /* What has to fit in the frame, and from where.

   * Side by side, the camera has to hold both buildings AND the gap between
   * them — keying the fit on A alone cropped the taller building off the top.
   * In ghost overlay the two occupy the same space, so only one footprint
   * needs fitting, and the wider of the two counts for both.
   */
  const clearance = Math.max(buildingA.widthM, buildingB.widthM) * 0.35;
  const ghost = view === 'ghost';
  const frameWidth = ghost
    ? Math.max(buildingA.widthM, buildingB.widthM)
    : buildingA.widthM + clearance + buildingB.widthM;
  const frameDepth = Math.max(buildingA.depthM, buildingB.depthM);
  const frameHeight = Math.max(buildingHeight(buildingA), buildingHeight(buildingB));

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ backgroundColor: viewportBg }}>
      <Canvas
        camera={{ position: [13, 24, 54], fov: 45, near: 0.1, far: 500 }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          // Transparent clear colour, so the container's --viewport-bg shows
          // through. Without this the canvas paints opaque WHITE for the
          // frame or two before the scene renders - which reads as a flash
          // of the wrong theme every time the viewport mounts or remounts
          // (switching comparison mode does exactly that).
          alpha: true,
        }}
        // See Viewport.tsx: an aria-label on a roleless element is
        // prohibited, and assistive technology silently drops it.
        role="img"
        aria-label={`3D comparison of two buildings under the same earthquake.
          A: ${describeBuilding(buildingA)}. B: ${describeBuilding(buildingB)}.
          The measured numbers are in the comparison table.`}
      >
        <hemisphereLight args={['#ffffff', '#94a3b8', 1.15]} />
        <directionalLight position={[24, 34, 18]} intensity={1.4} />
        <directionalLight position={[-16, 12, -12]} intensity={0.3} />

        {/* `makeDefault` so <CameraFrame> can set the orbit target along with
              the camera position. */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={12}
          maxDistance={260}
          maxPolarAngle={Math.PI / 2.05}
        />

        {/* Nearly head-on, so the X separation in SideBySide reads as
              left/right on screen. A three-quarter camera put the far building
              in front of the near one — exactly the comparison this view exists
              to make easy — and put them at different distances from the lens,
              so the shorter building looked smaller than it was. */}
        <CameraFrame
          width={frameWidth}
          height={frameHeight}
          depth={frameDepth}
          directionX={0.2}
          directionY={0.38}
          directionZ={0.9}
          margin={1.25}
        />

        {ghost ? <GhostOverlay /> : <SideBySide clearance={clearance} />}

        <ShakeArrow widthM={frameWidth} depthM={frameDepth} />

        {/* Outside the framing on purpose: the slab is deliberately
              oversized, and fitting to it would push the camera so far back
              that a 10-storey tower became a thin line. */}
        <GroundSlab />
      </Canvas>

      <ViewToggle view={view} onChange={setView} />
      <CompareTags
        nameA={describeBuilding(buildingA)}
        nameB={describeBuilding(buildingB)}
        ghost={ghost}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function SideBySide({ clearance }: { clearance: number }) {
  const buildingA = useConfigStore((s) => s.building);
  const buildingB = useConfigStore((s) => s.compareBuilding);

  /* Place the two side by side, adjacent, with the PAIR centred.
   *
   * Placing them symmetrically about the origin instead — A at −gap/2, B at
   * +gap/2 — leaves a large empty stretch whenever the two widths differ
   * much: a 14 m building next to a 40 m one ends up 25 m from anything.
   * Measuring the actual widths and packing them edge to edge keeps the
   * framing stable no matter how different the two are.
   */
  const totalWidth = buildingA.widthM + clearance + buildingB.widthM;
  const leftEdge = -totalWidth / 2;

  return (
    <group>
      <SwayingBuilding
        building={buildingA}
        resultKey="a"
        x={leftEdge + buildingA.widthM / 2}
        tint="a"
      />
      <SwayingBuilding
        building={buildingB}
        resultKey="b"
        x={leftEdge + buildingA.widthM + clearance + buildingB.widthM / 2}
        tint="b"
      />
    </group>
  );
}

function GhostOverlay() {
  const buildingA = useConfigStore((s) => s.building);
  const buildingB = useConfigStore((s) => s.compareBuilding);

  // Subscribed, not `getState()`: reading the store imperatively would render
  // once and never again, so editing a floor would leave the mesh stale.
  return (
    <group>
      <SwayingBuilding building={buildingA} resultKey="a" x={0} tint="a" />
      <SwayingBuilding building={buildingB} resultKey="b" x={0} tint="b" ghost />
    </group>
  );
}

/* ------------------------------------------------------------------------- */

type ResultKey = 'a' | 'b';

/**
 * One building, swaying.
 *
 * `ghost` renders the mesh translucent with depth writing off, so the solid
 * building behind stays readable through it.
 */
function SwayingBuilding({
  building,
  resultKey,
  x,
  tint,
  ghost = false,
}: {
  building: BuildingConfig;
  resultKey: ResultKey;
  x: number;
  tint: ResultKey;
  ghost?: boolean;
}) {
  const result = useConfigStore((s) => (resultKey === 'a' ? s.result : s.resultB));

  /*
   * Floors are coloured by story drift, on the SAME scale the bar chart uses.
   *
   * This used to paint each building a flat A/B colour, on the reasoning that
   * identity outranks the drift scale in a comparison. That was the wrong
   * trade: it left the 3D view speaking a different visual language from the
   * chart beside it, and it made colour useless for the one job comparison
   * exists for. With both buildings on one shared scale, colour IS the
   * comparison — two floors the same colour have the same drift, and you can
   * see which building is worse without reading a single number.
   *
   * A/B identity moves to a label above each building instead of its hue,
   * because position already distinguishes them in Side by side and
   * translucency does it in Ghost overlay.
   */
  const palette = useCssVars(['--drift-1', '--drift-2', '--drift-3', '--drift-4', '--drift-5']);

  const floorRefs = useRef<(THREE.Group | null)[]>([]);
  const floors = building.floors;
  const floorHeightM = building.floorHeightM;

  const floorColors = useMemo(
    () =>
      Array.from({ length: floors }, (_, index) => {
        const drift = result?.driftRatio[index] ?? 0;
        return palette[driftBand(drift).token] ?? palette['--drift-2']!;
      }),
    [floors, result, palette],
  );

  // Identity colour, used for the A/B tag above the building rather than for
  // the floors themselves. Both hooks are called unconditionally — selecting
  // one with a ternary would call a hook conditionally.
  const colorA = useCssVar('--series-a');
  const colorB = useCssVar('--series-b');
  const identityColor = tint === 'a' ? colorA : colorB;
  const slabHeight = floorHeightM * 0.86;

  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(building.widthM, slabHeight, building.depthM);
    return { box, outline: new THREE.EdgesGeometry(box) };
  }, [building.widthM, building.depthM, slabHeight]);

  // Written inline rather than in a shared helper: useFrame mutating Three.js
  // transforms is the point, and keeping it in the component (as BuildingMesh
  // does) avoids passing the ref around.
  useFrame(() => {
    if (!result) return;
    const time = usePlaybackStore.getState().time;
    const exaggeration = usePlaybackStore.getState().exaggeration;
    for (let index = 0; index < floors; index++) {
      const group = floorRefs.current[index];
      if (!group) continue;
      group.position.x =
        sampleDisplacement(result.floorDisp, result.time, index, time) * exaggeration;
    }
  });

  return (
    <group position={[x, 0, 0]}>
      {Array.from({ length: floors }, (_, index) => {
        const y = index * floorHeightM + slabHeight / 2;
        return (
          <group
            key={index}
            position={[0, y, 0]}
            ref={(node) => {
              floorRefs.current[index] = node;
            }}
          >
            <mesh geometry={geometry.box} renderOrder={ghost ? 2 : 0}>
              <meshLambertMaterial
                color={floorColors[index]}
                transparent={ghost}
                opacity={ghost ? 0.32 : 0.85}
                depthWrite={!ghost}
              />
            </mesh>
            <lineSegments geometry={geometry.outline}>
              <lineBasicMaterial
                color={identityColor}
                transparent
                opacity={ghost ? 0.9 : 0.55}
                depthTest={!ghost}
              />
            </lineSegments>
          </group>
        );
      })}
      {/* The A/B tags are a DOM overlay instead of drei <Html> - see CompareTags. */}
    </group>
  );
}

/* ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------- */

/**
 * The A/B tags, which is where identity lives now that both buildings are
 * coloured by drift.
 *
 * These were first drawn inside the 3D scene with drei's `<Html>`, anchored
 * above each building. That was unreliable: with two of them mounted, building
 * A's tag rendered as an EMPTY container while B's rendered fine — same JSX,
 * same component. Rather than ship a label that silently disappears for half
 * the buildings, the tags are ordinary DOM laid over the canvas, the same way
 * the Side by side / Ghost overlay switch already is.
 *
 * The trade is that they no longer track the buildings if you orbit the
 * camera. In exchange they are always on screen, always legible, and readable
 * by a screen reader — which an in-scene HTML label is not.
 *
 * Side by side puts A left and B right, matching where the buildings stand.
 * Ghost overlay puts them together, because there the two occupy the same
 * space and claiming otherwise would be a lie.
 */
function CompareTags({ nameA, nameB, ghost }: { nameA: string; nameB: string; ghost: boolean }) {
  const colorA = useCssVar('--series-a');
  const colorB = useCssVar('--series-b');

  return (
    <div
      className="pointer-events-none absolute inset-x-3 top-12 flex items-start justify-between gap-2"
      aria-hidden="true"
    >
      <IdentityTag letter="A" name={nameA} color={colorA} />
      <IdentityTag letter="B" name={nameB} color={colorB} align={ghost ? 'left' : 'right'} />
    </div>
  );
}

function IdentityTag({
  letter,
  name,
  color,
  align = 'left',
}: {
  letter: string;
  name: string;
  color: string;
  align?: 'left' | 'right';
}) {
  return (
    <span
      className={`flex max-w-[45%] items-center gap-1.5 rounded-full bg-surface/90 px-2 py-1 backdrop-blur ${
        align === 'right' ? 'flex-row-reverse' : ''
      }`}
    >
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {letter}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">{name}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------- */

function ViewToggle({
  view,
  onChange,
}: {
  view: 'sideBySide' | 'ghost';
  onChange: (view: 'sideBySide' | 'ghost') => void;
}) {
  const options = [
    { id: 'sideBySide' as const, label: 'Side by side' },
    { id: 'ghost' as const, label: 'Ghost overlay' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Comparison view"
      className="absolute top-3 left-1/2 flex -translate-x-1/2 rounded-app border border-line bg-surface/90 p-0.5 backdrop-blur"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={view === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-app px-3 py-1 text-xs transition-colors ${
            view === option.id
              ? 'bg-primary font-medium text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
