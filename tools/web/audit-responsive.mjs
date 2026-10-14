/**
 * Audit the web build at every viewport a real browser is likely to be.
 * =========================================================================
 * WHY THIS EXISTS
 *
 * A layout bug found on a phone - "PEAK DISPLACEMEN" with the T clipped off -
 * is not a phone bug. It reproduces in desktop Chromium at 360px. The phone
 * only told us where to look.
 *
 * So this sweeps the same class of defect across the whole width range,
 * against the production build, without needing a device at all. Anything it
 * reports is reproducible by anyone with a browser.
 *
 * WHAT IT CHECKS, and why each one earns its place
 * -------------------------------------------------------------------------
 * 1. Page-level horizontal overflow. The obvious one, and the weakest: a
 *    page that scrolls sideways is loud, so it tends to get fixed.
 *
 * 2. Element-level clipping. The one that hides. An element wider than its
 *    own content is clipped at a rounded border and nothing else moves - the
 *    document does not grow, so check 1 still passes. A character disappears
 *    and no test notices.
 *
 * 3. Silently truncated text. Any element using text-overflow: ellipsis whose
 *    content overflows it. Deliberate truncation is a design decision; this
 *    flags the ones nobody decided on, usually a value that outgrew a box.
 *
 * 4. Tap targets under 40px, on widths where the primary input is a finger.
 *    Pointer Events are one API for mouse and touch, so this compiles to
 *    nothing - the only thing that catches it is measuring the box.
 *
 * 5. Console and page errors, at every width. Cheap, and has caught silent
 *    failures that no assertion would.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   It does not check the engineering numbers. That is `npm run validate`,
 *   against the independent Python reference. Layout correctness and
 *   numerical correctness are different claims and this makes only the first.
 *
 * Usage
 * -----
 *     npm run build && node tools/web/audit-responsive.mjs
 *     npm run web:audit
 *
 * Requires a production build in apps/web/dist. The dev server is not used:
 * its unminified CSS and injected stylesheet behave differently enough from
 * what ships that a clean report here would not be evidence about production.
 * =========================================================================
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { chromium } from 'playwright';

/* ---- configuration ----------------------------------------------------- */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'apps', 'web', 'dist');
const SHOTS = join(ROOT, 'apps', 'web', 'responsive-audit');
const PORT = 4178;
const BASE = `http://localhost:${PORT}`;

/** Smallest phone still in real use, through to a large desktop. */
const WIDTHS = [
  { width: 320, height: 720, touch: true, name: 'small phone' },
  { width: 360, height: 800, touch: true, name: 'common Android' },
  { width: 390, height: 844, touch: true, name: 'modern phone' },
  { width: 768, height: 1024, touch: true, name: 'tablet' },
  { width: 1024, height: 768, touch: false, name: 'small laptop' },
  { width: 1440, height: 900, touch: false, name: 'desktop' },
];

/** Minimum comfortable target. 44 is Apple's guidance; 40 is the floor used here. */
const MIN_TAP = 40;

/**
 * The views worth sweeping. The Results panel holds the densest content, so
 * it is where clipping shows up first, but the other tabs and one dialog are
 * included because each has its own fixed-width furniture.
 *
 * `tab` rather than `open` for the tab views, because the tab strip only
 * exists in the mobile layout. On a wide desktop every panel is shown at once,
 * so there is nothing to click, and requiring one would fail the audit for a
 * reason that has nothing to do with layout.
 */
const VIEWS = [
  { name: 'build' },
  { name: 'simulate', tab: /simulate/i },
  { name: 'results', tab: /results/i },
  {
    name: 'about dialog',
    open: async (page) => {
      await page
        .getByRole('button', { name: /about|assumptions/i })
        .first()
        .click();
      await page.getByRole('dialog').waitFor({ state: 'visible' });
    },
  },
];

/* ---- helpers ----------------------------------------------------------- */

/**
 * Switch to a tab if this layout has one.
 *
 * Returns whether it did, so the caller can say so rather than quietly
 * auditing the default view and reporting it under another view's name.
 */
async function selectTab(page, pattern) {
  const tab = page.getByRole('tab', { name: pattern });

  if ((await tab.count()) === 0) return false;

  await tab.first().click();
  return true;
}

