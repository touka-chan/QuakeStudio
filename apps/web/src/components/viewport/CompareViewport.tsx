import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { buildingHeight } from '@/lib/camera';
import { layoutSideBySide, type Layout } from '@/lib/layout';
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

     • SIDE BY SIDE — packed edge to edge, two per row once there are more than
       two. Easiest to read when the buildings are very different.
     • GHOST OVERLAY — all drawn in the same place, the one being edited solid
       and the rest translucent over it. Best for spotting that
       differently-shaped buildings happen to sway almost the same amount,
       which side-by-side makes hard to see.

   BOTH ARE AVAILABLE AT EVERY COUNT, AND SIDE BY SIDE IS THE DEFAULT.
   Crossing from two buildings to three changes the shape of the scene enough
   that starting on the view which stacks them into a mush is the wrong first
   impression — see `addSide` in compareStore, which is where that happens.
   Choosing Ghost at three or four is then entirely the user's own decision.

   Both sample displacement from the same playback clock as the single-building
   view, and from each building's own `floorDisp`. There is no second clock.
   ========================================================================= */

/**
 * Near head-on, for buildings in a single row.
 *
 * The X separation then reads as left/right, and both buildings sit at the same
 * distance from the lens, so the shorter one is not made to look shorter than it
 * is. A three-quarter camera did both of those things badly.
 */
const ROW_DIRECTION: [number, number, number] = [0.2, 0.38, 0.9];

/**
 * Lifted, for a second row.
 *
 * Head-on, the front row hides the back row — at four buildings that is half
 * the comparison gone. About 42 degrees of pitch looks down the rows enough to
 * see both, at the cost of the back row being further from the lens and so
 * looking smaller. Perspective does that; the table carries the exact figures.
 */
const GRID_DIRECTION: [number, number, number] = [0.18, 0.95, 1.05];

/** How far above a roof its badge floats, in metres. */
const BADGE_LIFT_M = 3.5;

/**
 * Vertical spacing between stacked badges in ghost overlay, in PIXELS.
 *
 * Screen space rather than metres, so the stack is the same size whatever the
 * building is, and it grows into the picture instead of off the top of it.
 */
