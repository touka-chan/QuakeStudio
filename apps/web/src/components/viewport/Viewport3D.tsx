import { useCompareStore } from '@/store/compareStore';
import { CompareViewport } from './CompareViewport';
import { Viewport } from './Viewport';

/* =========================================================================
   The 3D scene, whichever mode is active.
   -------------------------------------------------------------------------
   Deliberately a thin module with no logic of its own. It exists so that
   `LazyViewport.tsx` can load BOTH viewports as a single chunk: a user who
   starts in single mode and then switches to comparison gets the second
   viewport instantly from cache, instead of paying a second Three.js
   download.
   ========================================================================== */

export function Viewport3D() {
  const compareEnabled = useCompareStore((s) => s.count > 1);

  return compareEnabled ? <CompareViewport /> : <Viewport />;
}
