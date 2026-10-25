import { create } from 'zustand';

import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { normalizeFloorLoads } from '@/config/floorLoads';
import { MATERIAL_IDS, type BuildingConfig } from '@/types';

/** The material of a building. Taken off the building rather than imported, because
 *  the id union is inferred inside the schema and not re-exported. */
type MaterialId = BuildingConfig['material'];
// A cycle with configStore, and it was already here. Safe because neither store
// touches the other at module scope - every use is inside a function body, by
// which time both modules have finished loading.
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Compare store — VIEW state only
   -------------------------------------------------------------------------
   Deliberately small. It holds how the buildings are DISPLAYED, not the
   buildings themselves and not their results.

   The extra buildings and all their results live in `configStore`, because
   they must be solved in ONE worker request — separate requests would race and
   leave one side showing numbers from different inputs. This store reads them
   from there rather than duplicating them.

   The earthquake is shared: `configStore.motion` is used for every building,
   so any difference in the response comes from the buildings alone. That is
   the whole point of the comparison.

   COUNT, NOT A BOOLEAN
   This was `enabled: boolean` when two buildings were the limit, and a boolean
   cannot say three. `count` is how many buildings are in play, where 1 means
   "not comparing" - the same thing the boolean said, but it can count past two.
   `isComparing` is derived from it rather than stored, so the two can never
   disagree.

   WHY FOUR
   There are four materials. A, B, C and D default to four different ones, which
   turns the default comparison into the exercise people actually want: the same
   building in concrete, steel, composite and wood.
   ========================================================================= */

export type CompareView = 'sideBySide' | 'ghost';

export const COMPARE_SIDES = ['A', 'B', 'C', 'D'] as const;
export type CompareSide = (typeof COMPARE_SIDES)[number];

/** The most buildings that can be in play at once. */
export const MAX_BUILDINGS = COMPARE_SIDES.length;

/**
 * Above this many, side by side lays out two per row rather than one long one.
 *
 * Four footprints and three gaps in a single row need several screens of width
 * before each building is more than a few pixels across, and a plan of a street
 * is not a comparison. Exported because `layoutSideBySide` asks the same
 * question, and two answers to it is how they drift.
 */
export const MAX_SIDE_BY_SIDE = 2;

/** Zero-based position of a side. A is 0. */
export function sideIndex(side: CompareSide): number {
  return COMPARE_SIDES.indexOf(side);
}

/** The side at a zero-based position, clamped to something real. */
export function sideAt(index: number): CompareSide {
  return COMPARE_SIDES[Math.min(Math.max(index, 0), COMPARE_SIDES.length - 1)]!;
}

/** The label for a side, for anything that is not a selector. */
export function sideLabel(side: CompareSide): string {
  return `Building ${side}`;
}

/**
 * The colour a side is drawn in, everywhere.
 *
 * One function so the badge in the controls, the line in the chart, the
 * heading in the table and the bar in the 3D view cannot disagree. A second
 * place that decides "C is the purple one" is a second place to get wrong, and
 * the whole point of a consistent colour is that it is the same colour.
 */
export function seriesColor(side: CompareSide): string {
  return `var(--series-${side.toLowerCase()})`;
}

type CompareState = {
  /** How many buildings are in play. 1 = not comparing. */
  count: number;
  view: CompareView;
  /** Which building the controls and the 3D are currently editing. */
  editing: CompareSide;

  /** Turn comparison on, with the usual two buildings. */
  enable: () => void;
  /** Turn it off, back to one building. */
  disable: () => void;
  /** Add one more building, up to `MAX_BUILDINGS`. */
  addSide: () => void;
  /** Drop one. A cannot be dropped - that is just turning comparison off. */
  removeSide: (side: CompareSide) => void;
  setView: (view: CompareView) => void;
  setEditing: (side: CompareSide) => void;
};

