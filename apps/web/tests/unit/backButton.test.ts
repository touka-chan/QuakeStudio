import { afterEach, describe, expect, it, vi } from 'vitest';

import { BACK_REQUESTED, __testing } from '@/pwa/backButton';

/* ==========================================================================
   Android hardware back button — the routing decision.

   Why this is separated from the Capacitor wiring
   --------------------------------------------------------------------------
   `registerBackButton()` needs a native plugin, so testing it means mocking
   the plugin and asserting that a listener was attached — which proves
   nothing about what back actually *does*.

   The behaviour worth pinning down is the decision: a dialog closes first,
   otherwise a non-Build tab returns to Build, otherwise the OS is allowed to
   close the app. That is pure logic over the DOM, so it is tested here
   directly through the `__testing` export.

   The rule being protected
   --------------------------------------------------------------------------
   The bad outcome this exists to prevent: the app goes to the background with
   a dialog still mounted, so on return everything is exactly as it was and it
   looks like nothing happened. Every case below therefore asserts the return
   value too — `false` means "we got out of the way", and the wrong `false` is
   what drops the user out of the app.
   ========================================================================== */

const { handleBack, dialogOpen, activeTab } = __testing;

/** Mount a Radix-style open dialog, the way the real ones render. */
function openDialog(state = 'open') {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('data-state', state);
  document.body.append(dialog);
  return dialog;
}

/** Mount the mobile tab strip with one tab selected. */
function selectedTab(label: string) {
  const tab = document.createElement('button');
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'true');
  tab.textContent = label;
  document.body.append(tab);
  return tab;
}

/*
 * Testing-library's `cleanup()` unmounts React roots; it does not touch nodes
 * these helpers appended by hand. Without this reset a dialog opened in one
 * test is still mounted in the next, which is exactly how a suite starts
 * failing for reasons that have nothing to do with the code under test.
 */
afterEach(() => {
  document.body.innerHTML = '';
});

describe('back button', () => {
  describe('dialogOpen', () => {
    it('is false on a clear screen', () => {
      expect(dialogOpen()).toBe(false);
    });

    it('is true while a dialog is open', () => {
      openDialog();
      expect(dialogOpen()).toBe(true);
    });

    it('is false for a dialog mid-close', () => {
      /*
       * `data-state="closed"` is what Radix leaves behind while the close
       * animation plays. Counting it as open would mean a fast double-back
       * dispatches Escape into a dialog that is already leaving, which is how
       * the back button ends up fighting itself.
       */
      openDialog('closed');
      expect(dialogOpen()).toBe(false);
    });

    it('sees an alertdialog too, not only a dialog', () => {
      const alert = document.createElement('div');
      alert.setAttribute('role', 'alertdialog');
      alert.setAttribute('data-state', 'open');
      document.body.append(alert);
      expect(dialogOpen()).toBe(true);
    });
  });

  describe('activeTab', () => {
    it('is null on a desktop layout, which has no tab strip', () => {
      expect(activeTab()).toBeNull();
    });

    it.each([
      ['Build', 'build'],
      ['Simulate', 'simulate'],
      ['Results', 'results'],
    ])('reads %s as the %s tab', (label, expected) => {
      selectedTab(label);
      expect(activeTab()).toBe(expected);
    });

    it('ignores a tab that is not selected', () => {
      const tab = selectedTab('Results');
      tab.setAttribute('aria-selected', 'false');
      expect(activeTab()).toBeNull();
    });
  });

  describe('handleBack', () => {
    it('closes an open dialog and keeps the user in the app', async () => {
      openDialog();
      const onKey = vi.fn();
      document.addEventListener('keydown', onKey);

      const handled = await handleBack();

      expect(handled).toBe(true);
      /*
       * Escape is dispatched rather than Radix being driven directly, so focus
       * restoration runs on the same path a keyboard user gets. Asserted
       * because the previous bug in this area was exactly focus not returning.
       */
      expect(onKey).toHaveBeenCalledTimes(1);
      expect(onKey.mock.calls[0][0]).toMatchObject({ key: 'Escape' });
      document.removeEventListener('keydown', onKey);
    });

    it('closes the dialog rather than switching tabs', async () => {
      openDialog();
      selectedTab('Results');
      const onBack = vi.fn();
      document.addEventListener(BACK_REQUESTED, onBack);

      await handleBack();

      expect(onBack).not.toHaveBeenCalled();
      document.removeEventListener(BACK_REQUESTED, onBack);
    });

    it('returns to Build from another tab', async () => {
      selectedTab('Results');
      const onBack = vi.fn();
      document.addEventListener(BACK_REQUESTED, onBack);

      const handled = await handleBack();

      expect(handled).toBe(true);
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onBack.mock.calls[0][0]).toMatchObject({ detail: { tab: 'build' } });
      document.removeEventListener(BACK_REQUESTED, onBack);
    });

    it('does not fire into a dialog that is already closing', async () => {
      /*
       * Found by mutating the source: the `dialogOpen` cases above all call it
       * directly, so changing what `handleBack` does with the answer slipped
       * past the suite entirely.
       *
       * With a dialog mid-close, back must fall through to the tab rule. If it
       * does not, a fast double-back dispatches Escape into a dialog that is
       * already leaving — the button ends up fighting itself at the exact
       * moment the user is trying to leave.
       */
      openDialog('closed');
      selectedTab('Results');
      const onKey = vi.fn();
      const onBack = vi.fn();
      document.addEventListener('keydown', onKey);
      document.addEventListener(BACK_REQUESTED, onBack);

      const handled = await handleBack();

      expect(onKey).not.toHaveBeenCalled();
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(handled).toBe(true);

      document.removeEventListener('keydown', onKey);
      document.removeEventListener(BACK_REQUESTED, onBack);
    });

    it('lets the OS close the app from Build, where there is nowhere to go', async () => {
      selectedTab('Build');
      const onBack = vi.fn();
      document.addEventListener(BACK_REQUESTED, onBack);

      const handled = await handleBack();

      expect(handled).toBe(false);
      expect(onBack).not.toHaveBeenCalled();
      document.removeEventListener(BACK_REQUESTED, onBack);
    });

    it('lets the OS close the app on a desktop layout', async () => {
      // No tabs and no dialogs: back should not be captured at all.
      await expect(handleBack()).resolves.toBe(false);
    });
  });
});
