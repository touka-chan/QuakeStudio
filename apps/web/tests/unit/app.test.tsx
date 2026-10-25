import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/layout/AppShell';
import { GRAVITY_MS2, GROUND_MOTION_PRESETS, STORAGE_KEYS } from '@/config/engineeringAssumptions';
import { DEFAULT_BUILDING_CONFIG, DEFAULT_MOTION_CONFIG } from '@/config/templates';
import { readStoredTheme, resolveTheme, storeTheme } from '@/lib/theme';
import { defaultCompareBuilding, useCompareStore } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { __testing as tourTesting } from '@/store/tourStore';
import { useUiStore } from '@/store/uiStore';
import type { SimulationResult } from '@/types';

/* ==========================================================================
   Phase 1 — UI shell tests
   --------------------------------------------------------------------------
   Two things to know about the setup:

   1. jsdom cannot create a WebGL context, so the 3D viewport is stubbed.
      Everything else renders for real.

   2. The first-run dialog is a Radix *modal*, so while it is open the whole
      application tree is marked aria-hidden — correctly, because assistive
      technology should not reach past a modal. Tests that exercise the
      workspace therefore acknowledge the dialog first. The dialog's own
      tests deliberately do not, and use `hidden: true` where needed.
   ========================================================================== */

vi.mock('@/components/viewport/Viewport', () => ({
  Viewport: () => <div data-testid="viewport-stub">3D viewport</div>,
}));

/**
 * A complete result for the default building.
 *
 * jsdom has no Worker, so the real solver never answers and the store would sit
 * on its empty placeholder for the whole file. Every UI assertion would then be
 * made against a skeleton — which is how a results test can pass while showing
 * no results at all. A seeded result makes the panel deterministic.
 *
 * The weight fields are filled in for the same reason: a result built before
 * floor loads existed is a real case the UI must survive, but it is tested
 * explicitly rather than being the accidental state of every other test.
 */
function seededResult(floors = DEFAULT_BUILDING_CONFIG.floors): SimulationResult {
  const weights = Array.from({ length: floors }, (_, i) => 700 + i * 120);
  const dead = Array.from({ length: floors }, (_, i) => 550 + i * 100);
  const live = weights.map((weight, i) => weight - (dead[i] ?? 0));
  return {
    time: [0, 0.05, 0.1, 0.15],
    floorDisp: Array.from({ length: floors }, (_, i) => [
      0,
      0.002 * (i + 1),
      0.004 * (i + 1),
      0.002 * (i + 1),
    ]),
    peakDisp: Array.from({ length: floors }, (_, i) => 0.004 * (i + 1)),
    maxDisp: 0.004 * floors,
    driftRatio: Array.from({ length: floors }, () => 0.004),
    maxDriftRatio: 0.004,
    periodsS: [0.52, 0.18],
    groundAccel: [0, 0.1, 0, -0.1],
    floorWeightsKN: weights,
    floorDeadKN: dead,
    floorLiveCountedKN: live,
    totalWeightKN: weights.reduce((sum, value) => sum + value, 0),
    floorMassesKg: weights.map((weight) => (weight * 1000) / GRAVITY_MS2),
  };
}

function skipFirstRun() {
  localStorage.setItem(STORAGE_KEYS.disclaimerSuppressed, 'true');
  /*
   * The guided tour runs before the disclaimer gate and holds it closed while
   * it is on screen, so a test that wants the workspace has to get past both.
   *
   * `reset` is required as well as the key. The tour store decides once, when
   * its module is first imported, and a `beforeEach` that writes localStorage
   * afterwards is too late to change a decision that has already been made.
   */
  skipTour();
}

/** Get past the guided tour only, leaving the disclaimer gate in place. */
function skipTour() {
  localStorage.setItem(STORAGE_KEYS.tourSuppressed, 'true');
  tourTesting.reset();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  useUiStore.setState({ assumptionsOpen: false, assumptionsTab: 'about', cutaway: false });
  useConfigStore.setState({
    building: DEFAULT_BUILDING_CONFIG,
    compareBuildings: [],
    result: seededResult(),
    results: [],
    status: 'idle',
    error: null,
    templateId: DEFAULT_BUILDING_CONFIG.id,
    activeFloor: null,
    /*
     * The display copies too — and the originals they shadow.
     *
     * They are the same object references as `building`, `compareBuildings` and
     * `motion` except while the tour is on screen, and the controls build every
     * edit on top of the display copy. Resetting one without the other leaves
     * the pair drifting apart, and the next thing to read them disagrees:
     * a slider press applied to whatever the previous test left behind, and a
     * preset description looked up from `motion` while the panel was showing
     * `displayMotion`.
     */
    motion: DEFAULT_MOTION_CONFIG,
    displayBuilding: DEFAULT_BUILDING_CONFIG,
    displayCompareBuildings: [],
    displayMotion: DEFAULT_MOTION_CONFIG,
  });
  // Zustand stores are module-level singletons, so a test that switches
  // comparison on leaks into the next one. Without this reset the comparison
  // tests pass in isolation and fail in a file - which is the worst way for a
  // test to be wrong.
  useCompareStore.setState({ count: 1, editing: 'A' });
});

