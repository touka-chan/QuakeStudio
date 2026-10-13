import { lazy, Suspense } from 'react';

import { describeBuilding } from '@/lib/describeBuilding';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   The 3D viewport, loaded on demand.
   -------------------------------------------------------------------------
   Three.js is the single heaviest dependency in this app — the largest share
   of the 1.9 MB bundle. Deferring it lets the controls, playback bar and
   results render and become usable while it streams in, rather than the page
   staying blank until everything has downloaded and parsed.

   Both viewports live in ONE lazy chunk (`Viewport3D.tsx`) deliberately.
   Splitting them would pull Three.js in twice over a session for no gain: the
   view opened first pays the download, and the other then arrives from cache
   at the same moment.

   The fallback names the building rather than showing a bare spinner, so a
   user arriving during the gap is told what is about to appear instead of
   being left looking at an empty rectangle.
   ========================================================================== */

const Viewport3D = lazy(() =>
  import('@/components/viewport/Viewport3D').then((module) => ({ default: module.Viewport3D })),
);

export function LazyViewport() {
  return (
    <Suspense fallback={<ViewportPlaceholder />}>
      <Viewport3D />
    </Suspense>
  );
}

function ViewportPlaceholder() {
  const building = useConfigStore((s) => s.building);

  return (
    <div
      className="grid h-full w-full place-items-center bg-[var(--viewport-bg)] px-6 text-center"
      role="status"
    >
      <p className="text-sm text-muted-foreground">
        Preparing the 3D view of the {describeBuilding(building)}…
      </p>
    </div>
  );
}
