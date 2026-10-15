import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { buildingHeight } from '@/lib/camera';
import { describeBuilding } from '@/lib/describeBuilding';
import { driftBand } from '@/lib/driftScale';
import { useCssVar, useCssVars } from '@/lib/useCssVar';
import { sampleDisplacement } from '@/lib/time';
import { seriesColor, sideAt, useCompareStore, type CompareSide } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';
import type { BuildingConfig } from '@/types';
import { CameraFrame } from './CameraFrame';
import { GroundSlab } from './GroundSlab';
import { ShakeArrow } from './ShakeArrow';

/* =========================================================================
   Comparison viewport
   -------------------------------------------------------------------------
   Two presentations of the same set of buildings:

     • SIDE BY SIDE — each on one ground slab, separated along X. Easiest to
       read when the buildings are very different.
     • GHOST OVERLAY — all drawn in the same place, each translucent over A.
       Best for spotting that differently-shaped buildings happen to sway
       almost the same amount, which side-by-side makes hard to see.

   THREE OR FOUR BUILDINGS ARE ALWAYS GHOSTED, AND THE TOGGLE SAYS SO
   Four buildings side by side need four footprints and three gaps, so at any
   camera distance that keeps a building legible the frame is several screens
   wide and each building is a few pixels across. The comparison stops being a
   comparison and becomes a plan of a street. Rather than ship a view that
   cannot work at 3 or 4, the view is chosen for the user and the reason is
   printed on screen.

   Both sample displacement from the same playback clock as the single-building
   view, and from each building's own `floorDisp`. There is no second clock.
   ========================================================================= */

/** Above this many buildings, side by side cannot be made to work. */
const MAX_SIDE_BY_SIDE = 2;

/** One building in the comparison, with everything the scene needs. */
type Subject = {
  side: CompareSide;
  building: BuildingConfig;
  /** Result for this building, or null while the first solve is in flight. */
  result: ReturnType<typeof useConfigStore.getState>['result'] | null;
  resultIndex: number;
};