const BADGE_STACK_PX = 24;

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

  const ghost = view === 'ghost';

  const widths = subjects.map((s) => s.building.widthM);
  const depths = subjects.map((s) => s.building.depthM);
  const heights = subjects.map((s) => buildingHeight(s.building));

  /** Gap between neighbouring buildings: a third of a width reads as a street. */
  const clearance = Math.max(0, ...widths) * 0.35;

  /*
   * Rows are further apart than columns are, because of the camera rather than
   * the buildings. Side by side reads as side by side even when one is partly
   * in front of the other; one-behind-another only reads if the back building's
   * roof is clear of the front one's, and at the same gap it was not — about a
   * third of the back row disappeared behind the front row.
   *
   * Screenshot at 1440 and 1024, both four buildings. See lib/layout.ts.
   */
  const rowClearance = clearance * 1.8;

  /*
   * WHAT HAS TO FIT IN THE FRAME, AND FROM WHERE.
   *
   * Side by side, the camera has to hold every building AND the gaps between
   * them — keying the fit on A alone cropped the taller building off the top.
   * In ghost overlay they all occupy the same space, so only one footprint
   * needs fitting and the widest of them counts for all.
   *
   * The numbers come from `layoutSideBySide`, the same function that places
   * the buildings. The camera being framed from different arithmetic than the
   * geometry it frames is how a building ends up cropped at one floor count
   * and miles away at another.
   */
  const layout = layoutSideBySide(
    subjects.map((s) => ({ width: s.building.widthM, depth: s.building.depthM })),
    clearance,
    rowClearance,
  );

  const frameWidth = ghost ? Math.max(...widths) : layout.width;
  const frameDepth = ghost ? Math.max(...depths) : layout.depth;
  const frameHeight = Math.max(...heights);

  /*
   * TWO CAMERA ANGLES, AND THE REASON IS NOT AESTHETIC.
   *
   * With two buildings in one row the camera sits nearly head-on, so the
   * horizontal separation reads as left/right and both buildings are the same
   * distance from the lens. That was a deliberate choice: a three-quarter
   * camera put the far building in front of the near one — exactly the
   * comparison this view exists to make easy — and made the shorter building
   * look smaller than it was.
   *
   * That reasoning does not survive a second row. Head-on, the front row
   * simply hides the back row, which for four buildings is half of them gone.
   * So above two the camera lifts to about 42 degrees, which looks down the
   * rows enough to see both.
   *
   * The cost is real and worth naming: buildings in the back row are further
   * from the lens and so appear smaller. Perspective does that. The table and
   * the charts carry the exact figures, and the 3D is for shape and sway.
   */
  const direction = ghost || layout.perRow < 2 ? ROW_DIRECTION : GRID_DIRECTION;

  /*
   * WHERE EACH BADGE SITS.
   *
   * Side by side, a badge floats over its own building's roof — which is the
   * most visible part of it even when a nearer building is in the way.
   *
   * In ghost overlay every building occupies the same spot, so four badges would
   * land on one pixel. They are stacked, in side order, so all four are readable
   * and the reading order matches the switcher.
   *
   * THE STACK IS IN SCREEN SPACE, NOT WORLD SPACE.
   *
   * The first version raised each one by three metres, which is the obvious
   * way and is wrong: the camera frames the tallest roof and nothing above it,
   * so the stack climbed straight out of the top of the viewport and only the
   * bottom sliver of one badge was left. A world-space offset cannot know where
   * the edge of the frame is. A pixel offset is measured from an anchor that is
   * already known to be on screen, so the stack always grows into the picture.
   */
  const badgePoints = subjects.map((s, i) => {
    const spot = ghost ? [0, 0] : (layout.spots[i] ?? [0, 0]);
    return {
      x: spot[0],
      y: buildingHeight(s.building) + BADGE_LIFT_M,
      z: spot[1],
      /** Pixels to push the badge down the screen, for the ghost stack. */
      offsetPx: ghost ? i * BADGE_STACK_PX : 0,
    };
  });

  // The badge nodes live OUTSIDE the canvas but are positioned from INSIDE it,
  // where the camera is. They meet through this ref.
  const badgeNodes = useRef<(HTMLSpanElement | null)[]>([]);

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

        {/* The direction, and why it changes above two buildings, is explained where
              `direction` is computed — this is the same decision, handed over. */}
        <CameraFrame
          width={frameWidth}
          height={frameHeight}
          depth={frameDepth}
          directionX={direction[0]}
          directionY={direction[1]}
          directionZ={direction[2]}
          margin={1.25}
        />

        {ghost ? (
          <GhostOverlay subjects={subjects} />
        ) : (
          <SideBySide subjects={subjects} layout={layout} />
        )}

        {/* Projects the badge anchors onto the screen every frame. Renders
              nothing itself; it writes to the DOM nodes held by `badgeNodes`. */}
        <RoofBadges points={badgePoints} nodes={badgeNodes} />

        <ShakeArrow widthM={frameWidth} depthM={frameDepth} />

        {/* Outside the framing on purpose: the slab is deliberately
              oversized, and fitting to it would push the camera so far back
              that a 10-storey tower became a thin line. */}
        <GroundSlab />
      </Canvas>

      <ViewToggle view={view} onChange={setView} />
      <RoofBadgeLayer subjects={subjects} nodes={badgeNodes} />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/** Reused between frames so the projector allocates nothing per frame. */
const projected = new THREE.Vector3();

/**
 * Moves one badge to a screen position.
 *
 * Deliberately a module-level function rather than a few lines inside the
 * frame loop. Writing to a node reached through a prop reads, to the React
 * compiler lint, as "modifying a prop", and it is right to be cautious about
 * that in general — but a DOM node's inline style is not component state and
 * nothing about it can be made inconsistent by writing here. The function
 * boundary says exactly where the exception lives.
 */