/*
 * Vite is invoked as `node <vite's own bin>` rather than through `npx`.
 *
 * Going via npx means a shell, because Windows refuses to spawn a `.cmd`
 * without one — which is where the deprecation warning came from. Running the
 * binary directly avoids the shell entirely and, usefully, pins the audit to
 * the vite this project depends on instead of whatever npx happens to resolve.
 */
async function startPreview() {
  /*
   * Resolved through `vite/package.json` rather than `vite/bin/vite.js`:
   * vite's exports map does not publish the bin, so the only supported way in
   * is to find the package root and walk to it from there.
   */
  const require = createRequire(import.meta.url);
  const webDir = join(ROOT, 'apps', 'web');
  const viteBin = join(
    dirname(require.resolve('vite/package.json', { paths: [webDir] })),
    'bin',
    'vite.js',
  );

  if (!existsSync(viteBin)) {
    throw new Error(`could not find vite's binary at ${viteBin} — is vite installed?`);
  }

  const child = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(PORT), '--strictPort'],
    {
      cwd: webDir,
      stdio: 'ignore',
    },
  );

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return child;
    } catch {
      // Not up yet.
    }
    await sleep(500);
  }

  child.kill();
  throw new Error(`preview server never came up on ${BASE}`);
}

/* ---- the checks, evaluated inside the page ------------------------------ */

/**
 * Runs in the browser. Returns every problem found, so one pass reports all of
 * them rather than making the caller re-navigate per check.
 *
 * Everything it needs is declared inside it: this function is serialised and
 * evaluated in the page, so it cannot close over anything from this module.
 */
function inspectPage({ minTap, touch }) {
  const problems = [];

  /** A short, recognisable description of an element, for the report. */
  const label = (element) => {
    const id = element.getAttribute('data-testid');
    if (id) return `[${id}]`;

    const text = (element.getAttribute('aria-label') ?? element.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();

    const classes = (element.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('['))
      .slice(0, 3)
      .join('.');

    const short = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}${short ? ` "${short}"` : ''}`;
  };

  /**
   * How much of this element's content a user genuinely cannot see.
   *
   * Two cases only, because everything else produced confident nonsense:
   *
   *   - The element clips itself (`overflow: hidden`/`clip`). Then
   *     `scrollWidth` really does mean content is lost.
   *   - The element itself sits off the edge of the viewport. Then it is
   *     gone regardless of its own overflow.
   *
   * What was dropped, and why: treating `scrollWidth > clientWidth` on a
   * `overflow: visible` element as a defect. It reported the top bar as 41px
   * "hidden" at every phone width, and screenshots showed it intact with all
   * four buttons and the whole disclaimer visible. Text that paints outside
   * its own box without being cut off is not a bug — and at 1024 it fired on
   * three metric cards that were demonstrably fine.
   */
  const hiddenBy = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    if (['hidden', 'clip'].includes(style.overflowX)) {
      return Math.max(0, el.scrollWidth - el.clientWidth);
    }

    // Nothing clips it, so the only way to lose it is to be off-screen.
    return Math.max(0, rect.right - innerWidth, -rect.left);
  };

  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number(style.opacity) === 0) return false;
    return el.getClientRects().length > 0;
  };

  /*
   * Screen-reader-only text is clipped on purpose.
   *
   * Tailwind's `sr-only` is a 1px box with `overflow: hidden` holding text no
   * sighted user should ever see, so it is *always* "wider than itself".
   * Without this every dialog reports a false "clips its content".
   */
  const srOnly = (el) => el.classList.contains('sr-only');

  /**
   * A selector that finds this element again from Node.
   *
   * `page.evaluate` can only return JSON, so handing back the element itself
   * silently yields nothing — which is why the first version of this audit
   * reported 413 problems and produced no screenshots. Returning a path, and
   * re-finding the element with a locator, is what actually works.
   */
  const path = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.dataset.testid) return `[data-testid="${el.dataset.testid}"]`;

    const parts = [];
    let node = el;

    while (node && node !== document.body && parts.length < 6) {
      const parent = node.parentElement;
      if (!parent) break;

      const tag = node.tagName.toLowerCase();
      const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
      const nth = sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(node) + 1})` : '';
      const cls = node.classList.length ? `.${CSS.escape(node.classList[0])}` : '';

      parts.unshift(`${tag}${cls}${nth}`);
      node = parent;
    }

    return parts.join(' > ');
  };

  // 1. Page-level horizontal overflow.
  const pageOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (pageOverflow > 1) {
    problems.push({
      kind: 'page scrolls sideways',
      detail: `${pageOverflow}px too wide`,
      severity: 'fail',
    });
  }

  const all = [...document.querySelectorAll('body *')];

  // 2. Content genuinely cut off.
  for (const el of all) {
    if (!visible(el) || srOnly(el)) continue;
    if (el.clientWidth === 0) continue;

    /*
     * SVG is excluded wholesale, and that is a known blind spot rather than a
     * claim of coverage.
     *
     * Charts draw axes and labels as SVG `<text>`, and `scrollWidth` means
     * nothing there — the audit cheerfully reported an axis tick as "686px
     * hidden past the edge". Chart labels are worth checking properly, but
     * that needs the SVG geometry worked out rather than guessed at, so it is
     * called out here instead of producing invented numbers.
     */
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') continue;

    const hidden = hiddenBy(el);
    if (hidden > 1) {
      problems.push({
        kind: 'content cut off',
        detail: `${label(el)} — ${Math.round(hidden)}px hidden past the edge`,
        selector: path(el),
        severity: 'fail',
      });
    }
  }

  // 3. Text truncated with an ellipsis, i.e. silently losing content.
  for (const el of all) {
    if (!visible(el) || srOnly(el)) continue;
    const style = getComputedStyle(el);
    if (style.textOverflow !== 'ellipsis') continue;
    if (style.overflow === 'visible') continue;
    if (el.scrollWidth - el.clientWidth > 1) {
      problems.push({
        kind: 'text truncated',
        detail: `${label(el)} — ${el.scrollWidth - el.clientWidth}px replaced by an ellipsis`,
        selector: path(el),
        severity: 'fail',
      });
    }
  }

  // 4. Targets too small for a finger.
  if (touch) {
    const interactive = [
      ...document.querySelectorAll(
        'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="slider"], [role="switch"], [role="checkbox"], [role="radio"]',
      ),
    ];

    for (const el of interactive) {
      if (!visible(el)) continue;
      // A hidden input is driven by a visible label, which is measured instead.
      if (el instanceof HTMLInputElement && el.type === 'hidden') continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const tooSmall = rect.height < minTap || rect.width < minTap;
      if (tooSmall) {
        problems.push({
          kind: 'tap target too small',
          detail: `${label(el)} — ${Math.round(rect.width)}×${Math.round(rect.height)}, want ${minTap}×${minTap}`,
          selector: path(el),
          /*
           * A warning, not a failure.
           *
           * Pointer Events give mouse and touch one API, so nothing enforces a
           * minimum size at runtime — measuring the box is the only way to see
           * it. But a short control in a dense toolbar is a judgement call
           * rather than something cut off or lost, so it is reported and does
           * not fail the run.
           */
          severity: 'warn',
        });
      }
    }
  }

  return problems;
}

