import { useEffect, type RefObject } from 'react';

/* =========================================================================
   useFocusTrap

   The tour is a hand-rolled overlay, not a Radix dialog, because the spotlight
   needs the real page visible and dimmed beside it — and a modal makes the
   page inert. That choice means focus management is our job rather than
   something the dialog primitive was doing for us.

   Three behaviours, all required rather than optional:

   1. Move focus into the card on open, so a keyboard user is not left behind
      on the page they can no longer see.
   2. Keep Tab inside the card. Tabbing out would drop a sighted keyboard user
      into a page they have not been told anything about.
   3. Put focus back exactly where it was on close. If we do not, a keyboard
      user is dropped onto <body> and has to tab from the top of the document
      to get back — which is what the feedback dialog's own fix was about.
   ========================================================================= */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(container: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = container.current;
    if (!root) return;

    const previous = document.activeElement as HTMLElement | null;

    function focusables(): HTMLElement[] {
      return Array.from(root!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    }

    // Focus the first control rather than the card itself, so the very first
    // Tab moves forward instead of somewhere arbitrary.
    const first = focusables()[0] ?? root;
    first.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const current = document.activeElement;

      if (event.shiftKey && (current === firstItem || current === root)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && current === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    root.addEventListener('keydown', onKeyDown);

    return () => {
      root.removeEventListener('keydown', onKeyDown);
      // `previous` can already be gone — a re-render may have unmounted it.
      if (previous && previous.isConnected) previous.focus();
    };
  }, [container, active]);
}
