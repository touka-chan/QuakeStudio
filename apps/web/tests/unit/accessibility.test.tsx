import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe, { type AxeResults, type RunOptions } from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppShell } from '@/components/layout/AppShell';
import { STORAGE_KEYS } from '@/config/engineeringAssumptions';
import { defaultCompareBuilding, useCompareStore } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';
import { __testing as tourTesting } from '@/store/tourStore';
import type { SimulationResult } from '@/types';

/* ==========================================================================
   Accessibility audit — automated.

   axe-core checks the mechanical half of WCAG: names, roles, states, labels,
   contrast, focus order, and a set of structural rules. It is good at those
   and blind to the rest, so this file is deliberately paired with the manual
   pass recorded in docs/accessibility-audit.md.

   Two rules are switched off, and it matters that they are named rather than
   silently skipped:

     • color-contrast — jsdom does no layout, so every element has zero size
       and axe cannot compute a ratio. Contrast is checked for real in
       contrast.test.ts, against the token values, in both themes.

     • aria-hidden-focus — the Three.js canvas and decorative icons. Worth
       re-checking by hand; see the audit document.
   ========================================================================== */

const AXE_OPTIONS: RunOptions = {
  rules: {
    'color-contrast': { enabled: false },
    'aria-hidden-focus': { enabled: false },
  },
};

/** Run axe and format failures so a CI log says what is actually wrong. */
async function audit(container: Element): Promise<AxeResults> {
  return axe.run(container, AXE_OPTIONS);
}

function describeViolations(results: AxeResults): string {
  return results.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes
          .map((node) => `    ${node.target.join(' ')}\n      ${node.html.slice(0, 200)}`)
          .slice(0, 3)
          .join('\n'),
    )
    .join('\n');
}

/**
 * Dismiss the first-run dialog for every test.
 *
 * It is a modal, so Radix marks the whole workspace behind it `aria-hidden`.
 * Every role query on the app then fails, and the audit would only ever be
 * measuring the welcome dialog.
 */
/**
 * A minimal result, injected the way the worker would.
 *
 * jsdom has no Worker, so `result` stays empty and anything gated on a
 * completed simulation — Save run, the comparison table — is disabled. Seeding
 * it here keeps those surfaces reachable instead of testing only the
 * empty state.
 */
function seedResult(scale = 1): SimulationResult {
  return {
    time: [0, 0.1],
    floorDisp: [[0, 0.01 * scale]],
    peakDisp: [0.05 * scale],
    maxDisp: 0.05 * scale,
    driftRatio: [0.004 * scale],
    maxDriftRatio: 0.004 * scale,
    periodsS: [0.5 * scale],
    groundAccel: [0, 1],
  };
}

beforeEach(() => {
  localStorage.setItem(STORAGE_KEYS.firstRunAcknowledged, 'true');
  /*
   * The guided tour also runs before the workspace is usable, and it holds the
   * disclaimer gate closed while it is on screen. axe rules run against
   * whatever is on screen, so leaving it up would quietly change what is being
   * measured in every test in this file.
   *
   * `reset` as well as the key: the tour store reads storage once, when its
   * module is imported, so writing the key here is otherwise too late.
   */
  localStorage.setItem(STORAGE_KEYS.tourSuppressed, 'true');
  tourTesting.reset();
  useConfigStore.setState({ result: seedResult() });
});

afterEach(() => {
  localStorage.clear();
  useConfigStore.setState({ result: seedResult() });
});

