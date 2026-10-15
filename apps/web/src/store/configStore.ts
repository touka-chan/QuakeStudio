import { create } from 'zustand';

import {
  BUILDING_TEMPLATES,
  DEFAULT_BUILDING_CONFIG,
  DEFAULT_MOTION_CONFIG,
  type BuildingTemplate,
} from '@/config/templates';
import { SolverClient } from '@/engine/client';
import { useCompareStore } from '@/store/compareStore';
import { useTourStore } from '@/store/tourStore';
import type { BuildingConfig, GroundMotionConfig, SimulationResult } from '@/types';

/**
 * Is the guided tour on screen right now?
 *
 * Read at the moment of a write rather than held as its own flag. A flag would
 * be a second thing that has to be kept in step with the tour, and the failure
 * mode when it is not is a model quietly changing behind the spotlight.
 *
 * Same pattern as the `useCompareStore.getState()` reads below: reaching into a
 * sibling store at the point of use, never subscribing, so there is no cycle
 * and no re-render.
 */
function tourOpen(): boolean {
  return useTourStore.getState().open;
}

/* =========================================================================
   Config store — the single source of truth for what is being simulated
   -------------------------------------------------------------------------
   Holds BOTH buildings and BOTH results. That is not tidiness for its own
   sake: comparison mode requires the two sides to be solved from one request
   under one ground motion. With separate requests, dragging a slider on A
   would leave B showing numbers from a different input — exactly the kind of
   quiet wrongness this tool must not have.

   `compareStore` deliberately keeps only view state and reads B from here.
   ========================================================================= */

export type ComputeStatus = 'idle' | 'computing';

/** Placeholder shown until the worker's first response lands. */
const EMPTY_RESULT: SimulationResult = {
  time: [],
  floorDisp: [],
  peakDisp: [],
  maxDisp: 0,
  driftRatio: [],
  maxDriftRatio: 0,
  periodsS: [],
  groundAccel: [],
};

const solver = new SolverClient(
  (results) => {
    const [a, ...rest] = results;
    useConfigStore.setState({
      result: a ?? EMPTY_RESULT,
      // One result per building in play, in the same order. The engine was
      // always handed an array; it is only this store that was written for two.
      results: rest,
      status: 'idle',
      error: null,
    });
  },
  (message) => {
    useConfigStore.setState({ status: 'idle', error: message });
  },
);

/** Kick off a solve for the current inputs. */
function resolve(
  building: BuildingConfig,
  compareBuildings: readonly BuildingConfig[],
  motion: GroundMotionConfig,
  immediate = false,
) {
  useConfigStore.setState({ status: 'computing' });
  const batch = [building, ...compareBuildings];
  if (immediate) solver.requestImmediate(batch, motion);
  else solver.request(batch, motion);
}

