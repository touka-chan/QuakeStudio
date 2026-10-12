import { create } from 'zustand';

import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Compare store — VIEW state only
   -------------------------------------------------------------------------
   Deliberately small. It holds how the two buildings are DISPLAYED, not the
   buildings themselves and not their results.

   The second building (`buildingB`) and both results live in `configStore`,
   because they must be solved in ONE worker request — two separate requests
   would race and leave one side showing numbers from different inputs. This
   store reads B from there rather than duplicating it.

   The earthquake is shared: `configStore.motion` is used for both sides, so
   any difference in the response comes from the buildings alone. That is the
   whole point of the comparison.
   ========================================================================= */

export type CompareView = 'sideBySide' | 'ghost';
export type CompareSide = 'A' | 'B';

type CompareState = {
  enabled: boolean;
  view: CompareView;
  /** Which building the controls and 3D are currently editing. */
  editing: CompareSide;

  enable: () => void;
  disable: () => void;
  setView: (view: CompareView) => void;
  setEditing: (side: CompareSide) => void;
  /** Give B a distinct starting point, so the comparison is not a duplicate. */
  diversifyB: () => void;
};

export const useCompareStore = create<CompareState>((set) => ({
  enabled: false,
  view: 'sideBySide',
  editing: 'B',

  enable: () => set({ enabled: true, editing: 'B' }),
  disable: () => set({ enabled: false, editing: 'A' }),

  setView: (view) => set({ view }),
  setEditing: (editing) => set({ editing }),

  diversifyB: () => {
    const a = useConfigStore.getState().building;
    useConfigStore.getState().setCompareBuilding({
      id: `${a.id}-variant`,
      name: `${a.name} (variant)`,
      floors: a.floors <= 8 ? a.floors + 5 : Math.max(3, a.floors - 5),
      frameType: a.frameType === 'moment' ? 'braced' : 'moment',
      material: a.material === 'concrete' ? 'steel' : 'concrete',
      widthM: a.widthM,
      depthM: a.depthM,
      floorHeightM: a.floorHeightM,
      dampingRatio: undefined,
    });
  },
}));

/** The building the controls should edit right now. */
export function editingBuilding(): 'A' | 'B' {
  return useCompareStore.getState().editing;
}

/** A sensible default for B when compare is first switched on. */
export function defaultCompareBuilding() {
  const a = useConfigStore.getState().building;
  return {
    ...a,
    id: `${a.id}-variant`,
    name: `${a.name} (variant)`,
    floors: a.floors <= 8 ? a.floors + 5 : Math.max(3, a.floors - 5),
    frameType: a.frameType === 'moment' ? ('braced' as const) : ('moment' as const),
    material: a.material === 'concrete' ? ('steel' as const) : ('concrete' as const),
    dampingRatio: undefined,
  };
}

export { DEFAULT_BUILDING_CONFIG };