describe('accessibility', () => {
  it('the workspace has no automatic violations', async () => {
    const { container } = render(<AppShell forceDesktopLayout />);

    const results = await audit(container);
    expect(describeViolations(results)).toBe('');
    expect(results.violations).toHaveLength(0);
  });

  it('the saved-runs dialog has no violations', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /save run/i }));
    const dialog = await screen.findByRole('dialog');

    const results = await audit(dialog);
    expect(describeViolations(results)).toBe('');
    expect(results.violations).toHaveLength(0);
  });

  it('the About & assumptions dialog has no violations on any tab', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /assumptions/i }));
    const dialog = await screen.findByRole('dialog');

    for (const tab of [/about/i, /assumptions/i, /glossary/i]) {
      await user.click(within(dialog).getByRole('tab', { name: tab }));
      const results = await audit(dialog);
      expect(describeViolations(results)).toBe('');
      expect(results.violations).toHaveLength(0);
    }
  });

  it('the dialog tabs actually switch their content', async () => {
    /*
     * The audit above would pass just as happily against a dialog whose tabs
     * did nothing — it inspects whatever is rendered. Asserting the switch
     * separately is what makes the audit meaningful.
     */
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /assumptions/i }));
    const dialog = await screen.findByRole('dialog');

    // About
    expect(within(dialog).getByText('What this is')).toBeInTheDocument();

    // Assumptions
    await user.click(within(dialog).getByRole('tab', { name: /assumptions/i }));
    expect(within(dialog).getByRole('heading', { name: 'Materials' })).toBeInTheDocument();
    expect(within(dialog).queryByText('What this is')).not.toBeInTheDocument();

    // Glossary
    await user.click(within(dialog).getByRole('tab', { name: /glossary/i }));
    expect(within(dialog).getByRole('searchbox', { name: /search glossary/i })).toBeInTheDocument();
    expect(within(dialog).queryByText('What this is')).not.toBeInTheDocument();

    // ...and back again, so the control is not one-way.
    await user.click(within(dialog).getByRole('tab', { name: /about/i }));
    expect(within(dialog).getByText('What this is')).toBeInTheDocument();
  });

  it('the usability feedback dialog has no violations', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /usability feedback/i }));
    const dialog = await screen.findByRole('dialog');

    const results = await audit(dialog);
    expect(describeViolations(results)).toBe('');
    expect(results.violations).toHaveLength(0);

    // Every scale must be a labelled radio group. A ten-row grid of unnamed
    // inputs is unusable with a screen reader, and axe cannot tell that the
    // rows correspond to the questions above them.
    const groups = within(dialog).getAllByRole('radiogroup');
    expect(groups).toHaveLength(10);
    for (const group of groups) {
      expect(group).toHaveAccessibleName();
      expect(within(group).getAllByRole('radio')).toHaveLength(5);
    }
  });

  it('comparison mode has no violations', async () => {
    // Seeded BEFORE rendering. Rendering twice leaves two shells in the
    // document, which axe correctly reports as duplicate landmarks.
    const { building } = useConfigStore.getState();
    useConfigStore.getState().setCompareBuildings([defaultCompareBuilding(0, building)]);
    useCompareStore.setState({ count: 2 });
    useConfigStore.setState({ result: seedResult(1), results: [seedResult(1.4)] });

    const { container } = render(<AppShell forceDesktopLayout />);

    const results = await audit(container);
    expect(describeViolations(results)).toBe('');
    expect(results.violations).toHaveLength(0);
  });

  it('a FOUR-building comparison has no violations either', async () => {
    /*
     * Audited at four, not two.
     *
     * Four columns of the same shape are where accessibility actually breaks:
     * the extra tab stops, the extra radio buttons, and the badge-and-name
     * pairs in every column header. Auditing only the two-building case would
     * have passed this file and shipped a broken screen at the size the client
     * actually asked for.
     */
    const { building } = useConfigStore.getState();
    useConfigStore
      .getState()
      .setCompareBuildings([
        defaultCompareBuilding(0, building),
        defaultCompareBuilding(1, building),
        defaultCompareBuilding(2, building),
      ]);
    useCompareStore.setState({ count: 4 });
    useConfigStore.setState({
      result: seedResult(1),
      results: [seedResult(1.4), seedResult(0.6), seedResult(2)],
    });

    const { container } = render(<AppShell forceDesktopLayout />);

    const results = await audit(container);
    expect(describeViolations(results)).toBe('');
    expect(results.violations).toHaveLength(0);
  });
});

/* ==========================================================================
   What axe cannot check, checked here so it is at least automated.
   ========================================================================== */

