import { create } from 'zustand';

import { FEATURES } from '@/content/branding';

/* =========================================================================
   UI store — cross-panel view state
   -------------------------------------------------------------------------
   Two pieces of state genuinely belong to more than one zone:

   • `assumptionsOpen` — the About & Assumptions dialog is triggered from the
     top bar AND from the floor-loads panel's info strip. The dialog itself
     still lives beside its top-bar trigger so Radix can restore focus to it.
   • `cutaway` — the 3D view's cutaway/solid choice, shared by the single and
     comparison viewports and by the toolbar above them.

   Deliberately NOT here: anything about the model. Buildings, motions and
   results live in `configStore`; this store is safe to reset without changing
   a single number.
   ========================================================================= */

export type AssumptionsTab = 'about' | 'assumptions' | 'loads' | 'glossary';

type UiState = {
  assumptionsOpen: boolean;
  assumptionsTab: AssumptionsTab;
  setAssumptionsOpen: (open: boolean) => void;
  setAssumptionsTab: (tab: AssumptionsTab) => void;
  openAssumptions: (tab?: AssumptionsTab) => void;

  /** True while the 3D view shows slabs, columns and floor contents. */
  cutaway: boolean;
  setCutaway: (cutaway: boolean) => void;
  toggleCutaway: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  assumptionsOpen: false,
  assumptionsTab: 'about',
  setAssumptionsOpen: (assumptionsOpen) => set({ assumptionsOpen }),
  setAssumptionsTab: (assumptionsTab) => set({ assumptionsTab }),
  openAssumptions: (tab = 'about') => set({ assumptionsOpen: true, assumptionsTab: tab }),

  cutaway: FEATURES.defaultCutaway,
  setCutaway: (cutaway) => set({ cutaway }),
  toggleCutaway: () => set((state) => ({ cutaway: !state.cutaway })),
}));