export function CompareViewport() {
  const view = useCompareStore((s) => s.view);
  const setView = useCompareStore((s) => s.setView);
  const count = useCompareStore((s) => s.count);

  const buildingA = useConfigStore((s) => s.building);
  const compareBuildings = useConfigStore((s) => s.compareBuildings);
  const results = useConfigStore((s) => s.results);
  const resultA = useConfigStore((s) => s.result);

  const viewportBg = useCssVar('--viewport-bg');

  const subjects: Subject[] = [buildingA, ...compareBuildings.slice(0, count - 1)].map(
    (building, i) => ({
      side: sideAt(i),
      building,
      result: i === 0 ? resultA : (results[i - 1] ?? null),
      resultIndex: i,
    }),
  );

  const ghostForced = subjects.length > MAX_SIDE_BY_SIDE;
  const ghost = ghostForced || view === 'ghost';

  /* What has to fit in the frame, and from where.

   * Side by side, the camera has to hold every building AND the gap between
   * them — keying the fit on A alone cropped the taller building off the top.
   * In ghost overlay they all occupy the same space, so only one footprint
   * needs fitting, and the widest of them counts for all.
   */
  const clearance = Math.max(...subjects.map((s) => s.building.widthM)) * 0.35;
  const widths = subjects.map((s) => s.building.widthM);
  const frameWidth = ghost
    ? Math.max(...widths)
    : widths.reduce((sum, w) => sum + w, 0) + clearance * (subjects.length - 1);
  const frameDepth = Math.max(...subjects.map((s) => s.building.depthM));
  const frameHeight = Math.max(...subjects.map((s) => buildingHeight(s.building)));

  return (
    /*
     * A container, because the building names have to fit the VIEWPORT COLUMN,
     * not the window. At 1024px the desktop layout leaves the 3D column about
     * 320px wide, and a name like "5-storey concrete · moment frame" does not
     * fit two of them side by side - it was truncating to "5-story conc…".
     *
     * A media query would have answered the wrong question here, the same way
     * the material buttons' `sm:basis-calc(25%)` did: they asked how wide the
     * window was when what mattered was how wide the box was.
     */
    <div
      className="@container relative h-full w-full overflow-hidden"
      style={{ backgroundColor: viewportBg }}
    >
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
        aria-label={`3D comparison of ${subjects.length} buildings under the same earthquake. ${subjects
          .map((s) => `${s.side}: ${describeBuilding(s.building)}.`)
          .join(' ')} The measured numbers are in the comparison table.`}
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

        {ghost ? (
          <GhostOverlay subjects={subjects} />
        ) : (
          <SideBySide subjects={subjects} clearance={clearance} />
        )}

        <ShakeArrow widthM={frameWidth} depthM={frameDepth} />

        {/* Outside the framing on purpose: the slab is deliberately
              oversized, and fitting to it would push the camera so far back
              that a 10-storey tower became a thin line. */}
        <GroundSlab />
      </Canvas>

      {ghostForced ? null : <ViewToggle view={view} onChange={setView} />}
      <CompareTags subjects={subjects} ghost={ghost} />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function SideBySide({ subjects, clearance }: { subjects: Subject[]; clearance: number }) {
  /* Place the buildings side by side, adjacent, with the GROUP centred.

   * Placing them symmetrically about the origin instead — first at −gap/2, last
   * at +gap/2 — leaves a large empty stretch whenever the widths differ much: a
   * 14 m building next to a 40 m one ends up 25 m from anything. Measuring the
   * actual widths and packing them edge to edge keeps the framing stable no
   * matter how different they are.
   */
  const totalWidth =
    subjects.reduce((sum, s) => sum + s.building.widthM, 0) + clearance * (subjects.length - 1);

  // Each building's centre: the leftmost edge of the packed row, plus whatever
  // has already been laid down, plus half of this building's own width.
  //
  // Written as a sum over the ones before it rather than a running cursor,
  // because a running total is a variable reassigned during render — something
  // React does not promise to keep stable, and the linter rightly objects to.
  // With at most four buildings the repeated sum costs nothing, and it says
  // what it means.
  const positions = subjects.map((_, i) => {
    const laidBefore = subjects
      .slice(0, i)
      .reduce((sum, s) => sum + s.building.widthM + clearance, 0);
    return -totalWidth / 2 + laidBefore + subjects[i]!.building.widthM / 2;
  });

  return (
    <group>
      {subjects.map((s, i) => (
        <SwayingBuilding key={s.side} subject={s} x={positions[i]!} ghost={false} />
      ))}
    </group>
  );
}

/**
 * Every building in the same place.
 *
 * THE SELECTED BUILDING IS THE SOLID ONE.
 *
 * It was A that stayed solid and everything else went translucent, which is
 * fine for one ghost and useless for three: three sheets of 32%-opacity colour
 * stacked on each other average out to a single mass, and the picture stops
 * being a comparison of four buildings and becomes one building that is
 * vaguely red.
 *
 * Making the one being edited solid solves both problems at once. There is
 * always exactly one readable building, the one the user is working on, and the
 * other three recede into context behind it — which is what "overlay" is for.
 * Changing the selection changes what is in focus, so the view answers the
 * question the user is actually asking.
 */
function GhostOverlay({ subjects }: { subjects: Subject[] }) {
  // Subscribed through a hook rather than `getState()`: reading the store
  // imperatively would render once and never again, so switching buildings
  // would leave the focus stuck on whichever was selected first.
  const editing = useCompareStore((s) => s.editing);
  const focus = subjects.some((s) => s.side === editing) ? editing : subjects[0]!.side;

  return (
    <group>
      {subjects.map((s, i) => (
        <SwayingBuilding
          key={s.side}
          subject={s}
          x={0}
          ghost={s.side !== focus}
          // Layer order, so a later building is never hidden by an earlier one.
          order={i}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * One building, swaying.
 *
 * `ghost` renders the mesh translucent with depth writing off, so the solid
 * building behind stays readable through it.
 */
function SwayingBuilding({
  subject,
  x,
  ghost = false,
  order = 0,
}: {
  subject: Subject;
  x: number;
  ghost?: boolean;
  order?: number;
}) {
  const { building, result, side } = subject;

  /*
   * Floors are coloured by story drift, on the SAME scale the bar chart uses.
   *
   * This used to paint each building a flat A/B colour, on the reasoning that
   * identity outranks the drift scale in a comparison. That was the wrong
   * trade: it left the 3D view speaking a different visual language from the
   * chart beside it, and it made colour useless for the one job comparison
   * exists for. With every building on one shared scale, colour IS the
   * comparison — two floors the same colour have the same drift, and you can
   * see which building is worse without reading a single number.
   *
   * Identity moves to a label above each building instead of its hue, because
   * position already distinguishes them in Side by side and translucency does
   * it in Ghost overlay.
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

  // Identity colour, for the outline and the tag rather than the floor faces.
  const identityColor = useCssVar(
    side === 'A'
      ? '--series-a'
      : side === 'B'
        ? '--series-b'
        : side === 'C'
          ? '--series-c'
          : '--series-d',
  );
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
            <mesh geometry={geometry.box} renderOrder={ghost ? 2 + order : 0}>
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
                opacity={ghost ? 0.95 : 0.55}
                depthTest={!ghost}
              />
            </lineSegments>
          </group>
        );
      })}
      {/* The identity tags are a DOM overlay instead of drei <Html> - see CompareTags. */}
    </group>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * The identity tags, which is where identity lives now that every building is
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
 * Side by side puts them left to right, matching where the buildings stand.
 * Ghost overlay stacks them down the left, because there they all occupy the
 * same space and claiming otherwise would be a lie.
 */
function CompareTags({ subjects, ghost }: { subjects: Subject[]; ghost: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-3 top-12 flex gap-2 ${
        ghost ? 'flex-col items-start' : 'items-start justify-between'
      }`}
      aria-hidden="true"
    >
      {subjects.map((s, i) => (
        <IdentityTag
          key={s.side}
          letter={s.side}
          name={describeBuilding(s.building)}
          color={seriesColor(s.side)}
          align={ghost ? 'left' : i === 0 ? 'left' : 'right'}
        />
      ))}
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
      className={`flex items-center gap-1.5 rounded-full bg-surface/90 px-2 py-1 backdrop-blur ${
        align === 'right' ? 'flex-row-reverse' : ''
      }`}
    >
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {letter}
      </span>
      {/*
        The name appears only when the viewport column is wide enough for it.
        The letter is the part that is load-bearing - it is what tells the
        buildings apart - so it is never the thing that gets dropped.
      */}
      <span className="hidden truncate text-[11px] text-muted-foreground @xl:inline">{name}</span>
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
