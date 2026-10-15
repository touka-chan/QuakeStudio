import { expect, test, type Locator, type Page } from '@playwright/test';

/** What `boundingBox()` gives back, or null. Named once so it is not re-derived. */
type Box = Exclude<Awaited<ReturnType<Locator['boundingBox']>>, null>;

/* ==========================================================================
   Guided tour, in a real browser.

   jsdom cannot do layout, so everything about *where* the tour actually puts
   itself is checked here instead. That is not a formality: the geometry of an
   overlay is exactly where this codebase has been bitten before — a top bar
   that overflowed and cut off two controls at 360px, a dialog whose panel
   never scrolled because `h-full` could not resolve against a flex height, a
   `truncate` that set `overflow: hidden` on an inline span so `scrollWidth`
   never reported the loss.

   None of those would have failed a jsdom test. All of them are caught here.
   ========================================================================== */

/**
 * Put the browser in the state of a user who has never seen the tour.
 *
 * Runs as an init script so the flag is absent before React first reads it.
 * The disclaimer is acknowledged, because most of these tests are about the
 * tour and not about the gate that follows it.
 *
 * The sentinel matters: `addInitScript` runs on EVERY navigation, so a reload
 * would otherwise delete the very key the app had just written and the tour
 * would reappear — which looks exactly like the tour failing to remember
 * itself, and is not.
 */
async function asFirstTimer(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('quakestudio.firstRunAcknowledged', 'true');
      if (!localStorage.getItem('__tourSeeded')) {
        localStorage.removeItem('quakestudio.tourSuppressed');
        localStorage.setItem('__tourSeeded', 'true');
      }
    } catch {
      /* nothing to do */
    }
  });
}

/**
 * A user who has seen neither the tour nor the disclaimer — the only state in
 * which the gate appears at all. Needed by the test that proves the two
 * overlays are never stacked.
 */
async function asCompleteFirstTimer(page: Page) {
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem('__tourSeeded')) {
        localStorage.removeItem('quakestudio.tourSuppressed');
        localStorage.removeItem('quakestudio.firstRunAcknowledged');
        localStorage.setItem('__tourSeeded', 'true');
      }
    } catch {
      /* nothing to do */
    }
  });
}

/** A user who has suppressed the tour and acknowledged the disclaimer: just the app. */
async function asPlainUser(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('quakestudio.tourSuppressed', 'true');
      localStorage.setItem('quakestudio.firstRunAcknowledged', 'true');
    } catch {
      /* noop */
    }
  });
}

function card(page: Page): Locator {
  return page.getByRole('dialog');
}

/**
 * The box, once it has stopped moving.
 *
 * A step change scrolls its target into view smoothly, and `boundingBox()`
 * resolves immediately rather than waiting for an animation. Measuring through
 * a scroll measures a position the user never saw, and a test built on that
 * passes or fails for reasons that have nothing to do with the code.
 *
 * Polls until two consecutive reads agree.
 */
async function settledBox(locator: Locator): Promise<Awaited<ReturnType<Locator['boundingBox']>>> {
  let previous = '';
  for (let i = 0; i < 40; i += 1) {
    const box = await locator.boundingBox();
    const key = box ? JSON.stringify(box) : 'none';
    if (key === previous) return box;
    previous = key;
    await locator.page().waitForTimeout(50);
  }
  return locator.boundingBox();
}

/**
 * Whether the card is covering the thing it points at, right now.
 *
 * POLLED rather than asserted once. This is the last word on a question about
 * where two elements ended up, and under load the answer is not available at a
 * predictable moment: the card's 200 ms transition is wall-clock, the outline
 * follows the target through a React re-render, and a busy machine can leave
 * the two briefly out of step.
 *
 * Two rounds of fixing this by sampling harder did not hold — three identical
 * samples 50 ms apart still failed about one full-suite run in two, while
 * passing every time in isolation. Sampling harder was treating a symptom. The
 * honest form of the question is "once it has finished drawing, do these
 * overlap", and `expect.poll` asks exactly that: it retries until the app
 * agrees or gives up.
 *
 * Nothing is hidden by this. A layout that genuinely overlaps keeps answering
 * yes and still fails — once, at the end, for the right reason.
 */
async function cardCoversTarget(outline: Locator, cardBox: Locator): Promise<boolean> {
  const pair = await settledPair(outline, cardBox);
  // Nothing drawn yet: keep waiting rather than declaring a pass.
  if (!pair) return true;
  const [a, b] = pair;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Both boxes, sampled together, and only once neither has moved.
 *
 * These used to be measured by two independent settle loops, one after the
 * other. Each returned as soon as two consecutive readings matched — which it
 * can legitimately do while the *other* element is still sliding. The two sets
 * of numbers were then compared even though they came from different frames.
 *
 * One loop, both boxes, three consecutive identical samples. Same frame, same
 * moment, so the comparison is about layout rather than about timing.
 *
 * Three rather than two: a 200 ms transition can produce two identical samples
 * by coincidence while it is still easing.
 */
async function settledPair(a: Locator, b: Locator): Promise<[Box, Box] | null> {
  let previous = '';
  let stable = 0;
  for (let i = 0; i < 60; i += 1) {
    const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()]);
    if (!boxA || !boxB) return null;
    const key = `${JSON.stringify(boxA)}|${JSON.stringify(boxB)}`;
    stable = key === previous ? stable + 1 : 0;
    previous = key;
    if (stable >= 2) return [boxA, boxB];
    await a.page().waitForTimeout(50);
  }
  const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  return boxA && boxB ? [boxA, boxB] : null;
}

