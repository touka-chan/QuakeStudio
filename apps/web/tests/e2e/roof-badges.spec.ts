import { expect, test, type Page } from '@playwright/test';

/* ==========================================================================
   Roof badges — can you still tell the buildings apart?

   --------------------------------------------------------------------------
   Each building carries a badge over its roof saying which of A, B, C or D it
   is, positioned by projecting the roof through the camera every frame.

   This file checks the three ways that can go wrong, at every width that
   matters and in BOTH views:

     1. BADGES COLLIDING. The buildings are laid out in metres and never
        interpenetrate — there is a unit test for that. What can go wrong is
        that two roofs land on the same PIXEL, which is a different question
        needing a different answer. When that happens a reader cannot tell which
        building is which, which defeats the badge entirely.

     2. A BADGE ESCAPING THE FRAME. A world-space offset for the ghost stack
        did exactly that: the camera frames the tallest roof and nothing above
        it, so the stack climbed straight off the top and all that survived was
        a sliver of one badge. The stack is in screen space now; this is what
        stops that coming back.

     3. A BADGE UNDER THE VIEW SWITCH. In ghost overlay the tallest roof
        projects near the top of the frame, so the stacked badge landed
        squarely on the Side by side / Ghost overlay switch.

   Asserted rather than photographed on purpose. A screenshot shows one moment
   at one size and cannot fail the build. This can.
   ========================================================================== */

const WIDTHS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'narrow', width: 1024, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

async function skipFirstRun(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('quakestudio.disclaimerSuppressed', 'true');
      localStorage.setItem('quakestudio.tourSuppressed', 'true');
    } catch {
      /* storage unavailable — the dialog will show and block these tests */
    }
  });
}

/**
 * Pick a tab, if this layout has tabs at all.
 *
 * A phone shows one panel at a time behind Build / Simulate / Results; a
 * desktop shows all three at once and has no tab strip. The first version of
 * this helper assumed the desktop, and every phone test failed on a button that
 * genuinely was not on screen — the compare control lives in the Results panel,
 * so on a phone you have to go and find it first.
 */
async function goToTab(page: Page, name: RegExp) {
  const tab = page.getByRole('tab', { name });
  if ((await tab.count()) > 0) await tab.first().click();
}

/** Get to a four-building comparison and wait for the scene to settle. */
async function fourBuildings(page: Page) {
  await page.goto('/');

  // The compare control is in the results panel.
  await goToTab(page, /results/i);
  await page.getByRole('button', { name: /compare with another building/i }).click();

  /*
   * Wait on the button turning into "Stop comparing", not on the view toggle.
   * The toggle lives in the 3D viewport, which on a phone is two tabs away and
   * genuinely not on screen here — asserting on it at this point fails on a
   * layout that is working perfectly.
   */
  await expect(page.getByRole('button', { name: /stop comparing/i })).toBeVisible();

  // "Add a building" is in the controls panel.
  for (let i = 0; i < 2; i += 1) {
    await goToTab(page, /^build$/i);
    const add = page.getByRole('button', { name: /add a building/i });
    await add.first().scrollIntoViewIfNeeded();
    await add.first().click();
  }

  // The 3D viewport is in the simulate panel, where there is a tab strip.
  await goToTab(page, /simulate/i);

  // Four badges, then let the frame loop position them.
  await expect(page.locator('[data-roof-badge]')).toHaveCount(4);
  await page.waitForTimeout(600);
}

type Box = { x: number; y: number; width: number; height: number };

/** Every badge's box, keyed by the side it names. */
async function badgeBoxes(page: Page): Promise<Record<string, Box>> {
  return page.evaluate(() => {
    const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const el of document.querySelectorAll<HTMLElement>('[data-roof-badge]')) {
      const side = el.dataset.roofBadge!;
      const r = el.getBoundingClientRect();
      out[side] = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return out;
  });
}

/** True when two boxes share any area at all. */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Every badge is on screen, clear of the others, and clear of the view switch.
 *
 * Run against BOTH views, which is not a detail. The first version of this file
 * checked the switch only in Side by side, and a mutation that moved the switch
 * back to the top of the viewport passed — because the collision happens in
 * Ghost overlay, where every building stands in the same place and the badges
 * stack at the top of the frame. Side by side never collided with it.
 *
 * A check that only runs in the configuration where nothing goes wrong is a
 * check that cannot fail.
 */
async function expectBadgesAreReadable(page: Page, label: string) {
  const canvas = (await page.locator('canvas').boundingBox())!;
  const boxes = await badgeBoxes(page);
  const sides = Object.keys(boxes).sort();
  expect(sides, `${label}: expected a badge for every building`).toEqual(['A', 'B', 'C', 'D']);

  // On screen, at this width.
  for (const [side, box] of Object.entries(boxes)) {
    expect(box.x, `${label}: badge ${side} is off the left`).toBeGreaterThanOrEqual(canvas.x - 1);
    expect(box.y, `${label}: badge ${side} is off the top`).toBeGreaterThanOrEqual(canvas.y - 1);
    expect(box.x + box.width, `${label}: badge ${side} is off the right`).toBeLessThanOrEqual(
      canvas.x + canvas.width + 1,
    );
    expect(box.y + box.height, `${label}: badge ${side} is off the bottom`).toBeLessThanOrEqual(
      canvas.y + canvas.height + 1,
    );
  }

  // Not on top of each other. In ghost they are deliberately stacked; this is
  // what says the stack worked rather than all four landing on one pixel.
  for (let i = 0; i < sides.length; i += 1) {
    for (let j = i + 1; j < sides.length; j += 1) {
      const a = sides[i]!;
      const b = sides[j]!;
      expect(
        overlaps(boxes[a]!, boxes[b]!),
        `${label}: badge ${a} overlaps badge ${b} — ${JSON.stringify(boxes[a])} vs ${JSON.stringify(
          boxes[b],
        )}`,
      ).toBe(false);
    }
  }

  /*
   * And clear of the Side by side / Ghost overlay switch.
   *
   * Caught because it happened: in ghost overlay the tallest roof projects near
   * the top of the frame, so the stacked badge landed squarely on the switch. A
   * control under a label is neither readable, and the switch was moved to the
   * bottom of the viewport rather than the badges being pushed away from where
   * they belong.
   */
  const toggle = (await page.getByRole('radiogroup', { name: /comparison view/i }).boundingBox())!;
  for (const [side, box] of Object.entries(boxes)) {
    expect(overlaps(box, toggle), `${label}: badge ${side} is under the view switch`).toBe(false);
  }
}

