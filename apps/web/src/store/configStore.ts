import { create } from 'zustand';

import {
  BUILDING_TEMPLATES,
  DEFAULT_BUILDING_CONFIG,
  DEFAULT_MOTION_CONFIG,
  type BuildingTemplate,
} from '@/config/templates';
import { SolverClient } from '@/engine/client';
import type { BuildingConfig, GroundMotionConfig, SimulationResult } from '@/types';

/* =========================================================================
   Config store — the single source of truth for "what building, what shaking"
   -------------------------------------------------------------------------
   Every change to the building or the motion triggers a re-solve in the
   Web Worker, debounced at 150 ms. Results arrive asynchronously; `status`
   tells the UI whether to show "Updating…".

   The stale-response problem is handled in SolverClient by request id, so the
   numbers on screen always match the controls the user can see — even when
   they drag a slider faster than the solver can respond.
   ========================================================================= */

export type ComputeStatus = 'idle' | 'computing';

export type EngineInfo = {
  /** Wall-clock time of the last solve, in ms. Shown as a diagnostic. */
  solveMs: number;
  /** True when the worker is unavailable and we fell back to the main thread. */
  usedFallback: boolean;
};

type ConfigState = {
  building: BuildingConfig;
  motion: GroundMotionConfig;
  templateId: string;
  result: SimulationResult;
  status: ComputeStatus;
  activeFloor: number | null;
  error: string | null;
  engineInfo: EngineInfo;

  setBuilding: (patch: Partial<BuildingConfig>) => void;
  setMotion: (patch: Partial<GroundMotionConfig>) => void;
  applyTemplate: (templateId: string) => void;
  setActiveFloor: (floor: number | null) => void;
};

/** One client for the app's lifetime. */
const solver = new SolverClient(
  (result) => {
    useConfigStore.setState({ result, status: 'idle', error: null });
  },
  (message) => {
    useConfigStore.setState({ status: 'idle', error: message });
  },
);

/** Kick off a solve for the current inputs. */
function resolve(building: BuildingConfig, motion: GroundMotionConfig, immediate = false) {
  useConfigStore.setState({ status: 'computing' });
  if (immediate) solver.requestImmediate(building, motion);
  else solver.request(building, motion);
}

/**
 * Placeholder shown until the worker's first response lands.
 *
 * Declared before the store: a const in the temporal dead zone would throw on
 * the store's very first evaluation.
 */
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

export const useConfigStore = create<ConfigState>((set, get) => ({
  building: DEFAULT_BUILDING_CONFIG,
  motion: DEFAULT_MOTION_CONFIG,
  templateId: DEFAULT_BUILDING_CONFIG.id,
  // Replaced by the worker's first response immediately on load; this empty
  // result means the panels render their skeleton rather than a stale value.
  result: EMPTY_RESULT,
  status: 'computing',
  activeFloor: null,
  error: null,
  engineInfo: { solveMs: 0, usedFallback: false },

  setBuilding: (patch) => {
    const building = { ...get().building, ...patch };
    set({
      building,
      // Editing any field by hand means we are no longer on a named template.
      templateId: 'custom',
    });
    resolve(building, get().motion);
  },

  setMotion: (patch) => {
    const motion = { ...get().motion, ...patch };
    set({ motion });
    resolve(get().building, motion);
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
    set({ templateId, building, activeFloor: null });
    resolve(building, get().motion);
  },

  setActiveFloor: (activeFloor) => set({ activeFloor }),
}));

// Solve once as soon as the module loads, so the first paint already has real
// numbers rather than an empty state.
resolve(DEFAULT_BUILDING_CONFIG, DEFAULT_MOTION_CONFIG, true);
