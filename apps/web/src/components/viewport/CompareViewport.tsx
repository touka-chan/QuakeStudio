import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { buildingHeight } from '@/lib/camera';
import { layoutSideBySide, type Layout } from '@/lib/layout';
import { describeBuilding } from '@/lib/describeBuilding';
import { arrowReferenceWidthM, SIDE_CLEARANCE_RATIO } from '@/lib/sceneScale';
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
 * The camera sits nearly head-on.
 *
 * The X separation then reads as left/right, and every building sits at the same
 * distance from the lens, so the shorter one is not made to look shorter than it
 * is. A three-quarter camera did both of those things badly.
 *
 * There was a second, lifted angle for when the buildings wrapped onto a second
 * row. They do not any more — the client asked for one horizontal line — and a
 * lifted camera would put the buildings at different distances from the lens,
 * reintroducing exactly the size difference the head-on angle exists to avoid.
 */
const CAMERA_DIRECTION: [number, number, number] = [0.2, 0.38, 0.9];

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

  /** Same colour the single-building callout uses, so the two look identical. */
  const hoverLabel = useCssVar('--text');

  /*
   * The floor the user has pinned by clicking a slab or a bar, shared with the
   * chart so a pinned floor is pinned everywhere at once.
   */
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const setActiveFloor = useConfigStore((s) => s.setActiveFloor);

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

  /** The widest single building. The scale reference for the shake arrow. */
  const widestWidthM = arrowReferenceWidthM(widths);

  /** Gap between neighbouring buildings: a third of a width reads as a street. */
  const clearance = widestWidthM * SIDE_CLEARANCE_RATIO;

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
  );

  const frameWidth = ghost ? Math.max(...widths) : layout.width;
  const frameDepth = ghost ? Math.max(...depths) : layout.depth;
  const frameHeight = Math.max(...heights);

  const direction = CAMERA_DIRECTION;

  // The badge nodes live OUTSIDE the canvas but are positioned from INSIDE it,
  // where the camera is. They meet through this ref.
  const badgeNodes = useRef<(HTMLSpanElement | null)[]>([]);

  /*
   * THE HOVER CALLOUT, AND WHY IT IS NOT drei's <Html>
   *
   * The single-building view has always had one: hover a floor and it reads
   * back the peak and the story drift for that floor. The comparison view had
   * none, which is a strange gap once there are four buildings and the numbers
   * on the chart belong to whichever floor was last clicked.
   *
   * Deliberately NOT <Html>, which is what the single-building callout uses and
   * which works there. Two reasons:
   *
   *   - One callout, not four. <Html> mounts inside the mesh it belongs to, so
   *     four buildings would each carry their own and hovering two at once would
   *     put two overlapping readouts on screen. Hover state lives here, above
   *     all of them, so there is only ever one.
   *   - One mechanism on the screen. The badges already project from the camera
   *     every frame; a second, different way of placing a label in the same
   *     viewport is a second thing to understand and a second thing to break.
   */
  const [hovered, setHovered] = useState<Hovered>(null);
  const calloutNode = useRef<HTMLDivElement>(null);

  // Clearing on leave is not enough — orbiting the camera moves the floors out
  // from under a stationary pointer, so the floor under it is no longer the one
  // that was hovered.
  useEffect(() => () => setHovered(null), [view]);

  const hoveredSubject = hovered ? subjects.find((s) => s.side === hovered.side) : undefined;

  /*
   * The numbers in the callout, pulled from the hovered building's OWN result.
   *
   * The building's letter is in the heading, and it has to be: with four
   * buildings in one line, "Floor 6" on its own is a number attached to nothing.
   * The same rule as everywhere else in the comparison — the colour is never the
   * only thing telling two of them apart.
   */
  const hoveredData =
    hovered && hoveredSubject?.result
      ? {
          peakMm: (hoveredSubject.result.peakDisp[hovered.floor - 1] ?? 0) * 1000,
          driftPct: (hoveredSubject.result.driftRatio[hovered.floor - 1] ?? 0) * 100,
        }
      : null;

  /** Widen the cursor over a floor, the way the single view does. */
  const hoverHandlers = (side: CompareSide, floor: number) => ({
    onPointerOver: () => {
      setHovered({ side, floor });
    },
    onPointerOut: () => setHovered(null),
  });

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
          <GhostOverlay
            subjects={subjects}
            hoverHandlers={hoverHandlers}
            setActiveFloor={setActiveFloor}
            activeFloor={activeFloor}
          />
        ) : (
          <SideBySide
            subjects={subjects}
            layout={layout}
            hoverHandlers={hoverHandlers}
            setActiveFloor={setActiveFloor}
            activeFloor={activeFloor}
          />
        )}

        {/* Projects the badge anchors onto the screen every frame. Renders
              nothing itself; it writes to the DOM nodes held by `badgeNodes`. */}
        <RoofBadges
          subjects={subjects}
          layout={layout}
          ghost={ghost}
          hovered={hovered}
          nodes={badgeNodes}
          callout={calloutNode}
        />

        {/*
         * The arrow is measured against ONE building, never the row.
         * Passed the framed width before, which at four buildings made it about
         * 87 m long and it ran off both edges of the viewport. See ShakeArrow.
         */}
        <ShakeArrow referenceWidthM={widestWidthM} depthM={frameDepth} />

        {/*
         * The slab covers the whole footprint the buildings occupy — which in
         * ghost overlay is just the widest one, since they all stand on the same
         * spot. Before, the slab sized itself from building A alone, so with four
         * in a line it stopped about a third of the way along and the last two
         * buildings stood on nothing at all, with the grid lines ending in
         * mid-air between them.

         * Deliberately outside the camera framing: the slab carries 25% margin
         * on top of the footprint, and fitting to it would push the camera far
         * enough back that a 10-storey tower became a thin line.
         */}
        <GroundSlab widthM={frameWidth} depthM={frameDepth} />
      </Canvas>

      <ViewToggle view={view} onChange={setView} />
      <RoofBadgeLayer subjects={subjects} nodes={badgeNodes} />
      <FloorCalloutLayer
        node={calloutNode}
        hovered={hovered}
        data={hoveredData}
        color={hoverLabel}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/** Reused between frames so the projector allocates nothing per frame. */
