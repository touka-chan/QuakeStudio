import { create } from 'zustand';

import {
  BUILDING_TEMPLATES,
  DEFAULT_BUILDING_CONFIG,
  DEFAULT_MOTION_CONFIG,
  type BuildingTemplate,
} from '@/config/templates';
import { generateMockResult } from '@/mock/mockResult';
import type { BuildingConfig, GroundMotionConfig, SimulationResult } from '@/types';

/* =========================================================================
   Config store — the single source of truth for "what building, what shaking"
   -------------------------------------------------------------------------
   Phase 1 recomputes mock results synchronously on every change. Phase 2
   replaces the two `recompute` call sites with a debounced request into the
   Web Worker. Every other part of the UI subscribes to the same fields either
   way, so nothing else has to change.

   IMPORTANT: while Phase 1 is live, `result` comes from `generateMockResult`,
   which is not physics. See the warning at the top of that file.
   ========================================================================= */

export type ComputeStatus = 'idle' | 'computing';

type ConfigState = {
  building: BuildingConfig;
  motion: GroundMotionConfig;
  templateId: string;
  result: SimulationResult;
  status: ComputeStatus;
  /** Floor highlighted in the 3D view and the charts. `null` = top floor. */
  activeFloor: number | null;

  setBuilding: (patch: Partial<BuildingConfig>) => void;
  setMotion: (patch: Partial<GroundMotionConfig>) => void;
  applyTemplate: (templateId: string) => void;
  setActiveFloor: (floor: number | null) => void;
};

function recompute(building: BuildingConfig, motion: GroundMotionConfig): SimulationResult {
  // Phase 1: synchronous mock. Phase 2: postMessage to the worker.
  return generateMockResult(building, motion);
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  building: DEFAULT_BUILDING_CONFIG,
  motion: DEFAULT_MOTION_CONFIG,
  templateId: DEFAULT_BUILDING_CONFIG.id,
  result: recompute(DEFAULT_BUILDING_CONFIG, DEFAULT_MOTION_CONFIG),
  status: 'idle',
  activeFloor: null,

  setBuilding: (patch) => {
    const building = { ...get().building, ...patch };
    set({
      building,
      // Editing any field by hand means we are no longer on a named template.
      templateId: 'custom',
      status: 'computing',
      result: recompute(building, get().motion),
    });
  },

  setMotion: (patch) => {
    const motion = { ...get().motion, ...patch };
    set({ motion, status: 'computing', result: recompute(get().building, motion) });
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
    set({
      templateId,
      building,
      result: recompute(building, get().motion),
      activeFloor: null,
      status: 'idle',
    });
  },

  setActiveFloor: (activeFloor) => set({ activeFloor }),
}));

/** Stable selector: avoids re-rendering every consumer on unrelated changes. */
export function selectResult(s: ConfigState): SimulationResult {
  return s.result;
}
