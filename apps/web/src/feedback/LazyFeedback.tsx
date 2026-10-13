import { lazy, Suspense } from 'react';

/* =========================================================================
   The usability questionnaire, loaded on demand.
   -------------------------------------------------------------------------
   The Feedback dialog is a study instrument. Every real user of QuakeStudio —
   a student working through a seismic design exercise — will never open it,
   so shipping its form controls in the entry chunk is weight nobody spends.

   The fallback is `null` rather than a skeleton, because there is nothing to
   reserve: a dialog has no layout until it opens, and a placeholder rectangle
   would only flash where no content should be. The chunk is a few kilobytes
   against a ~175 KB entry bundle, so it arrives long before the dialog's open
   transition would have finished.

   Bundled separately for the same reason as `Charts-*` and `Viewport3D-*`, and
   `bundle.test.ts` asserts the chunk exists so this cannot silently regress
   into the entry bundle.
   ========================================================================== */

const FeedbackDialog = lazy(() =>
  import('@/feedback/FeedbackDialog').then((module) => ({ default: module.FeedbackDialog })),
);

/**
 * The dialog body only. The `<Dialog>` root and its `<DialogTrigger>` belong
 * to `TopBar`, next to the button that opens this — that is what lets Radix
 * restore focus when the dialog closes.
 */
export function LazyFeedback() {
  return (
    <Suspense fallback={null}>
      <FeedbackDialog />
    </Suspense>
  );
}