type ConfigState = {
  /** Building A — the primary configuration. */
  building: BuildingConfig;
  /**
   * The buildings after A: B, C and D. Empty when not comparing.
   *
   * An array rather than three named fields, because the number of them is
   * already `MAX_BUILDINGS` in `compareStore` and a fourth would mean a fifth
   * there too.
   */
  compareBuildings: BuildingConfig[];
  motion: GroundMotionConfig;
  templateId: string;
  result: SimulationResult;
  /** One result per entry in `compareBuildings`, in the same order. */
  results: SimulationResult[];
  status: ComputeStatus;
  activeFloor: number | null;
  error: string | null;

  /*
   * THE DISPLAY COPIES
   *
   * These are what the controls read. They are the same objects as `building`,
   * `compareBuilding` and `motion` — the very same references — except while
   * the guided tour is on screen. Then edits land here only: the slider moves,
   * the number next to it changes, and nothing else does. The 3D model, the
   * charts and the numbers all stay on the building the tour is describing.
   *
   * Keeping them as whole objects rather than a merged partial matters: a
   * selector that built `{ ...building, ...draft }` on every read would return
   * a new reference each time and re-render forever. These only change
   * identity when the value really changes.
   *
   * The tour is explicitly about telling someone how the app works. Having it
   * explain one building while a different one grows behind the glass is worse
   * than not explaining anything.
   */
  displayBuilding: BuildingConfig;
  /** Mirrors `compareBuildings`, for the tour freeze. */
  displayCompareBuildings: BuildingConfig[];
  displayMotion: GroundMotionConfig;

  /**
   * Apply whatever was changed during the tour, and solve once.
   *
   * Called when the tour closes. Discarding instead would throw away an edit
   * the user made on purpose, and watching the building jump to a shape they
   * had already tried feels like the app losing their work.
   */
  commitTourEdits: () => void;

  /**
   * The extra buildings currently in play, as the controls would show them.
   *
   * Sliced to the compare count so a building left over from a longer
   * comparison is never carried into the next one. Read through `get()` rather
   * than closed over, so it always sees current state.
   */
  extras: () => BuildingConfig[];

  setBuilding: (patch: Partial<BuildingConfig>) => void;
  /** Patch one of the extra buildings. `index` is 0 for B. */
  setCompareBuilding: (index: number, patch: Partial<BuildingConfig>) => void;
  /** Replace the whole cast of extra buildings, e.g. when one is added. */
  setCompareBuildings: (buildings: BuildingConfig[]) => void;
  setMotion: (patch: Partial<GroundMotionConfig>) => void;
  applyTemplate: (templateId: string) => void;
  setActiveFloor: (floor: number | null) => void;
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  building: DEFAULT_BUILDING_CONFIG,
  compareBuildings: [],
  motion: DEFAULT_MOTION_CONFIG,
  // The same references, not copies. See the display-copy note above.
  displayBuilding: DEFAULT_BUILDING_CONFIG,
  displayCompareBuildings: [],
  displayMotion: DEFAULT_MOTION_CONFIG,
  templateId: DEFAULT_BUILDING_CONFIG.id,
  result: EMPTY_RESULT,
  results: [],
  status: 'computing',
  activeFloor: null,
  error: null,

  /** The extra buildings currently in play, or empty when not comparing. */
  extras: () => {
    const { count } = useCompareStore.getState();
    return count > 1 ? get().displayCompareBuildings.slice(0, count - 1) : [];
  },

  setBuilding: (patch) => {
    // Patches stack on the display copy, so a tour that is reopened mid-edit
    // keeps what the user already did.
    const next = { ...get().displayBuilding, ...patch };
    if (tourOpen()) {
      set({ displayBuilding: next, templateId: 'custom' });
      return;
    }
    set({ building: next, displayBuilding: next, templateId: 'custom' });
    resolve(next, get().extras(), get().motion);
  },

  setCompareBuilding: (index, patch) => {
    const current = get().displayCompareBuildings;
    const base = current[index] ?? get().displayBuilding;
    const next = current.map((b, i) => (i === index ? { ...base, ...patch } : b));
    if (next.length === index) next.push({ ...base, ...patch });
    if (tourOpen()) {
      set({ displayCompareBuildings: next });
      return;
    }
    set({ compareBuildings: next, displayCompareBuildings: next });
    resolve(get().building, get().extras(), get().motion);
  },

  setCompareBuildings: (buildings) => {
    if (tourOpen()) {
      set({ displayCompareBuildings: buildings });
      return;
    }
    set({ compareBuildings: buildings, displayCompareBuildings: buildings });
    resolve(get().building, get().extras(), get().motion);
  },

  setMotion: (patch) => {
    const next = { ...get().displayMotion, ...patch };
    if (tourOpen()) {
      set({ displayMotion: next });
      return;
    }
    set({ motion: next, displayMotion: next });
    // The earthquake is shared by every building, so they are all re-solved
    // together.
    resolve(get().building, get().extras(), next);
  },

  applyTemplate: (templateId) => {
    const found: BuildingTemplate | undefined = BUILDING_TEMPLATES.find((t) => t.id === templateId);
    if (!found) return;

    const building: BuildingConfig = {
      id: found.id,
      name: found.label,
      ...found.building,
      dampingRatio: undefined,
    };

    if (tourOpen()) {
      // Picked a different starting building: the controls should show it, the
      // model behind should not move.
      set({ templateId, displayBuilding: building, activeFloor: null });
      return;
    }

    set({ templateId, building, displayBuilding: building, activeFloor: null });
    resolve(building, get().extras(), get().motion);
  },

  commitTourEdits: () => {
    const { displayBuilding, displayCompareBuildings, displayMotion } = get();
    // Reference equality: the display copies are only re-created when a value
    // actually changed, so this is a sound "nothing was edited" test and skips
    // a pointless solve on every tour close. The array is compared by length
    // and element identity for the same reason.
    const unchanged =
      displayBuilding === get().building &&
      displayMotion === get().motion &&
      displayCompareBuildings.length === get().compareBuildings.length &&
      displayCompareBuildings.every((b, i) => b === get().compareBuildings[i]);
    if (unchanged) return;
    set({
      building: displayBuilding,
      compareBuildings: displayCompareBuildings,
      motion: displayMotion,
    });
    resolve(displayBuilding, get().extras(), displayMotion);
  },

  setActiveFloor: (activeFloor) => set({ activeFloor }),
}));

// Solve once as soon as the module loads, so the first paint already has real
// numbers rather than an empty state.
resolve(DEFAULT_BUILDING_CONFIG, [], DEFAULT_MOTION_CONFIG, true);

export function resolveNow(): void {
  const { building, motion, extras } = useConfigStore.getState();
  resolve(building, extras(), motion, true);
}