describe('things axe cannot see', () => {
  it('every control has an accessible name', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /assumptions/i }));
    await screen.findByRole('dialog');

    const controls = document.querySelectorAll('button, a[href], input, select');
    expect(controls.length).toBeGreaterThan(10);

    for (const element of controls) {
      expect(hasAccessibleName(element), `unnamed ${describeElement(element)}`).toBe(true);
    }
  });

  it('every slider exposes its current value to assistive tech', () => {
    render(<AppShell forceDesktopLayout />);

    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThan(0);

    for (const slider of sliders) {
      // Radix sliders are spans, so the value has to be carried by ARIA
      // attributes rather than read off a form value.
      expect(slider.getAttribute('aria-valuenow'), 'missing aria-valuenow').toBeTruthy();
      expect(slider.getAttribute('aria-valuemin'), 'missing aria-valuemin').toBeTruthy();
      expect(slider.getAttribute('aria-valuemax'), 'missing aria-valuemax').toBeTruthy();
      expect(slider.getAttribute('aria-label'), 'slider is unlabelled').toBeTruthy();
    }
  });

  it('no element carries an ARIA value attribute without a role', () => {
    render(<AppShell forceDesktopLayout />);

    /*
     * `aria-valuetext` and friends are only valid on elements that have a
     * role. Radix puts `role="slider"` on the Thumb, so the props must not
     * also land on the Root — which is exactly the bug this caught.
     */
    for (const element of document.querySelectorAll('[aria-valuetext], [aria-valuenow]')) {
      expect(
        element.getAttribute('role'),
        `${element.tagName} has an ARIA value but no role`,
      ).toBeTruthy();
    }
  });

  it('the dialogs can be dismissed with the keyboard', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /assumptions/i }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /assumptions/i }));
    await screen.findByRole('dialog');

    // Focus must be inside, or a keyboard user is left stranded behind the
    // overlay with no indication the dialog opened.
    //
    // Focus RESTORATION on close is asserted in the e2e suite instead: it
    // depends on real focus behaviour jsdom does not implement, and a test
    // that passes in jsdom without a real browser is worth nothing here.
    await waitFor(() => expect(dialogContainsFocus()).toBe(true));
  });

  it('never leaves a placeholder or empty accessible name behind', async () => {
    const user = userEvent.setup();
    render(<AppShell forceDesktopLayout />);

    await user.click(screen.getByRole('button', { name: /assumptions/i }));
    await screen.findByRole('dialog');

    for (const element of document.querySelectorAll('[aria-label]')) {
      const value = (element.getAttribute('aria-label') ?? '').trim();
      expect(value, `aria-label on ${element.tagName} is empty or a placeholder`).not.toMatch(
        /^(todo|tbd|placeholder|lorem|xxx|null|undefined)$/i,
      );
    }
  });

  it('states the disclaimer in text, not only as a colour', () => {
    render(<AppShell forceDesktopLayout />);

    // The disclaimer must be readable, not just tinted.
    expect(screen.getAllByText(/not a structural safety assessment/i).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ helpers */

/**
 * Whether an element resolves to an accessible name.
 *
 * Covers the ways this app actually names things: aria-label, aria-labelledby,
 * visible text, and — the case a naive check misses — an implicit label from a
 * wrapping `<label>`. The Loop checkbox is named only by its wrapper, so a
 * check that looks at the element alone reports a false positive.
 */
function hasAccessibleName(element: Element): boolean {
  if (element.getAttribute('aria-label')?.trim()) return true;
  if (element.getAttribute('aria-labelledby')?.trim()) return true;
  if (element.getAttribute('title')?.trim()) return true;
  if ((element.textContent ?? '').trim().length > 0) return true;
  if (element.closest('label')) return true;

  const id = element.getAttribute('id');
  if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return true;

  return false;
}

function describeElement(element: Element): string {
  const name = element.getAttribute('aria-label');
  const type = element.getAttribute('type');
  return `${element.tagName.toLowerCase()}${type ? `[type=${type}]` : ''}${
    name ? ` (aria-label="${name}")` : ''
  }`;
}

function dialogContainsFocus(): boolean {
  const dialog = screen.queryByRole('dialog');
  if (!dialog) return false;
  return dialog.contains(document.activeElement);
}

/** Poll until an assertion holds, or rethrow its last failure. */
async function waitFor(assertion: () => void, timeout = 1000): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeout) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}