function placeBadge(
  node: HTMLSpanElement | null | undefined,
  x: number,
  y: number,
  behind: boolean,
): void {
  if (!node) return;
  // `translate(-50%, -100%)` sits the badge just above the anchor rather than
  // centred on it, so the roof it belongs to stays visible underneath instead
  // of being covered by the thing naming it.
  node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`;
  node.style.visibility = behind ? 'hidden' : 'visible';
}

/**
 * Projects each building's badge anchor onto the screen, every frame.
 *
 * WHY THIS AND NOT drei's <Html>
 * <Html> was tried here first and was unreliable: with two of them mounted,
 * building A's rendered as an empty container while B's rendered fine — same
 * JSX, same component. A label that silently disappears for half the
 * buildings is worse than no label, so it was replaced with this.
 *
 * WHY IT WRITES STRAIGHT TO THE DOM
 * A badge that follows the camera has to be recomputed every frame. Routing
 * that through React would re-render the whole viewport sixty times a second to
 * move four small circles. The transform is written to the node instead, which
 * is the same approach the playback cursor uses in DisplacementChart.
 *
 * The screen position changes; React does not need to know that.
 */
function RoofBadges({
  points,
  nodes,
}: {
  points: Array<{ x: number; y: number; z: number; offsetPx: number }>;
  nodes: React.RefObject<(HTMLSpanElement | null)[]>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useFrame(() => {
    const list = nodes.current;
    if (!list) return;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i]!;
      projected.set(point.x, point.y, point.z).project(camera);

      // Normalised device coordinates run -1..1 across the frustum. Anything
      // past 1 in z is behind the camera or beyond the far plane, where the
      // projection inverts and the number means nothing.
      const behind = projected.z > 1;
      placeBadge(
        list[i],
        (projected.x * 0.5 + 0.5) * size.width,
        // The ghost stack is a pixel offset from an anchor already on screen,
        // so it can never climb out of the frame the way a world-space one did.
        (-projected.y * 0.5 + 0.5) * size.height + point.offsetPx,
        behind,
      );
    }
  });

  return null;
}

/**
 * The badges themselves — ordinary DOM laid over the canvas.
 *
 * Ordinary DOM, not an in-scene label, for the reasons in `RoofBadges`. What
 * this version adds over the overlay it replaces is that the position comes
 * from the camera rather than from the top edge of the panel: the badge is on
 * the roof, it follows an orbit, and it still says the same thing when a
 * nearer building is standing in front of part of it.
 *
 * Decorative, and marked as such: the canvas is a `role="img"` whose
 * accessible name already lists every building, so a screen reader is not
 * missing anything these carry.
 */
function RoofBadgeLayer({
  subjects,
  nodes,
}: {
  subjects: Subject[];
  nodes: React.RefObject<(HTMLSpanElement | null)[]>;
}) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {subjects.map((s, i) => (
        <span
          key={s.side}
          ref={(node) => {
            nodes.current[i] = node;
          }}
          // Named for the tests. A class name can be rewritten for a purely
          // visual reason, and a test locating badges by class would then
          // quietly measure nothing instead of failing.
          data-roof-badge={s.side}
          className="absolute top-0 left-0 grid size-5 place-items-center rounded-full text-[11px] font-semibold text-white shadow-sm ring-2 ring-surface"
          style={{ backgroundColor: seriesColor(s.side) }}
        >
          {s.side}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * The buildings, packed edge to edge in rows.
 *
 * The positions come from `layout` rather than being worked out again here —
 * the same numbers the camera was framed from. See lib/layout.ts for why those
 * two must not be separate calculations.
 */
function SideBySide({ subjects, layout }: { subjects: Subject[]; layout: Layout }) {
  return (
    <group>
      {subjects.map((s, i) => {
        const spot = layout.spots[i] ?? [0, 0];
        return <SwayingBuilding key={s.side} subject={s} x={spot[0]} z={spot[1]} ghost={false} />;
      })}
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
  z = 0,
  ghost = false,
  order = 0,
}: {
  subject: Subject;
  x: number;
  /** Row position. Ghost overlay puts everything at 0; the grid does not. */
  z?: number;
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
    <group position={[x, 0, z]}>
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
      {/* The identity badge is a DOM overlay driven from the camera — see
          RoofBadges. */}
    </group>
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
      /*
        BOTTOM of the viewport, not the top.
        *
        In Ghost overlay every building stands in the same place, so their roof
        badges have to stack — and the roof of the tallest building projects
        near the TOP of the frame. With the switch up there, the second badge
        in the stack landed squarely on the Ghost overlay button, so a control
        was sitting under a label and neither could be read.
        *
        The switch is chrome; the badges are content. Chrome goes where content
        will not be, and the bottom of the viewport is empty at every width.
      */
      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 rounded-app border border-line bg-surface/90 p-0.5 backdrop-blur"
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
