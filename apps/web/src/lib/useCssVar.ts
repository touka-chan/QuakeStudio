import { useMemo, useSyncExternalStore } from 'react';

/* =========================================================================
   Reading design tokens at runtime
   -------------------------------------------------------------------------
   CSS variables work in CSS and in inline `style` objects, but they do NOT
   work in WebGL. Three.js needs a concrete colour to hand to the GPU, so
   `color="var(--drift-2)"` silently renders black.

   The token values live outside React — in the cascade, changing when the
   theme class on <html> changes — so they are read through
   useSyncExternalStore rather than copied into state. Copying them into
   state with an effect would re-render every consumer after every theme
   toggle, for no benefit.

   The cache is module-level and shared: resolving the same token in fifteen
   components should read the cascade once.
   ========================================================================= */

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
const cache = new Map<string, string>();

/** Notifies every consumer when the theme class changes. */
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  if (!observer) {
    observer = new MutationObserver(() => {
      cache.clear();
      for (const listener of listeners) listener();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

function readToken(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const value =
    typeof window === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const resolved = value || '#000000';
  cache.set(name, resolved);
  return resolved;
}

const SERVER_VALUE = '#000000';
const SEPARATOR = '\u0000';

/** Resolve one token, e.g. `useCssVar('--drift-2')`. */
export function useCssVar(name: string): string {
  return useSyncExternalStore(
    subscribe,
    () => readToken(name),
    () => SERVER_VALUE,
  );
}

/**
 * Resolve several tokens at once. Returns a stable object identity while the
 * values are unchanged, so it is safe to feed into `useMemo` chains.
 */
export function useCssVars(names: readonly string[]): Record<string, string> {
  // Join into a single string so the snapshot is comparable by value — an
  // object would be a new identity on every call and loop forever.
  const key = names.join(SEPARATOR);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => names.map(readToken).join(SEPARATOR),
    () => '',
  );

  return useMemo(() => {
    const values = snapshot === '' ? [] : snapshot.split(SEPARATOR);
    const result: Record<string, string> = {};
    for (const [index, name] of names.entries()) {
      result[name] = values[index] ?? SERVER_VALUE;
    }
    return result;
    // `key` stands in for a stable `names` array across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, key]);
}
