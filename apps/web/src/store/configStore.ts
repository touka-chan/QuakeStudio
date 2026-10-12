import { create } from 'zustand';

import {
  BUILDING_TEMPLATES,
  DEFAULT_BUILDING_CONFIG,
  DEFAULT_MOTION_CONFIG,
  type BuildingTemplate,
} from '@/config/templates';
import { SolverClient } from '@/engine/client';
import { useCompareStore } from '@/store/compareStore';
import type { BuildingConfig, GroundMotionConfig, SimulationResult } from '@/types';

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
  templateId: DEFAULT_BUILDING_CONFIG.id,
  result: EMPTY_RESULT,
  resultB: null,
  status: 'computing',
  activeFloor: null,
  error: null,

  setBuilding: (patch) => {
    const building = { ...get().building, ...patch };
    set({
      building,
      // Editing any field by hand means we are no longer on a named template.
      templateId: 'custom',
    });
    resolve(
      building,
      useCompareStore.getState().enabled ? get().compareBuilding : null,
      get().motion,
    );
  },

  setCompareBuilding: (patch) => {
    const compareBuilding = { ...get().compareBuilding, ...patch };
    set({ compareBuilding });
    const compareEnabled = useCompareStore.getState().enabled;
    resolve(get().building, compareEnabled ? compareBuilding : null, get().motion);
  },

  setMotion: (patch) => {
    const motion = { ...get().motion, ...patch };
    set({ motion });
    // The earthquake is shared by both sides, so both are re-solved together.
    const compareEnabled = useCompareStore.getState().enabled;
    resolve(get().building, compareEnabled ? get().compareBuilding : null, motion);
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
    resolve(
      building,
      useCompareStore.getState().enabled ? get().compareBuilding : null,
      get().motion,
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