describe('theme selection', () => {
  it('defaults to following the OS when nothing is stored', () => {
    expect(readStoredTheme()).toBe('system');
  });

  it('round-trips a stored preference', () => {
    storeTheme('dark');
    expect(readStoredTheme()).toBe('dark');
    storeTheme('light');
    expect(readStoredTheme()).toBe('light');
  });

  it('ignores a corrupt stored value rather than throwing', () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'chartreuse');
    expect(readStoredTheme()).toBe('system');
  });

  it('resolves an explicit preference without consulting the OS', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });
});

/* ------------------------------------------------------------------------ */

describe('first-run dialog', () => {
  /*
   * The tour owns the screen before the gate does, and it is skippable. These
   * tests are about the gate, so they get past the tour deliberately — and
   * deliberately do NOT acknowledge the disclaimer, which is what they are for.
   */
  beforeEach(skipTour);

  it('blocks the start button until the disclaimer is acknowledged', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    const start = screen.getByRole('button', { name: /start exploring/i });
    expect(start).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    expect(start).toBeEnabled();
  });

  it('shows the three learning steps', () => {
    render(<AppShell forceDesktopLayout />);
    // Scope to the dialog: the mobile tab bar also has a "Build" tab.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Build')).toBeInTheDocument();
    expect(within(dialog).getByText('Shake')).toBeInTheDocument();
    expect(within(dialog).getByText('Compare')).toBeInTheDocument();
  });

  it('states plainly that this is not a safety check', () => {
    render(<AppShell forceDesktopLayout />);
    // The sentence is split across a <strong>, so match on the phrase alone.
    expect(screen.getAllByText(/learning tool, not a safety check/i).length).toBeGreaterThan(0);
  });

  it('dismisses, and writes nothing that could suppress the next visit', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /start exploring/i }));

    expect(screen.queryByRole('button', { name: /start exploring/i })).not.toBeInTheDocument();
    // The old assertion here was that the acknowledgement was stored. That was
    // the behaviour at the time; the gate is meant to open on every visit now,
    // and writing the flag would silently take it back to appearing once.
    expect(localStorage.getItem(STORAGE_KEYS.disclaimerSuppressed)).toBeNull();
  });

  it('stays hidden only while something has actually suppressed it', () => {
    skipFirstRun();
    render(<AppShell forceDesktopLayout />);
    expect(screen.queryByRole('button', { name: /start exploring/i })).not.toBeInTheDocument();
  });

  /*
   * Re-rendering the app is a reload as far as the user is concerned — a
   * refresh is the simplest way to check that the gate really does come back.
   */
  it('comes back when the app is mounted again', async () => {
    const user = userEvent.setup();
    const first = render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /start exploring/i }));
    expect(screen.queryByRole('button', { name: /start exploring/i })).not.toBeInTheDocument();

    first.unmount();
    render(<AppShell forceDesktopLayout />);

    expect(screen.getByRole('button', { name: /start exploring/i })).toBeDisabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  /*
   * The escape hatch still works, and it is the only thing that does: a user
   * cannot set it, so the only way the gate stays hidden across visits is
   * something writing to storage by hand.
   */
  it('stays hidden while the gate has been suppressed', () => {
    skipFirstRun();
    render(<AppShell forceDesktopLayout />);
    expect(screen.queryByRole('button', { name: /start exploring/i })).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */

describe('app shell', () => {
  beforeEach(skipFirstRun);

  it('renders all three zones with their landmarks', () => {
    render(<AppShell forceDesktopLayout />);

    expect(screen.getByRole('complementary', { name: /controls/i })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: /simulation viewport/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /simulation results/i })).toBeInTheDocument();
  });

  it('always shows the educational-simulation disclaimer', () => {
    render(<AppShell forceDesktopLayout />);
    expect(
      screen.getByText(/educational simulation using simplified assumptions/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/not a structural safety assessment/i)).toBeInTheDocument();
  });

  it('no longer advertises the numbers as a mock preview', () => {
    render(<AppShell forceDesktopLayout />);
    // The engine shipped in Phase 2, so the "Preview numbers" notice is gone.
    // If mock data ever returns, this catches the regression.
    expect(screen.queryByText(/preview numbers/i)).not.toBeInTheDocument();
  });

  it('shows a loading state until the first result arrives', () => {
    // Cold load: the store has not been seeded with a solved result yet.
    useConfigStore.setState({ status: 'computing', result: { ...seededResult(), time: [] } });
    render(<AppShell forceDesktopLayout />);
    const panel = screen.getByRole('complementary', { name: /simulation results/i });
    expect(within(panel).getByText(/updating/i)).toBeInTheDocument();
  });

  it('keeps the whole workspace reachable by keyboard', () => {
    render(<AppShell forceDesktopLayout />);
    const shell = screen.getByRole('main', { name: /simulation viewport/i });
    expect(within(shell).getByRole('slider', { name: /simulation time/i })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */

describe('desktop notice', () => {
  beforeEach(skipFirstRun);

  it('shows the notice instead of a squeezed workspace below 1024px', () => {
    // jsdom's matchMedia reports false for every query, which is exactly the
    // narrow-screen case.
    render(<AppShell />);
    expect(
      screen.getByRole('heading', { name: /built for a laptop or desktop/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: /controls/i })).not.toBeInTheDocument();
  });

  it('continues into the desktop workspace, and does not remember that choice', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AppShell />);

    await user.click(screen.getByRole('button', { name: /continue anyway/i }));
    expect(screen.getByRole('complementary', { name: /controls/i })).toBeInTheDocument();

    // "Continue anyway" is a way through this visit, not a setting. A reload
    // (a fresh mount here) gets the honest notice again.
    unmount();
    render(<AppShell />);
    expect(screen.getByRole('button', { name: /continue anyway/i })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */

describe('floor loads', () => {
  beforeEach(skipFirstRun);

  async function openLoads() {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);
    await user.click(screen.getByRole('tab', { name: /floors & loads/i }));
    return user;
  }

  it('changes a floor use, its live load and the weight shown', async () => {
    const user = await openLoads();

    await user.click(screen.getByRole('button', { name: /floor 1/i }));
    await user.click(screen.getByRole('radio', { name: /^storage$/i }));

    const floor = useConfigStore.getState().building.floorLoads[0]!;
    expect(floor.occupancy).toBe('storage');
    expect(floor.liveLoadKPa).toBe(6);

    // Default building is 14 × 10 m. Storage: 4.8 + 0.25 × 6.0 = 6.3 kPa,
    // so 6.3 × 140 = 882 kN.
    expect(await screen.findByText(/6\.3 kPa counted/i)).toBeInTheDocument();
    expect(screen.getByText(/882 kN/)).toBeInTheDocument();
  });

  it('applies one floor to every floor, and resets them all to Office', async () => {
    const user = await openLoads();

    await user.click(screen.getByRole('button', { name: /floor 1/i }));
    await user.click(screen.getByRole('radio', { name: /^storage$/i }));
    await user.click(screen.getByRole('button', { name: /apply to all floors/i }));

    expect(
      useConfigStore
        .getState()
        .building.floorLoads.every(
          (floor) => floor.occupancy === 'storage' && floor.liveLoadKPa === 6,
        ),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: /reset every floor to office/i }));
    expect(
      useConfigStore
        .getState()
        .building.floorLoads.every(
          (floor) => floor.occupancy === 'office' && floor.liveLoadKPa === 2.4,
        ),
    ).toBe(true);
    expect(useConfigStore.getState().building.liveLoadParticipation).toBe(0.25);
  });

  it('edits a live load by hand and marks the floor Custom', async () => {
    const user = await openLoads();

    await user.click(screen.getByRole('button', { name: /floor 1/i }));
    const live = screen.getByLabelText(/^live load$/i);
    await user.clear(live);
    await user.type(live, '3.5');

    const floor = useConfigStore.getState().building.floorLoads[0]!;
    expect(floor.liveLoadKPa).toBe(3.5);
    expect(floor.occupancy).toBe('custom');
    // Both the badge and the use radio are called "Custom"; the badge is the
    // one that reports the override.
    expect(screen.getByText('Custom', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
  });

  it('changes how much live load is counted', async () => {
    const user = await openLoads();

    const slider = screen.getByRole('slider', { name: /live load counted/i });
    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(useConfigStore.getState().building.liveLoadParticipation).toBeCloseTo(0.3, 6);
    expect(screen.getAllByText(/30% of the live load/i).length).toBeGreaterThan(0);
  });

  it('opens the assumptions dialog on the floor-loads tab', async () => {
    const user = await openLoads();

    await user.click(screen.getByRole('button', { name: /how we count load/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: /floor loads/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(dialog).getByRole('heading', { name: /occupancy presets/i })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */

describe('building controls', () => {
  beforeEach(skipFirstRun);

  it('applies a template from the picker', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('combobox', { name: /building template/i }));
    await user.click(await screen.findByRole('option', { name: /10-story steel tower/i }));

    expect(useConfigStore.getState().building.floors).toBe(10);
    expect(useConfigStore.getState().building.material).toBe('steel');
  });

  it('marks the config as custom once a field is edited by hand', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    const slider = screen.getByRole('slider', { name: /floors/i });
    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(useConfigStore.getState().templateId).toBe('custom');
  });

  it('changing the floors slider updates the store', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    const slider = screen.getByRole('slider', { name: /floors/i });
    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(useConfigStore.getState().building.floors).toBe(DEFAULT_BUILDING_CONFIG.floors + 1);
  });

  it('exposes each dimension slider with its unit', () => {
    render(<AppShell forceDesktopLayout />);
    expect(screen.getByRole('slider', { name: /floor height/i })).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('m'),
    );
    expect(screen.getByRole('slider', { name: /^width$/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /^depth$/i })).toBeInTheDocument();
  });

  it('offers material and frame type as keyboard-reachable radio groups', () => {
    render(<AppShell forceDesktopLayout />);
    expect(screen.getByRole('radiogroup', { name: /material/i })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /frame type/i })).toBeInTheDocument();
  });

  it('marks the Phase 7 site controls as unavailable rather than hiding them', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);
    await user.click(screen.getByRole('tab', { name: /earthquake/i }));
    expect(screen.getByText(/soil, foundation and fault distance/i)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */

describe('earthquake controls', () => {
  beforeEach(skipFirstRun);

  it('shows only the controls that apply to the chosen motion preset', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);
    await user.click(screen.getByRole('tab', { name: /earthquake/i }));

    // Harmonic preset: frequency applies, a random seed does not.
    expect(screen.getByRole('slider', { name: /shaking frequency/i })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /random seed/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /ground motion type/i }));
    await user.click(await screen.findByRole('option', { name: /random shaking/i }));

    expect(screen.getByRole('slider', { name: /shaking frequency/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /random seed/i })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /ground motion type/i }));
    await user.click(await screen.findByRole('option', { name: /single impulse/i }));

    // An impulse has no meaningful frequency or seed to set.
    expect(screen.queryByRole('slider', { name: /shaking frequency/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /random seed/i })).not.toBeInTheDocument();
  });

  it('explains the active preset in plain language', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);
    await user.click(screen.getByRole('tab', { name: /earthquake/i }));
    const panel = screen.getByRole('complementary', { name: /controls/i });
    // Take the expected wording from the config itself, so a copy edit cannot
    // silently make this test meaningless.
    const expected = GROUND_MOTION_PRESETS[useConfigStore.getState().motion.preset].description;
    expect(within(panel).getAllByText(expected).length).toBeGreaterThan(0);
  });

  it('describes every preset in a full sentence', () => {
    for (const preset of Object.values(GROUND_MOTION_PRESETS)) {
      expect(preset.description.length).toBeGreaterThan(30);
      expect(preset.description).toMatch(/\.$/);
    }
  });
});

/* ------------------------------------------------------------------------ */

describe('results panel', () => {
  beforeEach(skipFirstRun);

  it('shows the three headline metrics', () => {
    render(<AppShell forceDesktopLayout />);
    const panel = screen.getByRole('complementary', { name: /simulation results/i });
    // "Peak displacement" also names a chart, so match the metric labels
    // exactly rather than as a substring.
    expect(within(panel).getByText('Peak displacement')).toBeInTheDocument();
    expect(within(panel).getByText('Max story drift')).toBeInTheDocument();
    expect(within(panel).getByText('Natural period')).toBeInTheDocument();
  });

  it('shows both charts on the response tab', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    // Summary is the default; the response lives behind its own tab so the
    // weight block and the numbers are not pushed below two charts.
    await user.click(screen.getByRole('tab', { name: /response/i }));

    /*
     * The charts mount behind React.lazy, so the first find waits out a module
     * fetch as well as a render. Under a parallel suite that fetch has taken
     * whole seconds, and the 1s default flaked the file against its neighbours.
     */
    expect(
      await screen.findByRole('heading', { name: /displacement over time/i }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole(
        'heading',
        { name: /peak displacement by floor/i },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
  });

  it('keeps the summary tab free of charts', async () => {
    render(<AppShell forceDesktopLayout />);
    expect(
      screen.queryByRole('heading', { name: /displacement over time/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /floor weights/i })).toBeInTheDocument();
  });

  it('says an old run has no weights instead of inventing them', () => {
    const old = seededResult();
    useConfigStore.setState({
      result: {
        ...old,
        floorWeightsKN: [],
        floorDeadKN: [],
        floorLiveCountedKN: [],
        totalWeightKN: 0,
        floorMassesKg: [],
      },
      status: 'idle',
    });

    render(<AppShell forceDesktopLayout />);
    expect(screen.getByText('Weights not recorded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /re-run with these loads/i })).toBeInTheDocument();
    expect(screen.queryByText(/^Total weight$/i)).not.toBeInTheDocument();
  });

  it('never uses safety language anywhere in the drift legend', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);
    await user.click(screen.getByRole('tab', { name: /response/i }));
    const legendHeading = (await screen.findAllByText('Story drift'))[0]!;
    const legend = legendHeading.closest('div')?.parentElement;
    expect(legend?.textContent).not.toMatch(/safe|unsafe|danger|fail|collapse/i);
  });

  it('keeps saying which building is being edited', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /compare with another building/i }));

    // The A/B switcher lives inside the scroll area and scrolls out of view;
    // the indicator above it must not. Found by the heuristic evaluation (H6).
    const heading = () => screen.getByText(/^Editing$/i);
    expect(heading()).toBeInTheDocument();

    const panel = screen.getByRole('complementary', { name: /controls/i });
    const header = () => within(panel).getByRole('status');

    // Comparison starts on side B, which has been given a genuinely different
    // building — so the header must name B and describe B, not A.
    expect(header()).toHaveTextContent(/Editing\s*B/);
    expect(header()).toHaveTextContent(/10-story steel/);

    // And it follows the switch — a label that renders once and never updates
    // would be worse than none at all, because it would be confidently wrong.
    await user.click(screen.getByRole('radio', { name: /^Building A:/ }));
    await waitFor(() => expect(header()).toHaveTextContent(/Editing\s*A/));
    expect(header()).toHaveTextContent(/5-story concrete/);
  });

  it('offers comparison, and B starts as a different building', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    const toggle = screen.getByRole('button', { name: /compare with another building/i });
    expect(toggle).toBeEnabled();

    const before = useConfigStore.getState().building.floors;
    await user.click(toggle);

    // Two to begin with, not four. The client asked for two first and for the
    // rest to be a deliberate act.
    expect(useCompareStore.getState().count).toBe(2);
    // A duplicate would make the comparison pointless.
    const b = useConfigStore.getState().compareBuildings[0]!;
    expect(b.floors).not.toBe(before);
    // A different MATERIAL, which is the comparison worth making.
    expect(b.material).not.toBe(useConfigStore.getState().building.material);
  });

  it('adds a third and a fourth building, each in a different material', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /compare with another building/i }));
    await user.click(screen.getByRole('button', { name: /add a building/i }));
    expect(useCompareStore.getState().count).toBe(3);

    await user.click(screen.getByRole('button', { name: /add a building/i }));
    expect(useCompareStore.getState().count).toBe(4);

    /*
     * Four different materials.
     *
     * This is the default that makes the feature worth having: the same
     * building in concrete, steel, composite and wood. If a future edit makes
     * two of them share a material the comparison silently becomes "the same
     * building twice", and nothing else would catch it.
     */
    const materials = [
      useConfigStore.getState().building.material,
      ...useConfigStore.getState().compareBuildings.map((b) => b.material),
    ];
    expect(materials).toHaveLength(4);
    expect(new Set(materials).size).toBe(4);

    // And a fifth is refused, out loud, rather than being a dead button.
    expect(screen.queryByRole('button', { name: /add a building/i })).not.toBeInTheDocument();
    expect(screen.getByText(/four is the limit/i)).toBeInTheDocument();
  });

  it('offers both 3D views at four buildings, and starts on side by side', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    /*
     * The client asked for this directly: three or four buildings must be able
     * to sit side by side, not be forced into the ghost overlay.
     *
     * It also happens to be the better default — a second row changes the
     * scene enough that opening on Ghost puts four translucent sheets in front
     * of each other, which reads as one building that is vaguely red rather
     * than as four.
     */
    await user.click(screen.getByRole('button', { name: /compare with another building/i }));
    // Two buildings in one row: the plain head-on view.
    expect(useCompareStore.getState().view).toBe('sideBySide');

    await user.click(screen.getByRole('button', { name: /add a building/i }));
    expect(useCompareStore.getState().count).toBe(3);
    expect(useCompareStore.getState().view).toBe('sideBySide');

    await user.click(screen.getByRole('button', { name: /add a building/i }));
    expect(useCompareStore.getState().count).toBe(4);

    // The toggle is still there at four. Hiding it was the previous behaviour
    // and it took away a view the client wants.
    const viewToggle = screen.getByRole('radiogroup', { name: /comparison view/i });
    expect(within(viewToggle).getByRole('radio', { name: /side by side/i })).toBeInTheDocument();
    expect(within(viewToggle).getByRole('radio', { name: /ghost overlay/i })).toBeInTheDocument();

    // And choosing Ghost at four sticks, even when another building is added
    // on top of it: the reset happens on the two-to-three crossing and nowhere
    // else, because a store that keeps overriding a choice the user has made
    // is a store they cannot rely on.
    await user.click(within(viewToggle).getByRole('radio', { name: /ghost overlay/i }));
    expect(useCompareStore.getState().view).toBe('ghost');

    await user.click(screen.getByRole('button', { name: /remove building C/i }));
    expect(useCompareStore.getState().count).toBe(3);
    await user.click(screen.getByRole('button', { name: /add a building/i }));
    expect(useCompareStore.getState().count).toBe(4);
    expect(useCompareStore.getState().view).toBe('ghost');
  });

  it('removes a building above A and never removes A', () => {
    render(<AppShell forceDesktopLayout />);

    act(() => {
      const { building } = useConfigStore.getState();
      useConfigStore
        .getState()
        .setCompareBuildings([
          defaultCompareBuilding(0, building),
          defaultCompareBuilding(1, building),
        ]);
      useCompareStore.setState({ count: 3 });
    });
    expect(useCompareStore.getState().count).toBe(3);

    useCompareStore.getState().removeSide('C');
    expect(useCompareStore.getState().count).toBe(2);

    // A is not removable — that is what "stop comparing" is for.
    useCompareStore.getState().removeSide('A');
    expect(useCompareStore.getState().count).toBe(2);
  });

  it('uses ONE earthquake for every building', () => {
    render(<AppShell forceDesktopLayout />);
    act(() => {
      // Setting the buildings is what the compare toggle does. Without it the
      // "different id" assertion below only passed because an earlier test had
      // leaked a modified building into the store.
      const { building } = useConfigStore.getState();
      useConfigStore
        .getState()
        .setCompareBuildings([
          defaultCompareBuilding(0, building),
          defaultCompareBuilding(1, building),
          defaultCompareBuilding(2, building),
        ]);
      useCompareStore.setState({ count: 4 });
    });

    const { building, compareBuildings, motion } = useConfigStore.getState();
    // There is a single `motion` in the store, so the shaking cannot differ
    // between any of them — that is the entire point of the comparison.
    expect(compareBuildings).toHaveLength(3);
    expect(motion.pgaG).toBeGreaterThan(0);
    const ids = [building.id, ...compareBuildings.map((b) => b.id)];
    expect(new Set(ids).size).toBe(4);

    // And it STAYS shared. Editing one side's structure must not fork the
    // motion object; if it ever did, the buildings would be compared under
    // different earthquakes and the whole comparison would be void.
    act(() => useConfigStore.getState().setCompareBuilding(1, { floors: 12 }));
    expect(useConfigStore.getState().motion).toBe(motion);
    expect(useConfigStore.getState().compareBuildings[1]!.floors).toBe(12);
    // Editing one must not disturb the others.
    expect(useConfigStore.getState().compareBuildings[0]!.floors).not.toBe(12);
  });

  /**
   Switch comparison on with two known results.
   *
   * jsdom has no Worker, so `result` is empty and every change column would
   * read "—". Hand-built results with fixed numbers let the change column be
   * checked for something real.
   */
  function enableComparison(bScale = 1) {
    const make = (scale: number): SimulationResult => ({
      time: [0, 0.1],
      floorDisp: [[0, 0.01 * scale]],
      peakDisp: [0.05 * scale],
      maxDisp: 0.05 * scale,
      driftRatio: [0.004 * scale],
      maxDriftRatio: 0.004 * scale,
      periodsS: [0.5 * scale],
      groundAccel: [0, 1],
      floorWeightsKN: Array.from({ length: 5 }, () => 1000),
      floorDeadKN: Array.from({ length: 5 }, () => 800),
      floorLiveCountedKN: Array.from({ length: 5 }, () => 200),
      totalWeightKN: 5000,
      floorMassesKg: Array.from({ length: 5 }, () => 5000 / GRAVITY_MS2),
    });

    act(() => {
      // The building matters as much as the count: with a count of 2 and no
      // extra building in the store, the table renders a single column and
      // every change cell reads "not comparable" — which looks like a
      // passing test and proves nothing.
      const { building } = useConfigStore.getState();
      useConfigStore.getState().setCompareBuildings([defaultCompareBuilding(0, building)]);
      useCompareStore.setState({ count: 2 });
      useConfigStore.setState({ result: make(1), results: [make(bScale)] });
    });
  }

  /**
   * Four buildings, with a known result each.
   *
   * The scales are 1, 1.5, 0.5 and 2, so the change column has to say +50 %,
   * −50 % and +100 % all at once. That is the point: a four-column table where
   * the columns happened to agree would pass a test that only ever checked one.
   */
  function enableFourWayComparison() {
    /*
     * A hand-built result with EVERY index filled in.
     *
     * The first version of this made a one-element `peakDisp`, which reads as
     * "0.0 mm" on a five-storey building — the metric card indexes by floor, and
     * `peakDisp[4]` on a one-element array is undefined. A test that asserted
     * "50" then failed for a reason that had nothing to do with what it was
     * checking, and the obvious response — loosen the assertion — would have
     * left it proving nothing at all.
     */
    const make = (scale: number, floors = 20): SimulationResult => ({
      time: [0, 0.1],
      floorDisp: [Array.from({ length: floors }, () => 0.01 * scale)],
      peakDisp: Array.from({ length: floors }, () => 0.05 * scale),
      maxDisp: 0.05 * scale,
      driftRatio: Array.from({ length: floors }, () => 0.004 * scale),
      maxDriftRatio: 0.004 * scale,
      periodsS: [0.5 * scale, 0.2 * scale],
      groundAccel: [0, 1],
      floorWeightsKN: Array.from({ length: floors }, () => 1000),
      floorDeadKN: Array.from({ length: floors }, () => 800),
      floorLiveCountedKN: Array.from({ length: floors }, () => 200),
      totalWeightKN: floors * 1000,
      floorMassesKg: Array.from({ length: floors }, () => 1000 / GRAVITY_MS2),
    });

    act(() => {
      const { building } = useConfigStore.getState();
      useConfigStore
        .getState()
        .setCompareBuildings([
          defaultCompareBuilding(0, building),
          defaultCompareBuilding(1, building),
          defaultCompareBuilding(2, building),
        ]);
      useCompareStore.setState({ count: 4 });
      useConfigStore.setState({ result: make(1), results: [make(1.5), make(0.5), make(2)] });
    });
  }

  it('gives every building in a four-way comparison its own column', () => {
    render(<AppShell forceDesktopLayout />);
    enableFourWayComparison();

    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    // Four building columns plus "Measure" and "vs A".
    expect(headers).toHaveLength(6);
    // Each names its building AND its letter — colour is not the only cue, and
    // the letter is what makes four near-identical columns legible.
    for (const side of ['A', 'B', 'C', 'D']) {
      expect(
        headers.some((th) => th.textContent?.includes(side)),
        `no column header mentions building ${side}`,
      ).toBe(true);
    }

    // Three distinct changes against A, all present at once. Several measures
    // share a figure, so these are counted rather than found once.
    expect(within(table).getAllByText('+50 %').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('−50 %').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('+100 %').length).toBeGreaterThan(0);
  });

  it('names the count honestly rather than saying "both" under four columns', () => {
    render(<AppShell forceDesktopLayout />);
    enableFourWayComparison();
    // A caption that says "both buildings" above four columns is quietly wrong,
    // and a wrong caption costs the reader more than no caption at all. Two of
    // them, in fact — the table's own footer and the hint under the button.
    expect(screen.getByText(/All 4 buildings felt the identical earthquake/i)).toBeInTheDocument();
    expect(screen.getByText(/4 buildings felt the same earthquake/i)).toBeInTheDocument();
    expect(screen.queryByText(/both buildings felt/i)).not.toBeInTheDocument();
  });

  it('says which building the metric cards belong to, and follows the selection', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);
    enableFourWayComparison();

    const panel = screen.getByRole('complementary', { name: /results/i });
    const owner = () => within(panel).getByTestId('results-owner');
    const peak = () => within(panel).getByTestId('metric-peak-disp-value');

    // Every building is scaled differently, so its peak is 50 / 75 / 25 / 100 mm
    // and the card's NUMBER changes with the selection.
    //
    // Asserting the caption alone would not catch the bug this replaced: the
    // caption is driven by `editing` while the numbers were hard-wired to A, so
    // a caption that updates perfectly sits above a card showing the wrong
    // building's answer. It looked right and was wrong, which is the worst
    // combination available.
    expect(owner()).toHaveTextContent('Building A');
    expect(peak()).toHaveTextContent('50');

    await user.click(screen.getByRole('radio', { name: /^Building D:/ }));
    await waitFor(() => expect(owner()).toHaveTextContent('Building D'));
    expect(peak()).toHaveTextContent('100');

    await user.click(screen.getByRole('radio', { name: /^Building C:/ }));
    await waitFor(() => expect(owner()).toHaveTextContent('Building C'));
    expect(peak()).toHaveTextContent('25');
  });

  it('shows the A/B table with a percentage change', () => {
    render(<AppShell forceDesktopLayout />);
    // B sways 50% more than A.
    enableComparison(1.5);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Peak displacement')).toBeInTheDocument();
    expect(within(table).getByText('Max story drift')).toBeInTheDocument();
    expect(within(table).getByText('Natural period')).toBeInTheDocument();

    // (1.5 - 1) / 1 = +50 %
    expect(within(table).getAllByText(/\+50\s*%/).length).toBeGreaterThan(0);
    expect(within(table).getAllByText('▲').length).toBeGreaterThan(0);
    // And each change says whose it is, which is the cue that survives a
    // colour deficiency and the only one that survives four buildings.
    expect(
      within(table).getAllByLabelText(/Building B: \+50 percent against A/).length,
    ).toBeGreaterThan(0);
  });

  it('adds weight, counted live share and mass to the comparison', () => {
    render(<AppShell forceDesktopLayout />);
    enableComparison(1.5);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Total weight')).toBeInTheDocument();
    expect(within(table).getByText('Counted live share')).toBeInTheDocument();
    expect(within(table).getByText('Total mass')).toBeInTheDocument();

    // Both hand-built results carry 5 × 1,000 kN, of which 5 × 200 kN is
    // counted live. They are equal, so the comparison is "same" — the point
    // here is that the values exist at all.
    expect(within(table).getAllByText('5,000 kN')).toHaveLength(2);
    expect(within(table).getAllByText('20 %')).toHaveLength(2);
    expect(within(table).getAllByText('2.5 t')).toHaveLength(2);
  });

  it('shows "same" rather than a spurious percentage when the sides match', () => {
    render(<AppShell forceDesktopLayout />);
    enableComparison(1);

    const table = screen.getByRole('table');
    /*
     * Read through the accessible name, not the printed text.
     *
     * Each change cell now carries its building's letter ("B same"), because
     * at four buildings an unlabelled "same" is a figure belonging to nobody.
     * Asserting on the label checks what a screen reader actually announces,
     * which is the thing that has to be right.
     */
    expect(within(table).getAllByLabelText(/the same as A/i).length).toBeGreaterThan(0);
  });

  it('marks a decrease with a down arrow, not just a minus sign', () => {
    render(<AppShell forceDesktopLayout />);
    enableComparison(0.5);

    const table = screen.getByRole('table');
    // Direction carried by an arrow as well as the sign, so the meaning does
    // not depend on reading a minus.
    expect(within(table).getAllByText('▼').length).toBeGreaterThan(0);
    // U+2212 MINUS SIGN, not a hyphen — it aligns with digits.
    expect(within(table).getAllByText('\u221250 %').length).toBeGreaterThan(0);
  });

  it('never says which building is better', () => {
    render(<AppShell forceDesktopLayout />);
    enableComparison();

    const table = screen.getByRole('table');
    expect(table.textContent ?? '').not.toMatch(/better|worse|safer|stronger|weaker/i);
  });
});

