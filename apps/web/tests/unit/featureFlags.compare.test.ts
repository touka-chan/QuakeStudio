import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The comparison capability read at runtime.
 *
 * `compareEnabled: false` used to leave the button on screen untouched. The
 * store now refuses to turn comparison on, which is the layer a stale control
 * or a future caller cannot bypass. Mock the branding module so the switch is
 * off for this file only.
 */
vi.mock('@/content/branding', async () => {
  const defaults = await vi.importActual<typeof import('@/content/brandingDefaults')>(
    '@/content/brandingDefaults',
  );
  return {
    BRANDING: defaults.DEFAULT_BRANDING,
    FEATURES: { ...defaults.DEFAULT_FEATURES, compareEnabled: false },
    TOUR_UI: defaults.DEFAULT_TOUR_UI,
    WELCOME: defaults.DEFAULT_WELCOME,
  };
});

import { useCompareStore } from '@/store/compareStore';

describe('comparison capability', () => {
  beforeEach(() => {
    useCompareStore.setState({ count: 1, editing: 'A' });
  });

  it('cannot be switched on when the admin turned comparison off', () => {
    useCompareStore.getState().enable();
    expect(useCompareStore.getState().count).toBe(1);

    useCompareStore.getState().addSide();
    expect(useCompareStore.getState().count).toBe(1);
  });
});