for (const size of WIDTHS) {
  test.describe(`${size.name} (${size.width}px)`, () => {
    test.beforeEach(async ({ page }) => {
      await skipFirstRun(page);
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    test('badges are readable, side by side', async ({ page }) => {
      await fourBuildings(page);
      await expectBadgesAreReadable(page, 'side by side');
    });

    test('badges are readable, ghost overlay', async ({ page }) => {
      await fourBuildings(page);
      await page.getByRole('radio', { name: /ghost overlay/i }).click();
      await page.waitForTimeout(600);
      await expectBadgesAreReadable(page, 'ghost overlay');
    });

    test('hovering a floor reads back that floor of that building', async ({ page }) => {
      await fourBuildings(page);

      const callout = page.locator('[data-floor-callout]');

      /*
       * Sweep for a point that is actually over a floor. Hard-coding a
       * coordinate is a test that passes at one width and misses the building
       * at every other, and "no callout" then looks identical to "the hover is
       * broken" — which is exactly how a real bug in here nearly went unnoticed.
       */
      const canvas = (await page.locator('canvas').boundingBox())!;
      let hovered = false;
      for (const fy of [0.5, 0.45, 0.55, 0.4, 0.6]) {
        for (const fx of [0.55, 0.6, 0.5, 0.45, 0.65]) {
          const y = canvas.y + canvas.height * fy;
          await page.mouse.move(canvas.x + 4, y);
          await page.mouse.move(canvas.x + canvas.width * fx, y, { steps: 8 });
          await page.waitForTimeout(250);
          if (await callout.evaluate((el) => getComputedStyle(el).opacity === '1')) {
            hovered = true;
            break;
          }
        }
        if (hovered) break;
      }

      expect(hovered, `no point over the canvas produced a callout at ${size.width}px`).toBe(true);

      /*
       * The callout must NAME the building. Four buildings in one line, and
       * "Floor 5" on its own is a number attached to nothing.
       */
      const text = (await callout.textContent())!.replace(/\s+/g, ' ').trim();
      expect(text).toMatch(/^[ABCD] · Floor \d+/);
      expect(text).toMatch(/Peak [\d.]+ mm/);
      expect(text).toMatch(/Story drift [\d.]+ %/);

      // And it goes away again on leaving, which the frame loop does without
      // waiting for a render.
      await page.mouse.move(canvas.x + 4, canvas.y + canvas.height * 0.95);
      await page.waitForTimeout(400);
      expect(await callout.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    });

    test('a badge rides the building while it shakes', async ({ page }) => {
      await fourBuildings(page);

      const before = await badgeBoxes(page);

      /*
       * The anchor used to be the building's STATIC x. The building sways — every
       * floor is moved by its own sampled displacement — so during playback the
       * whole thing leaned over and the badge stood where the roof used to be.
       * Found by the client, and invisible until the shake starts.
       *
       * Press play and watch. With the camera still, a static anchor cannot move
       * at all, so this is a direct check rather than an inference.
       */
      const play = page.getByRole('button', { name: /^play$/i });
      if ((await play.count()) > 0) await play.first().click();

      let movedMost = 0;
      for (let i = 0; i < 8; i += 1) {
        await page.waitForTimeout(350);
        const now = await badgeBoxes(page);
        for (const side of ['A', 'B', 'C', 'D']) {
          movedMost = Math.max(
            movedMost,
            Math.abs(now[side]!.x - before[side]!.x) + Math.abs(now[side]!.y - before[side]!.y),
          );
        }
      }

      expect(
        movedMost,
        `no badge moved while the buildings shook (max ${movedMost}px)`,
      ).toBeGreaterThan(4);
    });

    test('a badge follows the building when the camera is orbited', async ({ page }) => {
      await fourBuildings(page);

      const before = await badgeBoxes(page);
      const canvas = (await page.locator('canvas').boundingBox())!;

      // Drag across the middle of the viewport. A static overlay — the thing
      // this replaced — would not move at all.
      await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.mouse.down();
      await page.mouse.move(canvas.x + canvas.width / 2 + 120, canvas.y + canvas.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
      await page.waitForTimeout(600);

      const after = await badgeBoxes(page);
      for (const side of ['A', 'B', 'C', 'D']) {
        const moved =
          Math.abs(after[side]!.x - before[side]!.x) + Math.abs(after[side]!.y - before[side]!.y);
        expect(moved, `badge ${side} did not follow the camera`).toBeGreaterThan(4);
      }
    });
  });
}
