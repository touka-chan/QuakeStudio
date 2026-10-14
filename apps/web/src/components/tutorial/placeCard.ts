/* =========================================================================
   Where the tour card goes.

   Split out of SpotlightTour.tsx on purpose. It is the only part of the tour
   that is arithmetic rather than markup, it is the part most likely to break
   silently, and keeping it here means it can be tested directly instead of
   inferred from pixels.

   THE BUG THIS WAS WRITTEN AFTER
   The first version anchored one edge — `top` when there was room below the
   target, `bottom` when there was not — and let the browser size the card.
   That guarantees the anchored edge is right and says nothing about the other
   one. For a full-height side panel it fails outright: no room below and no
   room above, so the card was pushed off the top of the screen by exactly as
   much as there was no room. The end-to-end test caught it on step 1.
   ========================================================================= */

/** Breathing room between the card and the edge of the window. */
export const EDGE = 16;

/** Gap between the highlighted element and the outline drawn around it. */
export const OUTLINE_PAD = 8;

/** Card width, matching `max-w-[22rem]` in the component. */
export const CARD_WIDTH = 352;

/** Space between the highlighted element and the card. */
const CARD_GAP = OUTLINE_PAD + 4;

export type Box = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };

export type Viewport = { width: number; height: number };

/**
 * Choose a position for the card.
 *
 * Prefers below the target, then above, then to its right, then to its left —
 * the order a reader expects, and the order that keeps the card over the least
 * interesting part of a busy layout.
 *
 * A candidate is only used if it genuinely fits. If none do, the candidates are
 * clamped and the one furthest from the target wins: a full-height panel
 * leaves nowhere that does not overlap something, and covering part of the
 * panel is better than covering the whole viewport.
 *
 * `viewport` is passed in rather than read from `window` so the rules can be
 * tested at sizes no test runner happens to be running at.
 */
export function placeCard(
  target: Box | null,
  card: Size,
  viewport: Viewport,
): { left: number; top: number } {
  if (!target) {
    // No target: centre it. Better a card over the middle of the app than one
    // pinned to a corner that happens to be off screen.
    return {
      left: clamp((viewport.width - card.width) / 2, card.width, viewport.width),
      top: clamp((viewport.height - card.height) / 2, card.height, viewport.height),
    };
  }

  /*
   * Above, then right, then below, then left.
   *
   * Above first is a change of mind. With "below" first, the card landed below
   * its target whenever there was room, which for the compare button — the last
   * thing in the results panel, sitting near the foot of the screen — meant
   * the card sat over the content it was describing rather than over the
   * three empty columns above it.
   *
   * Reading order is the reason as much as aesthetics: a card above its subject
   * is the shape most people already expect, because that is where a caption
   * goes. Each of the four steps still lands where it should with this order —
   * the tall side panels have no room above, and fall through to beside.
   */
  const candidates: { left: number; top: number }[] = [
    { left: target.left, top: target.top - CARD_GAP - card.height },
    { left: target.left + target.width + CARD_GAP, top: target.top },
    { left: target.left, top: target.top + target.height + CARD_GAP },
    { left: target.left - CARD_GAP - card.width, top: target.top },
  ];

  /*
   * A candidate is acceptable when the card lands fully on screen AND does not
   * cover the target. Both halves matter, and neither is the same as "the clamp
   * changed nothing".
   *
   * That distinction was a real bug, and it was found by measuring the app
   * rather than by reading the code. The compare button sits eight pixels from
   * the right edge — that is the outline padding — so a card aligned to it was
   * one pixel past the limit and got clamped by one. Testing for "the clamp
   * did not move this" threw that candidate away over a single pixel, and the
   * card ended up beside the button rather than above it.
   *
   * Asking the question we actually care about — is it on screen, and is the
   * target still visible — gets the case right and does not care where the
   * target happens to sit.
   */
  for (const c of candidates) {
    const at = clampBox(c, card, viewport);
    if (!overlaps(at, card, target)) return at;
  }

  const centreX = target.left + target.width / 2;
  const centreY = target.top + target.height / 2;
  const distance = (p: { left: number; top: number }) =>
    Math.hypot(p.left + card.width / 2 - centreX, p.top + card.height / 2 - centreY);

  return candidates
    .map((c) => clampBox(c, card, viewport))
    .sort((a, b) => distance(b) - distance(a))[0]!;
}

/** Do the card and the target share any area? */
function overlaps(at: { left: number; top: number }, card: Size, target: Box): boolean {
  return (
    at.left < target.left + target.width &&
    target.left < at.left + card.width &&
    at.top < target.top + target.height &&
    target.top < at.top + card.height
  );
}

function clampBox(
  at: { left: number; top: number },
  card: Size,
  viewport: Viewport,
): { left: number; top: number } {
  return {
    left: clamp(at.left, card.width, viewport.width),
    top: clamp(at.top, card.height, viewport.height),
  };
}

/**
 * Pull a position inside the window.
 *
 * When the card simply does not fit — wider than the window allows once the
 * margins are taken off — there is no position that satisfies the rule, and
 * clamping to EDGE would push it off the far side instead. Pinning to 0 shows
 * the near edge and puts the overflow where it is least surprising.
 *
 * The card carries `max-w-[calc(100%-2rem)]`, so in a browser this case should
 * not arise. It arose in a test at 360px, which is exactly why it is handled
 * rather than assumed away.
 */
function clamp(value: number, cardSize: number, viewportSize: number): number {
  const max = viewportSize - cardSize - EDGE;
  if (max < EDGE) return 0;
  return Math.min(Math.max(EDGE, value), max);
}