/* ---- the sweep --------------------------------------------------------- */

async function auditView(page, viewport, view) {
  const found = [];
  const errors = [];

  const onConsole = (message) => {
    if (message.type() === 'error') errors.push(message.text());
  };
  const onPageError = (error) => errors.push(`uncaught: ${error.message}`);

  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    // The first-run dialog is a modal; acknowledging it is what a returning
    // user has in localStorage, and it is what lets the workspace be reached.
    await page.evaluate(() => {
      localStorage.setItem('quakestudio.firstRunAcknowledged', 'true');
    });
    await page.reload({ waitUntil: 'networkidle' });

    if (view.tab) {
      const switched = await selectTab(page, view.tab);
      if (!switched) {
        // Not a failure. A wide desktop shows all panels at once, so the view
        // requested and the view shown are the same thing.
        found.push({
          kind: 'view skipped',
          severity: 'info',
          detail: 'no tab strip at this width; every panel is shown at once',
        });
      }
    }

    if (view.open) await view.open(page);
    // Charts and the 3D viewport lay out asynchronously.
    await page.waitForTimeout(600);

    const problems = await page.evaluate(inspectPage, {
      minTap: MIN_TAP,
      touch: viewport.touch,
    });

    for (const problem of problems) {
      found.push({ view: view.name, ...problem });

      if (!problem.selector) continue;

      try {
        const target = page.locator(problem.selector).first();
        if ((await target.count()) === 0) continue;

        await target.screenshot({
          path: join(
            SHOTS,
            // Kinds contain spaces; keep the filenames usable.
            `${viewport.width}-${problem.kind.replace(/\s+/g, '-')}-${found.length}.png`,
          ),
        });
      } catch {
        // An element can vanish between finding it and photographing it, and
        // an SVG text node can refuse a screenshot outright. Neither is the
        // bug being hunted, so neither fails the audit.
      }
    }

    for (const error of errors) {
      found.push({ view: view.name, kind: 'console error', detail: error, severity: 'fail' });
    }
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }

  return found;
}