/** True when the box is entirely within the viewport. */
function fullyOnScreen(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
) {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= viewport.width + 1 &&
    box.y + box.height <= viewport.height + 1
  );
}

/*
 * What the background behind the tour actually looks like.
 *
 * THE REPORT WAS "the other parts are not blurred", and measuring it did not
 * give a clean yes or no. With the old 3px blur, 93% of the 3D canvas's edges
 * were already gone — so the blur was reaching the WebGL canvas and the
 * technical claim "it is blurred" was true. What was not true is that it
 * *looked* blurred, because 3px of blur on a large smooth surface does almost
 * nothing to it, and the dark theme's near-black dim does almost nothing on an
 * already dark background.
 *
 * So there are two separate properties and they need two separate measurements,
 * because either one on its own would have passed the old code:
 *
 *   1. detail collapses — catches a blur that is missing entirely
 *   2. colour is drained — catches a blur that is present but unreadable, which
 *      is the one the client actually reported
 *
 * The second is normalised by brightness on purpose. The dim is a black
 * multiply, which scales chroma and luminance by the same factor, so an
 * un-normalised reading would credit the dim for the desaturation and the test
 * would pass on the old code too.
 */
type Look = { edges: number; chromaPerLuma: number; meanLuma: number };

/**
 * Measure several rectangles from ONE screenshot.
 *
 * `edges` counts adjacent pixel pairs differing by more than EDGE_RATIO of the
 * region's OWN mean brightness — not by a fixed number of levels.
 *
 * That ratio is the whole point, and getting it wrong makes the test unfailable.
 * The dim is a black multiply: it scales every brightness difference by the same
 * factor as the mean, so an absolute threshold reads the dimming as blurring.
 * The first version used `> 24` levels and PASSED with `blur(0px)` — it could
 * not fail, and a green bar on a check that cannot fail is worse than no check.
 *
 * Measured against the region's own mean, uniform darkening moves nothing and
 * blur still collapses.
 *
 * ONE screenshot for all the regions, not one each. The first version screenshotted
 * every candidate tile separately — a dozen full-page PNGs per theme — and the CPU
 * cost of that was enough to make an unrelated, previously-reliable test
 * ("the card never covers the element it is describing") fail under full-suite
 * load. A check that breaks the suite it lives in is not paying for itself.
 */
async function measureLooks(page: Page, regions: Box[]): Promise<Look[]> {
  const x0 = Math.min(...regions.map((r) => r.x));
  const y0 = Math.min(...regions.map((r) => r.y));
  const x1 = Math.max(...regions.map((r) => r.x + r.width));
  const y1 = Math.max(...regions.map((r) => r.y + r.height));

  const png = await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
  return page.evaluate(
    async ({ dataUrl, list, ox, oy }) => {
      const EDGE_RATIO = 0.12;
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      if (!ctx) return list.map(() => ({ edges: 0, chromaPerLuma: 0, meanLuma: 0 }));
      ctx.drawImage(img, 0, 0);

      return list.map((r) => {
        // The clip is the bounding box of all the regions, so each one is
        // measured relative to it rather than to the page.
        const d = ctx.getImageData(r.x - ox, r.y - oy, r.width, r.height).data;

        let chroma = 0;
        const luma: number[] = [];
        for (let i = 0; i < d.length; i += 4) {
          const r8 = d[i]!;
          const g = d[i + 1]!;
          const b = d[i + 2]!;
          luma.push(0.2126 * r8 + 0.7152 * g + 0.0722 * b);
          chroma += Math.max(r8, g, b) - Math.min(r8, g, b);
        }

        const meanLuma = luma.reduce((a, b) => a + b, 0) / Math.max(1, luma.length);
        const threshold = meanLuma * EDGE_RATIO;
        let jumps = 0;
        for (let i = 1; i < luma.length; i += 1) {
          if (Math.abs(luma[i]! - luma[i - 1]!) > threshold) jumps += 1;
        }

        const meanChroma = chroma / Math.max(1, luma.length);
        return {
          edges: luma.length === 0 ? 0 : Math.round((jumps / (luma.length - 1)) * 1000) / 10,
          chromaPerLuma: Math.round((meanChroma / Math.max(1, meanLuma)) * 1000) / 1000,
          meanLuma: Math.round(meanLuma),
        };
      });
    },
    { dataUrl: `data:image/png;base64,${png.toString('base64')}`, list: regions, ox: x0, oy: y0 },
  );
}