export const useCompareStore = create<CompareState>((set) => ({
  count: 1,
  view: 'sideBySide',
  editing: 'B',

  enable: () => set({ count: 2, editing: 'B' }),
  disable: () => set({ count: 1, editing: 'A' }),

  addSide: () =>
    set((s) => {
      if (s.count >= MAX_BUILDINGS) return s;
      const count = s.count + 1;
      // Move the editing hand to the building just added, so it is obvious that
      // something appeared and that the controls now belong to it.
      //
      // Crossing from two to three also resets the view. Ghost overlay puts
      // every building in the same spot, so three or four of them is that many
      // translucent sheets over one another - a single vaguely red mass rather
      // than separate buildings, and a poor first impression of a feature the
      // client asked for. Side by side is what they asked to see.
      //
      // This used to be justified by a second row of buildings, which the
      // layout no longer has. The reason above is the one that is actually
      // true, and it was checked against the scene rather than remembered.
      //
      // Only on the crossing, and only from two to three. Above that a user
      // who has deliberately chosen Ghost keeps it, because a store that
      // keeps overriding their choice is a store they cannot rely on.
      return {
        count,
        editing: sideAt(count - 1),
        view: count === MAX_SIDE_BY_SIDE + 1 ? ('sideBySide' as const) : s.view,
      };
    }),

  removeSide: (side) =>
    set((s) => {
      const index = sideIndex(side);
      // A is not removable; `disable` is the way to go back to one building.
      if (index < 1 || index >= s.count) return s;
      const count = s.count - 1;
      const editing = sideIndex(s.editing) >= count ? sideAt(count - 1) : s.editing;
      return { count, editing };
    }),

  setView: (view) => set({ view }),
  setEditing: (editing) => set({ editing }),
}));

/** Is anything being compared? Derived, so it cannot drift from `count`. */
export function isComparing(): boolean {
  return useCompareStore.getState().count > 1;
}

/** The building the controls should edit right now. */
export function editingBuilding(): CompareSide {
  return useCompareStore.getState().editing;
}

/**
 * The materials available as a default for the extra buildings: every material
 * except the one A is already made of.
 *
 * Guarantees the four sides default to four different materials whichever one
 * the user started with, which is the comparison worth making by default.
 */
function spareMaterials(a: BuildingConfig): MaterialId[] {
  return MATERIAL_IDS.filter((m) => m !== a.material);
}

/**
 * A sensible default for the building in slot `index`, where index 0 is B.
 *
 * Different material from A, a different frame type, and a different height, so
 * the comparison shows something rather than four near-identical towers. The
 * floor count is nudged rather than reset: a building so short it cannot show
 * what it is doing is not a useful comparison.
 */
export function defaultCompareBuilding(index: number, a = currentBuilding()): BuildingConfig {
  const materials = spareMaterials(a);
  const material = materials[index % materials.length] ?? 'steel';
  const floors = a.floors <= 8 ? a.floors + 5 : Math.max(3, a.floors - 5);
  return {
    ...a,
    id: `${a.id}-${COMPARE_SIDES[index + 1]?.toLowerCase() ?? index + 1}`,
    name: `${a.name} — ${material}`,
    floors,
    // The extra building starts from A's load pattern, adapted to its new
    // floor count. The normalizer copies the nearest floor, so a taller B is
    // not silently all-Office while its lower floors carry A's parking load.
    // A fresh array, not A's: two buildings must never share one mutable list.
    // The loads-on/off switch spreads with the rest, deliberately: a bare
    // building compared against bare ones is a comparison of materials.
    floorLoads: normalizeFloorLoads(floors, a.floorLoads),
    // Alternate the frame against A's, so there is a second thing varying.
    frameType: a.frameType === 'moment' ? 'braced' : 'moment',
    material,
    widthM: a.widthM,
    depthM: a.depthM,
    floorHeightM: a.floorHeightM,
    dampingRatio: undefined,
  };
}

/** The building A is currently set to, as the controls would show it. */
function currentBuilding(): BuildingConfig {
  return useConfigStore.getState().displayBuilding;
}

export { DEFAULT_BUILDING_CONFIG };