const projected = new THREE.Vector3();

/** Where the hovered floor's callout is anchored, in metres. Reused per frame. */
const calloutAnchor = new THREE.Vector3();

/** A floor the pointer is over. `null` when nothing is hovered. */
type Hovered = { side: CompareSide; floor: number } | null;

/**
 * Per-floor pointer handlers, built once per floor and shared by every
 * building — so hovering any floor anywhere in the scene updates the single
 * callout rather than mounting one per mesh.
 */
type HoverHandlers = (
  side: CompareSide,
  floor: number,
) => {
  onPointerOver: () => void;
  onPointerOut: () => void;
};

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
  // Behind the camera, the projection inverts and the number means nothing, so
  // the badge is moved out of sight rather than placed somewhere absurd.
  if (behind) {
    hideOverlay(node);
    return;
  }
  placeOverlay(
    node,
    `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`,
  );
}

/**
 * Writes a position and a visibility onto a projected overlay.
 *
 * Same function boundary as `placeBadge`, and for the same reason: a DOM node's
 * inline style is not component state, and saying so in one place is better than
 * saying it twice.
 */
function placeOverlay(node: HTMLElement | null | undefined, transform: string): void {
  if (!node) return;
  node.style.transform = transform;
  node.style.opacity = '1';
}

/** Moves an overlay out of the way rather than deleting it. */
function hideOverlay(node: HTMLElement | null | undefined): void {
  if (!node) return;
  node.style.opacity = '0';
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
  subjects,
  layout,
  ghost,
  hovered,
  nodes,
  callout,
}: {
  subjects: Subject[];
  layout: Layout;
  ghost: boolean;
  hovered: Hovered;
  nodes: React.RefObject<(HTMLSpanElement | null)[]>;
  callout: React.RefObject<HTMLDivElement | null>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useFrame(() => {
    const list = nodes.current;
    if (!list) return;
    const time = usePlaybackStore.getState().time;
    const exaggeration = usePlaybackStore.getState().exaggeration;

    for (let i = 0; i < subjects.length; i += 1) {
      const node = list[i];
      if (!node) continue;
      const subject = subjects[i]!;
      const spot = ghost ? ([0, 0] as [number, number]) : layout.spots[i];

      /*
       * THE BADGE RIDES THE TOP FLOOR, NOT A FIXED POINT IN SPACE.
       *
       * The anchor used to be the building's static x. The building, though,
       * sways: every floor group is moved by its own sampled displacement, so
       * during playback the whole thing leans sideways and the badge stood still
       * where the roof used to be. Found by the client, and it is the kind of
       * thing that looks like it is working right up until the shake starts.
       *
       * Sampled with the same call the floor groups use, at the same instant, so
       * the badge cannot drift away from the thing it is labelling.
       */
      const top = Math.max(0, subject.building.floors - 1);
      const sway = subject.result
        ? sampleDisplacement(subject.result.floorDisp, subject.result.time, top, time) *
          exaggeration
        : 0;

      projected
        .set(
          (spot ? spot[0] : 0) + sway,
          buildingHeight(subject.building) + BADGE_LIFT_M,
          spot ? spot[1] : 0,
        )
        .project(camera);

      // Normalised device coordinates run -1..1 across the frustum. Anything
      // past 1 in z is behind the camera or beyond the far plane, where the
      // projection inverts and the number means nothing.
      const behind = projected.z > 1;
      placeBadge(
        node,
        (projected.x * 0.5 + 0.5) * size.width,
        // The ghost stack is a pixel offset from an anchor already on screen,
        // so it can never climb out of the frame the way a world-space one did.
        (-projected.y * 0.5 + 0.5) * size.height + (ghost ? i * BADGE_STACK_PX : 0),
        behind,
      );
    }

    /*
     * The callout, anchored to the hovered floor rather than to a building.
     *
     * It rides that floor's own displacement for the same reason the badge
     * rides its roof's: an anchor that does not move with the floor it belongs
     * to slides off the thing it is labelling the moment the shake starts.
     */
    const box = callout.current;
    // Not mounted until the first React commit has run; nothing to move yet.
    if (!box) return;
    if (!hovered) {
      hideOverlay(box);
      return;
    }
    const subject = subjects.find((s) => s.side === hovered.side);
    const spot = ghost
      ? ([0, 0] as [number, number])
      : layout.spots.find((_, i) => sideAt(i) === hovered.side);
    if (!subject || !subject.result || !spot) {
      hideOverlay(box);
      return;
    }
    const index = hovered.floor - 1;
    const sway =
      sampleDisplacement(subject.result.floorDisp, subject.result.time, index, time) * exaggeration;
    calloutAnchor
      .set(
        spot[0] + sway,
        (subject.building.floors - 1 - index) * subject.building.floorHeightM,
        spot[1],
      )
      .project(camera);
    if (calloutAnchor.z > 1) {
      hideOverlay(box);
      return;
    }
    // Off to the right of the floor, as the single-building callout is — unless
    // that would run it into the next building. With four in a line the right
    // half of the frame is where the callout has no room, and it landed on the
    // badge of the building beside it. Flipping to the left past the midpoint
    // puts it over empty space instead, and over the floor the pointer is
    // already on.
    const sx = (calloutAnchor.x * 0.5 + 0.5) * size.width;
    const flip = sx > size.width / 2;
    placeOverlay(
      box,
      `translate3d(${Math.round(sx + (flip ? -12 : 12))}px, ${(-calloutAnchor.y * 0.5 + 0.5) * size.height}px, 0) translate(${flip ? '-100%' : '0'}, -50%)`,
    );
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

/**
 * The hover callout — the readout the single-building view has always had.
 *
 * Positioned from the camera by `RoofBadges`, anchored to the hovered floor, so
 * it follows the floor as the building sways rather than sliding off it.
 *
 * NO `visibility` IN THE STYLE PROP, AND THAT IS THE WHOLE LESSON
 *
 * The first version had `visibility: 'hidden'` here as the initial state, and
 * the callout never appeared — not once, at any position, on any width.
 *
 * React owns the style prop: setting `hovered` re-renders this element, React
 * re-applies the prop it was given, and `visibility` snaps back to hidden. The
 * frame loop showed it, and the render that came a millisecond later hid it
 * again — every time. The imperative write and the declarative write were
 * fighting over one property, and React won because it is React.
 *
 * So the frame loop owns `visibility` outright, and the style prop here carries
 * `color` and nothing else. Anything the loop writes must not also appear in
 * this object.
 */
function FloorCalloutLayer({
  node,
  hovered,
  data,
  color,
}: {
  node: React.RefObject<HTMLDivElement | null>;
  hovered: Hovered;
  data: { peakMm: number; driftPct: number } | null;
  color: string;
}) {
  return (
    <div
      ref={node}
      data-floor-callout=""
      className="pointer-events-none absolute top-0 left-0 min-w-44 rounded-app border border-line bg-surface px-3 py-2 text-xs opacity-0 shadow-lg transition-opacity"
      style={{ color }}
    >
      {hovered && data ? (
        <>
          <p className="font-semibold">
            <span className="font-mono-nums">{hovered.side}</span> · Floor {hovered.floor}
            {hovered.floor === 1 ? ' (ground floor)' : ''}
          </p>
          <p className="font-mono-nums mt-1">
            Peak {data.peakMm.toFixed(1)} mm
            <br />
            Story drift {data.driftPct.toFixed(2)} %
          </p>
        </>
      ) : null}
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
function SideBySide({
  subjects,
  layout,
  hoverHandlers,
  setActiveFloor,
  activeFloor,
}: {
  subjects: Subject[];
  layout: Layout;
  hoverHandlers: HoverHandlers;
  setActiveFloor: (floor: number | null) => void;
  activeFloor: number | null;
}) {
  return (
    <group>
      {subjects.map((s, i) => {
        const spot = layout.spots[i] ?? [0, 0];
        return (
          <SwayingBuilding
            key={s.side}
            subject={s}
            x={spot[0]}
            z={spot[1]}
            ghost={false}
            hoverHandlers={hoverHandlers}
            setActiveFloor={setActiveFloor}
            activeFloor={activeFloor}
          />
        );
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
function GhostOverlay({
  subjects,
  hoverHandlers,
  setActiveFloor,
  activeFloor,
}: {
  subjects: Subject[];
  hoverHandlers: HoverHandlers;
  setActiveFloor: (floor: number | null) => void;
  activeFloor: number | null;
}) {
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
          hoverHandlers={hoverHandlers}
          setActiveFloor={setActiveFloor}
          activeFloor={activeFloor}
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
  hoverHandlers,
  setActiveFloor,
  activeFloor,
}: {
  subject: Subject;
  x: number;
  /** Depth. Ghost overlay puts everything at 0; side by side does too. */
  z?: number;
  ghost?: boolean;
  order?: number;
  hoverHandlers: HoverHandlers;
  setActiveFloor: (floor: number | null) => void;
  activeFloor: number | null;
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
  const palette = useCssVars([
    '--drift-1',
    '--drift-2',
    '--drift-3',
    '--drift-4',
    '--drift-5',
    '--selection',
  ]);

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
        const floor = index + 1;
        // Same selection state the single-building view highlights, so a floor
        // pinned in the chart is also visibly pinned here.
        const isActive = activeFloor === floor;

        /*
         * Built here rather than inline in the JSX.
         *
         * The first version wrote `onPointerOver={hoverHandlers(side, floor)}` —
         * handing R3F the whole `{ onPointerOver, onPointerOut }` object as if
         * it were the handler. React and R3F accept it without complaint and the
         * hover simply never fires. `onPointerOut` worked, because that one was
         * written as a closure calling the method, so the only symptom was a
         * callout that would not appear and an exit event that would. Which is
         * what it looked like: a feature that did nothing, with no error.
         *
         * A ghost gets no handlers at all. It is a translucent overlay, and
         * swallowing pointer events on the building you are trying to compare
         * against would be actively unhelpful.
         */
        const hover = ghost ? null : hoverHandlers(side, floor);
        return (
          <group
            key={index}
            position={[0, y, 0]}
            ref={(node) => {
              floorRefs.current[index] = node;
            }}
          >
            <mesh
              geometry={geometry.box}
              renderOrder={ghost ? 2 + order : 0}
              onPointerOver={hover?.onPointerOver}
              onPointerOut={hover?.onPointerOut}
              onClick={
                ghost
                  ? undefined
                  : (event: { stopPropagation: () => void }) => {
                      event.stopPropagation();
                      setActiveFloor(isActive ? null : floor);
                    }
              }
            >
              <meshLambertMaterial
                color={floorColors[index]}
                emissive={isActive ? (palette['--selection'] ?? '#000000') : '#000000'}
                emissiveIntensity={isActive ? 0.35 : 0}
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