/* ------------------------------------------------------------------------ */

describe('playback bar', () => {
  beforeEach(skipFirstRun);

  beforeEach(() => {
    usePlaybackStore.setState({ time: 0, playing: false, speed: 1, loop: true });
  });

  it('starts paused, so nothing moves until the user asks', () => {
    render(<AppShell forceDesktopLayout />);
    expect(screen.getByRole('button', { name: /^play$/i })).toBeEnabled();
    expect(usePlaybackStore.getState().playing).toBe(false);
    expect(usePlaybackStore.getState().time).toBe(0);
  });

  it('toggles between play and pause', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /^play$/i }));
    expect(screen.getByRole('button', { name: /^pause$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
  });

  it('offers a motion exaggeration control labelled in real terms', () => {
    render(<AppShell forceDesktopLayout />);
    const slider = screen.getByRole('slider', { name: /motion exaggeration/i });
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('times real movement'),
    );
  });

  it('states that the numbers are unexaggerated even when the view is not', () => {
    render(<AppShell forceDesktopLayout />);
    expect(screen.getByText(/drawn 20× larger/i)).toBeInTheDocument();
    expect(screen.getByText(/the numbers themselves are not exaggerated/i)).toBeInTheDocument();
  });

  it('moves the readout when the timeline is scrubbed', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    const slider = screen.getByRole('slider', { name: /simulation time/i });
    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('slider', { name: /simulation time/i })).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('seconds'),
    );
    expect(usePlaybackStore.getState().time).toBeGreaterThan(0);
  });

  it('exposes speed and loop as keyboard-reachable controls', () => {
    render(<AppShell forceDesktopLayout />);
    expect(screen.getByRole('radiogroup', { name: /playback speed/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /loop/i })).toBeInTheDocument();
  });
});
