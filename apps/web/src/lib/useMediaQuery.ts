import { useCallback, useSyncExternalStore } from 'react';

/* =========================================================================
   Media query hook
   -------------------------------------------------------------------------
   The OS settings QuakeStudio must respect: reduced motion (start paused, lower
   default speed) and the desktop breakpoint (the workspace vs the notice).

   Read through useSyncExternalStore rather than an effect + state, so a
   component never renders once with a stale answer and again with the real one.
   ========================================================================= */

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  // No meaningful server snapshot; assume "no match" during SSR.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** True when the OS asks for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * The three-zone desktop workspace breakpoint, from the brief (>=1024px).
 *
 * Exported as an override so tests can force the desktop layout. jsdom has no
 * layout engine, so every matchMedia query reports "no match" — without an
 * override a component test would silently exercise the mobile layout and
 * miss the three-zone workspace entirely.
 */
export function useIsDesktop(force?: boolean): boolean {
  const matches = useMediaQuery(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
  return force ?? matches;
}

export const DESKTOP_MIN_WIDTH = 1024;
