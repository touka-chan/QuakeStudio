/* =========================================================================
   The tour's backdrop, in one place.

   Two presentations, two entirely different mechanisms: the spotlight is a
   hand-rolled overlay that blurs with `backdrop-filter` and cuts a hole in the
   blur with `clip-path`; the narrow-screen tour is a Radix dialog over its own
   plain `bg-black/50` scrim.

   That split is what let the background go unblurred below the desktop
   breakpoint and stay that way through a whole round of work on it. The blur
   was measured, strengthened, desaturated and given tests — all of it on the
   spotlight, because the tests happened to run at a desktop width. A second
   mechanism with its own copy of "the page behind is softened" is a thing that
   drifts, and this is the drift.

   So there is one number now, and both presentations read it.
   ========================================================================= */

/**
 * How much the page behind is softened.
 *
 * NOT 3px ANYMORE ON ITS OWN, AND NOT 6px — the third ingredient is `saturate`.
 *
 * With `blur(3px)` alone, 93% of the 3D canvas's high-contrast edges were
 * already gone. The blur was reaching the WebGL canvas all along, and "it is
 * blurred" was technically true. What was not true is that it *looked* blurred:
 * 3px does almost nothing to a large smooth surface, and the dark theme's
 * near-black dim does almost nothing on an already dark background.
 *
 * `saturate` is what fixes it. Darkening cannot make an inactive area read as
 * inactive on a dark background — there is nowhere darker to go. Draining the
 * colour can, and it costs a fraction of what a wider blur costs. 6px was
 * photographed against 3px with the desaturation on both and the two are not
 * distinguishable to the eye.
 */
export const TOUR_BLUR_PX = 3;

/** How much colour is left in the background. */
export const TOUR_SATURATE = 0.55;

/**
 * The backdrop filter itself, ready for a `backdropFilter` style.
 *
 * Exported whole so no caller has to reassemble it — a half-typed one is how a
 * presentation quietly loses the desaturation and keeps only the blur.
 */
export const TOUR_BACKDROP_FILTER = `blur(${TOUR_BLUR_PX}px) saturate(${TOUR_SATURATE})`;