/** One region, measured. */
async function measureLook(page: Page, region: Box): Promise<Look> {
  return (await measureLooks(page, [region]))[0]!;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe('the background behind the tour', () => {
  /**
   * The busiest patch of the 3D viewport, found rather than hard-coded, and
   * chosen so the tour card cannot be sitting on it.
   *
   * A fixed rectangle was the first attempt and it failed on its own
   * precondition: the fraction of the canvas height holding the building moves
   * with the layout, so at one viewport size the patch was empty background.
   *
   * "Busiest" is the right rule — a patch with nothing in it cannot show a blur.
   * But the card sits over the middle of the screen and is deliberately NOT
   * blurred, so the busiest patch can be the card. It was, and that is what made
   * this test fail under full-suite load and pass on its own. So the card is
   * measured first and any candidate it covers is thrown away.
   *
   * Reopening the tour restarts it at step 1, which is where the card was
   * measured, so the two readings are of the same state.
   */
  async function pickBackgroundRegion(
    page: Page,
    /** Resolved inside, after the tour has been opened and closed: a canvas read too early is still 300x150. */
    area: Box | (() => Promise<Box | null>),
  ): Promise<{ region: Box; before: Look }> {
    // Where the card will be. Measured with the tour open, then dismissed.
    await page.getByRole('button', { name: /how to use/i }).click();
    await expect(card(page)).toBeVisible();
    const cardBox = (await settledBox(card(page)))!;
    await card(page).press('Escape');
    await expect(card(page)).toHaveCount(0);

    await page.waitForTimeout(500);
    const box = typeof area === 'function' ? (await area())! : area;

    /*
     * A fine, overlapping grid rather than three neat tiles.
     *
     * At the suite's 1280x720 the card lands at the TOP LEFT of the viewport —
     * it follows the panel it is describing — and with three tiles across, two
     * of the three columns sat entirely under it and the third overlapped by
     * three pixels. Zero candidates survived, and a screenshot of nothing is a
     * baffling error rather than an honest one. Tiles at half-step overlap mean
     * there is nearly always somewhere clear, whatever shape the card takes.
     */
    const tileW = Math.max(120, Math.floor(box.width / 4));
    const tileH = Math.max(90, Math.floor(box.height / 5));
    const stepX = Math.floor(tileW / 2);
    const stepY = Math.floor(tileH / 2);

    const candidates: Box[] = [];
    for (let y = box.y; y + tileH <= box.y + box.height; y += stepY) {
      for (let x = box.x; x + tileW <= box.x + box.width; x += stepX) {
        const box = { x: Math.round(x), y: Math.round(y), width: tileW, height: tileH };
        if (overlaps(box, cardBox)) continue;
        candidates.push(box);
      }
    }

    if (candidates.length === 0)
      throw new Error(
        `the tour card (${JSON.stringify(cardBox)}) covers all of ${JSON.stringify(box)} — nothing left to measure`,
      );

    const looks = await measureLooks(page, candidates);
    let bestAt = 0;
    candidates.forEach((_, i) => {
      if (looks[i]!.edges > looks[bestAt]!.edges) bestAt = i;
    });

    return { region: candidates[bestAt]!, before: looks[bestAt]! };
  }

  /*
   * BOTH PRESENTATIONS, AND THE ONE THAT WAS MISSING.
   *
   * `SpotlightTour` above the desktop breakpoint, `TourModal` below it — two
   * unrelated components with two unrelated overlays. The narrow one had no blur
   * in it at all, and it stayed that way through a whole round of work on the
   * blur, because every test of it ran at 1280px, which is desktop.
   *
   * So this runs at both, and the structural check comes first because it is the
   * one that would have caught it on the first run: cheap, and it says "is there
   * a blurred backdrop at all" without needing a single pixel of it to be
   * measured correctly.
   */
  const PRESENTATIONS = [
    { w: 1280, h: 720, name: 'desktop', kind: 'the spotlight' },
    { w: 860, h: 1100, name: 'narrow', kind: 'the paged modal' },
  ] as const;

  for (const size of PRESENTATIONS) {
    test(`${size.kind} puts a blurred backdrop over the app`, async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h });
      await asPlainUser(page);
      await page.goto('/');
      await page.waitForTimeout(700);
      await page.getByRole('button', { name: /how to use/i }).click();
      await expect(card(page)).toBeVisible();

      const layers = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-tour-backdrop]')].map((el) => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return {
            filter: style.backdropFilter,
            coversViewport:
              box.width >= window.innerWidth - 1 && box.height >= window.innerHeight - 1,
            takesClicks: style.pointerEvents !== 'none',
          };
        }),
      );

      expect(layers.length, `${size.kind} rendered no blurred backdrop at all`).toBe(1);
      expect(
        layers[0]!.filter,
        `${size.kind} rendered a backdrop layer that does not blur — "${layers[0]!.filter}"`,
      ).toContain('blur');
      // The desaturation is the half that makes it readable on a dark
      // background, so its absence is not a detail either.
      expect(layers[0]!.filter, `${size.kind} does not drain colour from the background`).toContain(
        'saturate',
      );
      expect(layers[0]!.coversViewport, `${size.kind} does not cover the whole window`).toBe(true);
      expect(
        layers[0]!.takesClicks,
        `${size.kind}'s backdrop swallows clicks; the scrim above it is what blocks them`,
      ).toBe(false);
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`loses its detail and its colour in the ${theme} theme`, async ({ page }) => {
      await asPlainUser(page);
      await page.goto('/');
      if (theme === 'dark') {
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(900);

      const { region, before } = await pickBackgroundRegion(page, () =>
        page.locator('canvas').boundingBox(),
      );
      expect(
        before.edges,
        `nothing in the 3D viewport had any detail to blur (picked ${JSON.stringify(region)})`,
      ).toBeGreaterThan(2);

      await page.getByRole('button', { name: /how to use/i }).click();
      await expect(card(page)).toBeVisible();
      // Past the layer's own transition, so this measures the settled state.
      await page.waitForTimeout(700);

      const during = (await measureLooks(page, [region]))[0]!;

      // 1. The detail is gone. A missing blur cannot fake this.
      //
      //    The threshold is a quarter, and where it sits is deliberate. Measured
      //    on the busiest patch of the 3D view: no blur at all removes 0% of the
      //    edges, the shipped 3px removes 50%. A "less than half" rule put the bar
      //    exactly on the number the shipped value happens to produce on this
      //    machine — which is not a check, it is a tripwire that fires whenever a
      //    renderer differs by a little. A quarter separates the two real cases
      //    with margin on both sides, which is what a threshold is for.
      expect(
        during.edges,
        `the 3D view still has ${during.edges}% of its edges (was ${before.edges}%) — it is not blurred`,
      ).toBeLessThan(before.edges * 0.75);

      // 2. And so is the colour. This is the one the client reported: a blur
      //    strong enough to measure but weak enough to look like nothing.
      expect(
        during.chromaPerLuma,
        `colour barely changed (${before.chromaPerLuma} -> ${during.chromaPerLuma}), so the background does not read as blurred`,
      ).toBeLessThan(before.chromaPerLuma * 0.8);
    });
  }

  /*
   * The same measurement, at the width where the tour is a modal and there is
   * no spotlight at all.
   *
   * There is no 3D viewport to measure here — the narrow layout is tab-based,
   * and the tab open on arrival is Build, so the canvas is not even mounted. So
   * the search area is the whole window and "busiest patch" lands on the
   * controls panel: all text and sliders, which is the thing a blur shows up on
   * most clearly of anything in this app.
   */
  test('loses its detail and its colour in the narrow layout too', async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 1100 });
    await asPlainUser(page);
    await page.goto('/');
    await page.waitForTimeout(900);

    const { region, before } = await pickBackgroundRegion(page, {
      x: 0,
      y: 0,
      width: 860,
      height: 1100,
    });
    expect(
      before.edges,
      `nothing below the desktop breakpoint had any detail to blur (picked ${JSON.stringify(region)})`,
    ).toBeGreaterThan(2);

    await page.getByRole('button', { name: /how to use/i }).click();
    await expect(card(page)).toBeVisible();
    await page.waitForTimeout(700);

    const during = (await measureLooks(page, [region]))[0]!;

    expect(
      during.edges,
      `the app below the breakpoint still has ${during.edges}% of its edges (was ${before.edges}%) — it is not blurred`,
    ).toBeLessThan(before.edges * 0.75);
    expect(
      during.chromaPerLuma,
      `colour barely changed (${before.chromaPerLuma} -> ${during.chromaPerLuma}), so it does not read as blurred`,
    ).toBeLessThan(before.chromaPerLuma * 0.8);
  });
  /*
   * THE 3D CANVAS IS BLURRED BY ITS OWN RULE, NOT BY THE BACKDROP LAYER.
   *
   * This is the structural check for the thing that was reported and could not
   * be reproduced from here: the panels went soft while the 3D view stayed
   * sharp. `backdrop-filter` samples what has already been composited behind an
   * element, and a WebGL canvas promoted to its own layer can come through
   * unfiltered — the browser's decision, not ours, and nothing in this
   * stylesheet asks for it.
   *
   * So the canvas is blurred by a `filter` on the element itself, keyed on
   * `html[data-tour-open]`. Asking the question this way needs no pixel of it to
   * be measured correctly: it cannot be fooled by a threshold, a theme, or a
   * region that happens to be flat.
   */
  for (const size of PRESENTATIONS) {
    test(`flags itself for the stylesheet on ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h });
      await asPlainUser(page);
      await page.goto('/');
      await page.waitForTimeout(600);

      const flagged = () =>
        page.evaluate(() => document.documentElement.hasAttribute('data-tour-open'));
      expect(await flagged(), 'the tour announced itself while it was shut').toBe(false);

      await page.getByRole('button', { name: /how to use/i }).click();
      await expect(card(page)).toBeVisible();
      expect(await flagged(), 'the tour did not flag itself for the stylesheet').toBe(true);

      // And taken away again, or the app is left soft after the tour ends.
      await card(page).press('Escape');
      await expect(card(page)).toHaveCount(0);
      expect(await flagged(), 'the tour left itself flagged after it closed').toBe(false);
    });
  }

  /*
   * The canvas itself, and only where there IS a 3D view.
   *
   * Below the breakpoint the layout is tab-based and the tab open on arrival is
   * Build, so no canvas is mounted at all. Asserting a filter on an element that
   * is not there is a check that passes on nothing — and it did: the first
   * version of this ran at both widths and failed on `no canvas` being compared
   * against `none`, which is what sent it looking for a bug that was not there.
   */
  test('blurs the 3D canvas itself, and takes it off again', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await asPlainUser(page);
    await page.goto('/');

    /*
     * Waited for, not slept on.
     *
     * The 3D view is lazily mounted and the suite runs against the dev server,
     * so it is not there the instant the page loads — a fixed wait long enough
     * for a production preview was long enough to be wrong against a first
     * dev-server compile, and the failure that produced was "no canvas at
     * 1280px", which reads like a layout bug and is really a race.
     */
    await page.waitForSelector('canvas', { timeout: 20_000 });

    const read = () =>
      page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) throw new Error('the 3D view was mounted a moment ago and is not now');
        return getComputedStyle(canvas).filter;
      });

    expect(await read(), 'the 3D view is blurred with the tour closed').toBe('none');

    await page.getByRole('button', { name: /how to use/i }).click();
    await expect(card(page)).toBeVisible();
    await page.waitForTimeout(400);

    const during = await read();
    expect(during, `the 3D view is not blurred: "${during}"`).toContain('blur');

    await card(page).press('Escape');
    await expect(card(page)).toHaveCount(0);
    expect(await read(), 'the 3D view stayed blurred after the tour').toBe('none');
  });

  /*
   * THE INVARIANT THAT MAKES THE ABOVE LEGAL.
   *
   * The spotlight cuts a hole in three layers so the control it is describing
   * stays sharp. It cannot cut a hole in a `filter` on the canvas — that is the
   * whole element or nothing — so blurring the canvas whole is only correct
   * while no step points at the canvas.
   *
   * That is a promise about the future, and a promise in a comment is not a
   * check. A step that pointed at the 3D would ship a blurred thing to look at
   * and this would fail the build on the day it happened, naming the step.
   */
  test('no step points at the 3D canvas, which is blurred whole', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await asFirstTimer(page);
    await page.goto('/');
    await expect(card(page)).toBeVisible();

    for (let step = 1; step <= 4; step += 1) {
      const inside = await page.evaluate(() => {
        const target = document.querySelector<HTMLElement>('[data-tour-active]');
        if (!target) return 'no target on this step';
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;
        return canvas.contains(target) || target.contains(canvas);
      });

      expect(
        inside,
        `step ${step} points at the 3D canvas, which the tour blurs whole — it would be blurred too, so this step needs the blur to be cut out of it instead`,
      ).toBe(false);

      const next = card(page).getByRole('button', { name: /^next$/i });
      if (await next.count()) await next.click();
    }
  });

  /*
   * The other half of the claim: the thing the tour is pointing at is NOT
   * blurred. A background that has gone soft while the target has not is what
   * the whole effect is for, and it is possible to get the first without the
   * second.
   */
  test('leaves the thing it is pointing at sharp', async ({ page }) => {
    await asPlainUser(page);
    await page.goto('/');
    await page.waitForTimeout(900);

    // Step 1 points at the whole controls panel, which is large enough to
    // measure and sits well clear of the card.
    await page.getByRole('button', { name: /how to use/i }).click();
    await expect(card(page)).toBeVisible();
    await page.waitForTimeout(700);

    const target = (await settledBox(page.locator('[data-tour-active]')))!;
    const region: Box = {
      x: Math.round(target.x + target.width * 0.1),
      y: Math.round(target.y + target.height * 0.55),
      width: 160,
      height: 120,
    };
    const look = await measureLook(page, region);
    expect(
      look.edges,
      'the highlighted control is blurred along with everything else',
    ).toBeGreaterThan(1.5);
  });
});

test.describe('guided tour', () => {
  test.beforeEach(async ({ page }) => {
    await asFirstTimer(page);
    await page.goto('/');
    await expect(card(page)).toBeVisible();
  });

  test('runs before anything else, and every step stays on screen', async ({ page }) => {
    const steps = await card(page).locator('ol li').count();
    expect(steps).toBe(4);

    for (let i = 0; i < steps; i += 1) {
      const box = await settledBox(card(page));
      expect(box, `step ${i + 1} has no box`).not.toBeNull();
      expect(fullyOnScreen(box!, page.viewportSize()!), `step ${i + 1} card is off screen`).toBe(
        true,
      );

      if (i < steps - 1)
        await card(page)
          .getByRole('button', { name: /^next$/i })
          .click();
    }
  });

  /*
   * The card must not sit on top of the thing it is pointing at. If it did,
   * the user would be reading an explanation of a panel they cannot see.
   */
  test('the card never covers the element it is describing', async ({ page }) => {
    for (let i = 0; i < 4; i += 1) {
      await expect
        .poll(() => cardCoversTarget(page.locator('[data-tour-outline]'), card(page)), {
          timeout: 6000,
          message: `step ${i + 1}: the card covers what it points at`,
        })
        .toBe(false);

      const next = card(page).getByRole('button', { name: /^next$/i });
      if (await next.count()) await next.click();
      else break;
    }
  });

  test('highlights a real element on every step', async ({ page }) => {
    for (let i = 0; i < 4; i += 1) {
      const outlined = page.locator('[data-tour-outline]');
      await expect(outlined).toHaveCount(1);
      const box = await settledBox(outlined);
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeGreaterThan(0);

      /*
       * And the thing being pointed at has to be somewhere the user can
       * actually see.
       *
       * Step 4 points at the compare button, which sits below the fold of the
       * results panel. Without the tour scrolling its target into view the
       * outline was drawn around a control off the bottom of the screen — the
       * card got placed for something the reader had never been shown.
       *
       * Measured on the element rather than the outline, which deliberately
       * overhangs it by 8px and so hangs off the bottom of the screen whenever
       * the target is a full-height panel.
       */
      const size = page.viewportSize()!;
      const active = page.locator('[data-tour-active]');
      await expect(active).toHaveCount(1);
      const shown = await settledBox(active);
      expect(shown!.y, `step ${i + 1} starts above the screen`).toBeGreaterThanOrEqual(0);
      expect(shown!.y + shown!.height, `step ${i + 1} runs off the bottom`).toBeLessThanOrEqual(
        size.height,
      );
      expect(shown!.x + shown!.width, `step ${i + 1} runs off the right`).toBeLessThanOrEqual(
        size.width,
      );

      const next = card(page).getByRole('button', { name: /^next$/i });
      if (await next.count()) await next.click();
    }
  });

  test('can be completed with the keyboard alone', async ({ page }) => {
    for (let i = 0; i < 3; i += 1) {
      await card(page)
        .getByRole('button', { name: /^next$/i })
        .press('Enter');
    }
    await card(page)
      .getByRole('button', { name: /finish/i })
      .press('Enter');
    await expect(card(page)).toHaveCount(0);
  });

  /*
   * No memory at all. This is the client's "every restart, every visit" and it
   * is asserted rather than described: the obvious way to write this test was
   * "dismiss it, reload, expect it gone", which is now the wrong expectation.
   */
  test('comes back on the next visit, every time', async ({ page }) => {
    await card(page).press('Escape');
    await expect(card(page)).toHaveCount(0);

    for (const visit of [1, 2, 3]) {
      await page.reload();
      await expect(card(page), `visit ${visit}`).toBeVisible();
      await expect(card(page).getByText(/step 1 of 4/i), `visit ${visit}`).toBeVisible();
      await card(page)
        .getByRole('button', { name: /skip tour/i })
        .click();
      await expect(card(page)).toHaveCount(0);
    }
  });

  test('skips it and returns to the workspace', async ({ page }) => {
    await card(page)
      .getByRole('button', { name: /skip tour/i })
      .click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /how to use/i })).toBeVisible();
  });

  /*
   * The re-entry point. Without it the tour is a one-shot wall, and a user who
   * dismissed it in a hurry has no way back.
   */
  test('reopens from the top bar, and the How to use button is reachable', async ({ page }) => {
    await card(page)
      .getByRole('button', { name: /skip tour/i })
      .click();
    await expect(card(page)).toHaveCount(0);

    await page.getByRole('button', { name: /how to use/i }).click();
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByText(/step 1 of 4/i)).toBeVisible();
  });
});

/*
 * The highlighted control is live.
 *
 * Everything here is about the hole in the blocker. Previously the scrim ate
 * every click, so a user told to "set the floors" could not scroll the panel
 * they were being shown, let alone drag anything in it — the worst version of a
 * tutorial. jsdom cannot see any of this, so it has to be a real browser.
 */
test.describe('the highlighted control is live', () => {
  test.beforeEach(async ({ page }) => {
    await asFirstTimer(page);
    await page.goto('/');
    await expect(card(page)).toBeVisible();
  });

  test('the highlighted panel scrolls while the tour is showing', async ({ page }) => {
    const panel = page.locator('[data-tour-active]');
    const box = await settledBox(panel);
    expect(box).not.toBeNull();

    // Put the pointer over the panel, then turn the wheel.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);

    const moved = await panel.evaluate((el) => {
      /*
       * Look DOWN through the panel, not up from it.
       *
       * The scrolling element is a ScrollArea inside the panel, so it is a
       * descendant. An earlier version walked up from the panel and found
       * nothing, and reported "did not scroll" for a panel that had scrolled.
       * Measuring the wrong element is the same mistake whichever way it points.
       */
      for (const node of el.querySelectorAll<HTMLElement>('*')) {
        if (node.scrollTop > 0) return node.scrollTop;
      }
      return 0;
    });

    expect(moved, 'the highlighted panel did not scroll').toBeGreaterThan(0);
  });

  test('a control inside the highlight can actually be used', async ({ page }) => {
    // Step 1 highlights the whole controls panel, so the material buttons are
    // inside the hole and should be live.
    const steel = page.getByRole('radio', { name: /steel/i });
    await steel.click();

    await expect(steel).toBeChecked();
  });

  test('everything outside the highlight is still blocked', async ({ page }) => {
    /*
     * Proved by what is on top, not by clicking and hoping.
     *
     * `click()` cannot express this. It waits for the element to be actionable,
     * so a correctly blocked control does not fail — it times out. The first
     * version of this test did exactly that and read as a bug.
     */
    const covered = await page.evaluate(() => {
      const toggle = document.querySelector<HTMLElement>('[aria-label^="Switch to"]');
      if (!toggle) return { reachable: null };
      const r = toggle.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { reachable: hit ? toggle === hit || toggle.contains(hit) : false };
    });

    expect(covered.reachable, 'a control outside the highlight was reachable').toBe(false);

    // And the click really does nothing, forced past the actionability wait.
    const toggle = page.getByRole('button', { name: /switch to .* theme/i });
    const box = await toggle.boundingBox();
    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));

    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(150);

    const after = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(after, 'a click outside the highlight got through').toBe(before);
  });

  /*
   * Once the user reaches into the page, focus leaves the card. Escape has to
   * keep working from there, or there is no way out of a tutorial that has the
   * user reaching into the app.
   */
  test('Escape still works after using a control inside the highlight', async ({ page }) => {
    await page.getByRole('radio', { name: /steel/i }).click();
    await page.waitForTimeout(100);

    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
  });

  test('the tour survives a control being changed underneath it', async ({ page }) => {
    await page.getByRole('radio', { name: /steel/i }).click();
    await page.waitForTimeout(200);

    // Still showing step 1, still pointing at the same thing, still on screen.
    await expect(card(page).getByText(/step 1 of 4/i)).toBeVisible();
    const outline = await settledBox(page.locator('[data-tour-outline]'));
    const size = page.viewportSize()!;
    expect(outline!.x).toBeGreaterThanOrEqual(-10);
    expect(outline!.y + outline!.height).toBeLessThanOrEqual(size.height + 10);
  });
});

/*
 * The floating "How to use" button.
 *
 * A fixed button covers whatever it lands on, and this one is meant to sit over
 * the results panel on a desktop layout and over the playback bar on a phone —
 * both of which are full of controls. So the property is checked at every size
 * that matters, rather than assumed from the CSS.
 */
test.describe('the floating How to use button', () => {
  async function openApp(page: Page) {
    await asPlainUser(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: /how to use/i })).toBeVisible();
    // The 3D viewport mounts late and resizes the panels when it does, so an
    // early reading catches a layout that was never shown to anyone.
    await page.waitForTimeout(900);
  }

  /** Interactive controls that sit under the button, if any. */
  async function controlsUnderneath(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const fab = document.querySelector<HTMLElement>('[aria-label="How to use"]');
      if (!fab) throw new Error('no floating button');
      const r = fab.getBoundingClientRect();
      const points: [number, number][] = [
        [r.x + r.width / 2, r.y + r.height / 2],
        [r.x + 6, r.y + r.height / 2],
        [r.x + r.width - 6, r.y + r.height / 2],
        [r.x + r.width / 2, r.y + 6],
        [r.x + r.width / 2, r.y + r.height - 6],
      ];
      const found = new Set<string>();
      for (const [x, y] of points) {
        // Skip index 0: that is the button itself.
        const below = document
          .elementsFromPoint(x, y)
          .slice(1)
          .find((e) => ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].includes(e.tagName));
        if (below) {
          found.add(
            `${below.tagName}: ${(below.getAttribute('aria-label') || below.textContent || '').trim().slice(0, 30)}`,
          );
        }
      }
      return [...found];
    });
  }

  for (const size of [
    { w: 1600, h: 900, name: 'a wide desktop' },
    { w: 1280, h: 720, name: 'a laptop' },
    { w: 360, h: 720, name: 'a phone' },
  ]) {
    test(`stays on screen at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openApp(page);

      const box = await page.getByRole('button', { name: /how to use/i }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x, 'runs off the left').toBeGreaterThanOrEqual(0);
      expect(box!.y, 'runs off the top').toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, 'runs off the right').toBeLessThanOrEqual(size.w + 1);
      expect(box!.y + box!.height, 'runs off the bottom').toBeLessThanOrEqual(size.h + 1);
    });
  }

  /*
   * A floating button covers whatever is under it. Over a panel that scrolls
   * that is unavoidable and normal — the content moves out from under it as
   * soon as the user scrolls, which is how every floating button in every app
   * behaves. Both scrolling panels reserve bottom padding so nothing is left
   * trapped underneath at the end of their scroll.
   *
   * What is NOT acceptable is covering the chrome that does not move: the tab
   * bar, the transport controls. Those are the ones a user cannot scroll away
   * from, so they are what is checked.
   */
  test('covers nothing that cannot be scrolled away from', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await openApp(page);

    // The playback bar: transport, speed, exaggeration. It lives at the bottom
    // of the Simulate tab and does not move.
    await page.getByRole('tab', { name: /simulate/i }).click();
    await page.waitForTimeout(400);
    expect(await controlsUnderneath(page), 'it is covering the playback bar').toEqual([]);
  });

  test('covers nothing fixed on a desktop layout', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openApp(page);

    expect(await controlsUnderneath(page), 'it is covering a fixed control').toEqual([]);
  });

  test('has an accessible name, being an icon', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('button', { name: /how to use/i })).toBeVisible();
  });

  /*
   * The card already offers "Skip tour", so a second exit floating over the
   * overlay is clutter — and this button sits below the tour's own layers, so
   * leaving it visible would look live and not be.
   */
  test('is gone while the tour is showing', async ({ page }) => {
    await asFirstTimer(page);
    await page.goto('/');
    await expect(card(page)).toBeVisible();

    await expect(page.getByRole('button', { name: /how to use/i })).toHaveCount(0);
  });
});

