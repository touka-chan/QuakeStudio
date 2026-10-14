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
    const compareEnabled = useCompareStore.getState().enabled;
    const [a, b] = results;
    useConfigStore.setState({
      result: a ?? EMPTY_RESULT,
      resultB: compareEnabled ? (b ?? null) : null,
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
  compareBuilding: BuildingConfig | null,
  motion: GroundMotionConfig,
  immediate = false,
) {
  useConfigStore.setState({ status: 'computing' });
  const batch = compareBuilding ? [building, compareBuilding] : [building];
  if (immediate) solver.requestImmediate(batch, motion);
  else solver.request(batch, motion);
}

type ConfigState = {
  /** Building A — the primary configuration. */
  building: BuildingConfig;
  /** Building B — only used when comparison is on. */
  compareBuilding: BuildingConfig;
  motion: GroundMotionConfig;
  templateId: string;
  result: SimulationResult;
  resultB: SimulationResult | null;
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
  displayCompareBuilding: BuildingConfig;
  displayMotion: GroundMotionConfig;

  /**
   * Apply whatever was changed during the tour, and solve once.
   *
   * Called when the tour closes. Discarding instead would throw away an edit
   * the user made on purpose, and watching the building jump to a shape they
   * had already tried feels like the app losing their work.
   */
  commitTourEdits: () => void;

  setBuilding: (patch: Partial<BuildingConfig>) => void;
  setCompareBuilding: (patch: Partial<BuildingConfig>) => void;
  setMotion: (patch: Partial<GroundMotionConfig>) => void;
  applyTemplate: (templateId: string) => void;
  setActiveFloor: (floor: number | null) => void;
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  building: DEFAULT_BUILDING_CONFIG,
  compareBuilding: { ...DEFAULT_BUILDING_CONFIG },
  motion: DEFAULT_MOTION_CONFIG,
  // The same references, not copies. See the display-copy note above.
  displayBuilding: DEFAULT_BUILDING_CONFIG,
  displayCompareBuilding: { ...DEFAULT_BUILDING_CONFIG },
  displayMotion: DEFAULT_MOTION_CONFIG,
  templateId: DEFAULT_BUILDING_CONFIG.id,
  result: EMPTY_RESULT,
  resultB: null,
  status: 'computing',
  activeFloor: null,
  error: null,

  setBuilding: (patch) => {
    // Patches stack on the display copy, so a tour that is reopened mid-edit
    // keeps what the user already did.
    const next = { ...get().displayBuilding, ...patch };
    if (tourOpen()) {
      set({ displayBuilding: next, templateId: 'custom' });
      return;
    }
    set({ building: next, displayBuilding: next, templateId: 'custom' });
    resolve(next, useCompareStore.getState().enabled ? get().compareBuilding : null, get().motion);
  },

  setCompareBuilding: (patch) => {
    const next = { ...get().displayCompareBuilding, ...patch };
    if (tourOpen()) {
      set({ displayCompareBuilding: next });
      return;
    }
    set({ compareBuilding: next, displayCompareBuilding: next });
    const compareEnabled = useCompareStore.getState().enabled;
    resolve(get().building, compareEnabled ? next : null, get().motion);
  },

  setMotion: (patch) => {
    const next = { ...get().displayMotion, ...patch };
    if (tourOpen()) {
      set({ displayMotion: next });
      return;
    }
    set({ motion: next, displayMotion: next });
    // The earthquake is shared by both sides, so both are re-solved together.
    const compareEnabled = useCompareStore.getState().enabled;
    resolve(get().building, compareEnabled ? get().compareBuilding : null, next);
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
    resolve(
      building,
      useCompareStore.getState().enabled ? get().compareBuilding : null,
      get().motion,
    );
  },

  commitTourEdits: () => {
    const { displayBuilding, displayCompareBuilding, displayMotion } = get();
    // Reference equality: the display copies are only re-created when a value
    // actually changed, so this is a sound "nothing was edited" test and skips
    // a pointless solve on every tour close.
    if (
      displayBuilding === get().building &&
      displayCompareBuilding === get().compareBuilding &&
      displayMotion === get().motion
    ) {
      return;
    }
    set({
      building: displayBuilding,
      compareBuilding: displayCompareBuilding,
      motion: displayMotion,
    });
    resolve(
      displayBuilding,
      useCompareStore.getState().enabled ? displayCompareBuilding : null,
      displayMotion,
    );
  },

  setActiveFloor: (activeFloor) => set({ activeFloor }),
}));

// Solve once as soon as the module loads, so the first paint already has real
// numbers rather than an empty state.
resolve(DEFAULT_BUILDING_CONFIG, null, DEFAULT_MOTION_CONFIG, true);

/** Convenience for callers that need to re-solve after a compare-mode change. */
export function resolveNow(): void {
  const { building, compareBuilding, motion } = useConfigStore.getState();
  resolve(building, useCompareStore.getState().enabled ? compareBuilding : null, motion, true);
}