/* ---- report ------------------------------------------------------------ */

function printReport(results) {
  // Column width follows the longest *label*, not the longest detail, so the
  // table stays readable instead of being padded to the width of a sentence.
  const kindWidth = Math.max(
    7,
    ...results.flatMap((r) =>
      r.problem.map((p) => `${p.severity === 'warn' ? '~ ' : ''}${p.kind}`),
    ),
  );

  console.log(
    `\n  ${'width'.padEnd(7)}${'view'.padEnd(15)}${'problem'.padEnd(kindWidth + 2)}detail`,
  );
  console.log(`  ${'-'.repeat(7 + 15 + kindWidth + 12)}`);

  for (const result of results) {
    const worthShowing = result.problem.filter((p) => p.severity !== 'info');

    if (worthShowing.length === 0) {
      const note = result.problem.find((p) => p.severity === 'info');
      console.log(
        `  ${String(result.width).padEnd(7)}${result.view.padEnd(15)}${'—'.padEnd(kindWidth + 2)}${note ? note.detail : 'nothing found'}`,
      );
      continue;
    }

    // Group so one badly broken view is reported once, not once per element.
    const grouped = new Map();
    for (const item of worthShowing) {
      const key = `${item.severity === 'warn' ? '~ ' : ''}${item.kind}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item.detail]);
    }

    let first = true;
    for (const [kind, details] of grouped) {
      const shown = details.slice(0, 3).join('\n' + ' '.repeat(25));
      const more = details.length > 3 ? ` (+${details.length - 3} more)` : '';
      console.log(
        `  ${(first ? String(result.width) : '').padEnd(7)}${result.view.padEnd(15)}${kind.padEnd(kindWidth + 2)}${shown}${more}`,
      );
      first = false;
    }
  }
}

/* ---- main -------------------------------------------------------------- */

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error(`\n  No production build at ${DIST}.\n  Run:  npm run build\n`);
    process.exitCode = 1;
    return;
  }

  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });

  console.log(
    `\n  Auditing the production build at ${WIDTHS.length} widths × ${VIEWS.length} views`,
  );
  console.log(`  Screenshots of anything wrong: apps/web/responsive-audit/\n`);

  const server = await startPreview();
  const browser = await chromium.launch();
  const results = [];

  try {
    for (const viewport of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.touch,
        isMobile: viewport.touch,
        deviceScaleFactor: viewport.touch ? 2 : 1,
      });

      for (const view of VIEWS) {
        const page = await context.newPage();
        /*
         * One view failing must not abort the sweep. A crash in the last
         * combination would otherwise report a clean run for the twenty-three
         * before it — the failure mode where a check looks like it passed.
         */
        let problem;
        try {
          problem = await auditView(page, viewport, view);
        } catch (error) {
          problem = [
            {
              kind: 'AUDIT CRASHED',
              severity: 'fail',
              detail: error instanceof Error ? error.message.split('\n')[0] : String(error),
            },
          ];
        }
        results.push({ width: viewport.width, view: view.name, problem });
        const fails = problem.filter((p) => p.severity === 'fail').length;
        const warns = problem.filter((p) => p.severity === 'warn').length;
        process.stdout.write(
          `  ${String(viewport.width).padStart(5)} ${view.name.padEnd(15)} ${
            fails || warns ? `${fails} fail, ${warns} warn` : 'ok'
          }\n`,
        );
        await page.close();
      }

      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }

  printReport(results);

  const all = results.flatMap((r) => r.problem);
  const fails = all.filter((p) => p.severity === 'fail');
  const warns = all.filter((p) => p.severity === 'warn');

  console.log(
    fails.length === 0
      ? `\n  PASS — nothing cut off, truncated or throwing at any of the ${WIDTHS.length} widths.`
      : `\n  ${fails.length} failure(s), ${warns.length} warning(s).\n`,
  );

  /*
   * Only failures set the exit code. Warnings are judgement calls about
   * density, and a run that fails on them trains people to ignore the output
   * entirely — which is how the real failures get missed too.
   */
  if (fails.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