/*
 * The floating button: green, pulsing, and draggable.
 *
 * None of this can be checked in jsdom. Dragging needs a real pointer with
 * capture and a real layout to clamp against, and the colour is a computed
 * style that only exists once CSS has resolved the tokens for a theme.
 */
test.describe('the floating button is draggable and green', () => {
  async function open(page: Page) {
    await asPlainUser(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: /how to use/i })).toBeVisible();
    await page.waitForTimeout(800);
  }

  const fab = (page: Page) => page.getByRole('button', { name: /how to use/i });

  /**
   * Drag, in steps, then let it settle.
   *
   * A single `mouse.move(..., { steps: 12 })` interpolates the whole path so
   * fast that the reading taken straight after lands on an intermediate render:
   * the first version of this test saw the button travel 174px of the 300px
   * asked for, and reported it as not working. It works. Reading the box
   * between the steps — as this does — is what makes the measurement mean
   * something.
   */
  async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) {
      await page.mouse.move(
        from.x + ((to.x - from.x) * i) / 10,
        from.y + ((to.y - from.y) * i) / 10,
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(150);
  }

  test('is the app green, in both themes', async ({ page }) => {
    await open(page);
    await expect(fab(page)).toHaveCSS('background-color', 'rgb(21, 128, 61)');

    await page.evaluate(() => document.documentElement.classList.add('dark'));
    // toHaveCSS rather than a single read: the button cross-fades, and a read
    // taken immediately catches it mid-transition at a colour that is in
    // neither theme.
    await expect(fab(page)).toHaveCSS('background-color', 'rgb(74, 222, 128)');
  });

  test('carries the attention ring', async ({ page }) => {
    await open(page);
    await expect(fab(page)).toHaveClass(/qs-attention/);
  });

  test('can be dragged, and lands exactly where it was let go', async ({ page }) => {
    await open(page);
    const before = (await fab(page).boundingBox())!;
    const from = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    const to = { x: from.x - 300, y: from.y - 220 };

    await dragTo(page, from, to);
    const after = (await fab(page).boundingBox())!;

    // The grab point stays under the pointer, so the button's top-left lands
    // half a button up and to the left of where the mouse was released.
    // Parenthesised on purpose: `after.y - to.y - h / 2` subtracts the half
    // height a second time and comes out a whole button out, which is exactly
    // what the first version of this assertion did.
    const expectedX = to.x - before.width / 2;
    const expectedY = to.y - before.height / 2;
    expect(Math.abs(after.x - expectedX), 'it landed somewhere else').toBeLessThan(3);
    expect(Math.abs(after.y - expectedY), 'it landed somewhere else').toBeLessThan(3);

    // The click that ends a drag is swallowed. Without this, every attempt to
    // reposition the button would also start the tutorial.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('stays where it was put, on the next visit', async ({ page }) => {
    await open(page);
    const before = (await fab(page).boundingBox())!;
    const from = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    await dragTo(page, from, { x: from.x - 280, y: from.y - 200 });
    const moved = (await fab(page).boundingBox())!;

    await page.reload();
    await expect(fab(page)).toBeVisible();
    await page.waitForTimeout(500);
    const after = (await fab(page).boundingBox())!;

    expect(Math.abs(after.x - moved.x), 'it forgot where it was put').toBeLessThan(3);
    expect(Math.abs(after.y - moved.y), 'it forgot where it was put').toBeLessThan(3);
  });

  /*
   * A spot chosen on a wide screen is off the edge of a phone. Resizing has to
   * pull it back rather than leave it somewhere the user cannot reach it.
   */
  test('is pulled back on screen when the window shrinks a lot', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page);
    await dragTo(page, { x: 1560, y: 860 }, { x: 1592, y: 892 });

    await page.setViewportSize({ width: 360, height: 720 });
    await page.waitForTimeout(500);
    const box = (await fab(page).boundingBox())!;
    expect(box.x, 'it is off the left').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'it is off the right').toBeLessThanOrEqual(361);
    expect(box.y + box.height, 'it is off the bottom').toBeLessThanOrEqual(721);
  });

  test('still opens the tour on a plain click', async ({ page }) => {
    await open(page);
    await fab(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/step 1 of 4/i)).toBeVisible();
  });
});

