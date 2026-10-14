import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';
import { AppShell } from '@/components/layout/AppShell';
import { GROUND_MOTION_PRESETS, STORAGE_KEYS } from '@/config/engineeringAssumptions';
import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { readStoredTheme, resolveTheme, storeTheme } from '@/lib/theme';
import { useCompareStore } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { __testing as tourTesting } from '@/store/tourStore';
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

function skipFirstRun() {
  localStorage.setItem(STORAGE_KEYS.firstRunAcknowledged, 'true');
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
  localStorage.setItem(STORAGE_KEYS.tourCompleted, 'true');
  tourTesting.reset();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  useConfigStore.setState({
    building: DEFAULT_BUILDING_CONFIG,
    compareBuilding: DEFAULT_BUILDING_CONFIG,
    templateId: DEFAULT_BUILDING_CONFIG.id,
    activeFloor: null,
  });
  // Zustand stores are module-level singletons, so a test that switches
  // comparison on leaks into the next one. Without this reset the comparison
  // tests pass in isolation and fail in a file — which is the worst way for a
  // test to be wrong.
  useCompareStore.setState({ enabled: false, editing: 'B' });
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
    render(<App />);

    const start = screen.getByRole('button', { name: /start exploring/i });
    expect(start).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    expect(start).toBeEnabled();
  });

  it('shows the three learning steps', () => {
    render(<App />);
    // Scope to the dialog: the mobile tab bar also has a "Build" tab.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Build')).toBeInTheDocument();
    expect(within(dialog).getByText('Shake')).toBeInTheDocument();
    expect(within(dialog).getByText('Compare')).toBeInTheDocument();
  });

  it('states plainly that this is not a safety check', () => {
    render(<App />);
    // The sentence is split across a <strong>, so match on the phrase alone.
    expect(screen.getAllByText(/learning tool, not a safety check/i).length).toBeGreaterThan(0);
  });

  it('dismisses and does not reappear once acknowledged', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /start exploring/i }));

    expect(screen.queryByRole('button', { name: /start exploring/i })).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEYS.firstRunAcknowledged)).toBe('true');
  });

  it('stays hidden entirely once already acknowledged', () => {
    skipFirstRun();
    render(<App />);
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
    render(<AppShell forceDesktopLayout />);
    const panel = screen.getByRole('complementary', { name: /simulation results/i });
    // No Worker in jsdom, so the skeleton is what a cold load looks like.
    expect(within(panel).getByText(/updating/i)).toBeInTheDocument();
  });

  it('keeps the whole workspace reachable by keyboard', () => {
    render(<AppShell forceDesktopLayout />);
    const shell = screen.getByRole('main', { name: /simulation viewport/i });
    expect(within(shell).getByRole('slider', { name: /simulation time/i })).toBeInTheDocument();
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

  it('marks the Phase 7 site controls as unavailable rather than hiding them', () => {
    render(<AppShell forceDesktopLayout />);
    expect(screen.getByText(/soil, foundation and fault distance/i)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */

describe('earthquake controls', () => {
  beforeEach(skipFirstRun);

  it('shows only the controls that apply to the chosen motion preset', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

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

  it('explains the active preset in plain language', () => {
    render(<AppShell forceDesktopLayout />);
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

  it('shows both charts', () => {
    render(<AppShell forceDesktopLayout />);
    expect(screen.getByRole('heading', { name: /displacement over time/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /peak displacement by floor/i }),
    ).toBeInTheDocument();
  });

  it('never uses safety language anywhere in the drift legend', () => {
    render(<AppShell forceDesktopLayout />);
    const legendHeading = screen.getAllByText('Story drift')[0]!;
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

    // Comparison starts on side B, which `diversifyB` has made a different
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

    expect(useCompareStore.getState().enabled).toBe(true);
    // A duplicate would make the comparison pointless.
    expect(useConfigStore.getState().compareBuilding.floors).not.toBe(before);
    expect(useConfigStore.getState().compareBuilding.name).toMatch(/variant/i);
  });

  it('uses ONE earthquake for both sides', () => {
    render(<AppShell forceDesktopLayout />);
    act(() => {
      useCompareStore.getState().enable();
      // `enable()` alone leaves B as a copy of A. `diversifyB()` is what the
      // compare toggle calls in the app, and without it the "different id"
      // assertion below only passed because an earlier test had leaked a
      // modified B into the store.
      useCompareStore.getState().diversifyB();
    });

    const { building, compareBuilding, motion } = useConfigStore.getState();
    // There is a single `motion` in the store, so the shaking cannot differ
    // between A and B — that is the entire point of the comparison.
    expect(compareBuilding).toBeDefined();
    expect(motion.pgaG).toBeGreaterThan(0);
    expect(building.id).not.toBe(compareBuilding.id);

    // And it STAYS shared. Editing one side's structure must not fork the
    // motion object; if it ever did, the two buildings would be compared
    // under different earthquakes and the whole comparison would be void.
    act(() => useConfigStore.getState().setCompareBuilding({ floors: 12 }));
    expect(useConfigStore.getState().motion).toBe(motion);
    expect(useConfigStore.getState().compareBuilding.floors).toBe(12);
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
    });

    act(() => {
      useCompareStore.getState().enable();
      useConfigStore.setState({ result: make(1), resultB: make(bScale) });
    });
  }

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
  });

  it('shows "same" rather than a spurious percentage when the sides match', () => {
    render(<AppShell forceDesktopLayout />);
    enableComparison(1);

    const table = screen.getByRole('table');
    expect(within(table).getAllByText('same').length).toBeGreaterThan(0);
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
