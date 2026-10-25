import { afterEach, describe, expect, it, vi } from 'vitest';

import { __testing } from '@/pwa/backButton';

/* ==========================================================================
   Android hardware back button — the routing decision.

   Why this is separated from the Capacitor wiring
   --------------------------------------------------------------------------
   `registerBackButton()` needs a native plugin, so testing it means mocking
   the plugin and asserting that a listener was attached — which proves
   nothing about what back actually *does*.

   The rule being protected
   --------------------------------------------------------------------------
   The bad outcome this exists to prevent: the app goes to the background with
   a dialog still mounted, so on return everything is exactly as it was and it
   looks like nothing happened. With no tab strip in the desktop-first layout,
   a back press with no dialog open should simply leave the app to the OS.
   ========================================================================== */

const { handleBack, dialogOpen } = __testing;

/** Mount a Radix-style open dialog, the way the real ones render. */
function openDialog(state = 'open') {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('data-state', state);
  document.body.append(dialog);
  return dialog;
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

    it('does not fire into a dialog that is already closing', async () => {
      openDialog('closed');
      const onKey = vi.fn();
      document.addEventListener('keydown', onKey);

      const handled = await handleBack();

      expect(onKey).not.toHaveBeenCalled();
      expect(handled).toBe(false);
      document.removeEventListener('keydown', onKey);
    });

    it('lets the OS close the app when nothing is open', async () => {
      // No dialog and no tab strip: back should not be captured at all.
      await expect(handleBack()).resolves.toBe(false);
    });
  });
});