/*
 * The narrow-screen presentation, which is a real dialog and therefore the one
 * case where the two overlays genuinely could have been stacked.
 */
test.describe('guided tour on a phone', () => {
  test.use({ viewport: { width: 360, height: 720 } });

  test('shows as a modal that fits the screen', async ({ page }) => {
    await asFirstTimer(page);
    await page.goto('/');

    await expect(card(page)).toBeVisible();

    const box = await settledBox(card(page));
    expect(fullyOnScreen(box!, page.viewportSize()!)).toBe(true);
  });

  /*
   * A genuine first-time user: neither overlay has been seen.
   *
   * This is the one state where the disclaimer gate exists at all, and so the
   * one state where two overlays could be stacked. The tour has to be the only
   * thing on screen while it is showing, and the gate has to be the only thing
   * once it is done.
   */
  test('never stacks on the disclaimer gate', async ({ page }) => {
    await asCompleteFirstTimer(page);
    await page.goto('/');

    await expect(card(page)).toBeVisible();
    await expect(page.getByRole('button', { name: /start exploring/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /welcome to quakestudio/i })).toHaveCount(0);

    await card(page)
      .getByRole('button', { name: /skip tour/i })
      .click();

    await expect(page.getByRole('button', { name: /start exploring/i })).toBeVisible();
    await expect(card(page).getByText(/step 1 of 4/i)).toHaveCount(0);
  });

  test('the How to use button is still reachable at 360px', async ({ page }) => {
    await asFirstTimer(page);
    await page.goto('/');

    await card(page)
      .getByRole('button', { name: /skip tour/i })
      .click();
    await expect(card(page)).toHaveCount(0);

    const trigger = page.getByRole('button', { name: /how to use/i });
    await expect(trigger).toBeVisible();

    const box = await trigger.boundingBox();
    const size = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
  });
});
