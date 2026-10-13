import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/* ==========================================================================
   Bundle budget.

   Lazy-loading is easy to undo by accident: one eager import of a chart or a
   viewport and Three.js is back on the critical path, with nothing failing
   and no visible sign in the app. This turns that into a test failure.

   The numbers below were measured on the current dependency set. They are
   deliberately set ABOVE today's actual size, so ordinary work does not trip
   them — they exist to catch a structural regression, not to police kilobytes.

   Re-measure with `npm run build` and update the table in
   docs/performance.md whenever these change.
   ========================================================================== */

const DIST = join(process.cwd(), 'apps/web/dist/assets');

/** Gzipped size in bytes. Real users download compressed, not raw. */
function gzipSize(file: string): number {
  return gzipSync(readFileSync(file), { level: 9 }).length;
}

function assets(): string[] {
  if (!existsSync(DIST)) {
    throw new Error('No build found. Run `npm run build` before the bundle test.');
  }
  return readdirSync(DIST).filter((name) => /\.(js|css)$/.test(name) && !name.endsWith('.map'));
}

/**
 * The entry chunk — the one named after `index`, which is what index.html
 * loads with `<script>` and `<link>`. Deferred chunks are separate files.
 */
function entryChunk(): string {
  const index = assets().find((name) => /^index-.*\.js$/.test(name));
  if (!index) throw new Error('Entry chunk not found in dist/assets');
  return index;
}

/** Everything else: lazy chunks and the simulation worker. */
function deferredChunks(): string[] {
  return assets().filter(
    (name) => /^index-.*\.js$/.test(name) === false && /\.(js|css)$/.test(name),
  );
}

const DOCS = join(process.cwd(), 'docs/performance.md');

describe('bundle budget', () => {
  it('keeps the entry chunk small enough to parse quickly', () => {
    const size = gzipSize(join(DIST, entryChunk()));
    const budgetKb = 220;

    expect(
      Math.round(size / 1024),
      `entry chunk is ${Math.round(size / 1024)} KB gzipped, over the ${budgetKb} KB budget`,
    ).toBeLessThanOrEqual(budgetKb);
  });

  it('keeps total JavaScript under a ceiling', () => {
    const js = assets().filter((name) => name.endsWith('.js'));
    const total = js.reduce((sum, name) => sum + gzipSize(join(DIST, name)), 0);
    const budgetKb = 620;

    expect(
      Math.round(total / 1024),
      `total JavaScript is ${Math.round(total / 1024)} KB gzipped, over the ${budgetKb} KB budget`,
    ).toBeLessThanOrEqual(budgetKb);
  });

  it('still splits the two heavy libraries out of the entry chunk', () => {
    /*
     * The point of the split. If someone imports the viewport or a chart
     * eagerly, Vite folds it back into the entry chunk and these two files
     * stop existing — at which point the budget test above may still pass,
     * because the total did not change. Only this check notices.
     */
    const deferred = deferredChunks().map((name) => name);

    expect(deferred.some((name) => name.startsWith('Viewport3D-'))).toBe(true);
    expect(deferred.some((name) => name.startsWith('Charts-'))).toBe(true);
  });

  it('emits the simulation worker as its own small chunk', () => {
    // The engine runs off the main thread; if it were inlined it would block
    // the UI, which is the whole reason it is a worker.
    const worker = assets().find((name) => name.startsWith('worker-'));

    expect(worker).toBeDefined();
    expect(gzipSize(join(DIST, worker!))).toBeLessThan(30 * 1024);
  });
});

describe('build output', () => {
  it('reports the same figures the documentation claims', () => {
    // Guards against docs/performance.md quietly going stale, which is the
    // failure mode of every "measured numbers" document ever written.
    //
    // The regex is anchored to the Result table's row specifically. A looser
    // pattern matched the number in the BUDGETS table instead — so the test
    // passed for the wrong reason until the two tables disagreed.
    const docs = readFileSync(DOCS, 'utf8');
    const entryKb = Math.round(gzipSize(join(DIST, entryChunk())) / 1024);

    const row = /\*\*Entry \(`index-\*\.js`\)\*\*[^|]*\|[^|]*\|\s*\*\*(\d+)\s*KB\*\*/.exec(docs);
    expect(row, 'docs/performance.md has no "Entry" row with a bolded gzip figure').not.toBeNull();

    const claimed = Number(row![1]);
    expect(
      Math.abs(claimed - entryKb),
      `docs/performance.md says ${claimed} KB, build produces ${entryKb} KB`,
    ).toBeLessThanOrEqual(15);
  });

  it('does not ship source maps', () => {
    /*
     * Nine times the size of the app, served to anyone who guesses the URL.
     * They are opt-in via VITE_SOURCEMAP for debugging a built bundle; see
     * vite.config.ts.
     */
    const maps = readdirSync(DIST).filter((name) => name.endsWith('.map'));

    expect(maps, `source maps in dist: ${maps.join(', ')}. Build without VITE_SOURCEMAP.`).toEqual(
      [],
    );
  });
});

describe('bundle report', () => {
  it('prints the current breakdown', () => {
    // Not an assertion — a print. Running `npm test` gives the real numbers,
    // which is more useful than a table that goes stale in a commit.
    const rows = assets().map((name) => ({
      name,
      rawKb: Math.round(statSync(join(DIST, name)).size / 1024),
      gzipKb: Math.round(gzipSize(join(DIST, name)) / 1024),
    }));

    const js = rows.filter((row) => row.name.endsWith('.js'));
    const totalGzip = js.reduce((sum, row) => sum + row.gzipKb, 0);

    console.log('\n  Bundle breakdown (KB)');
    console.log('  ' + '-'.repeat(52));
    for (const row of rows) {
      const tag =
        row.name.startsWith('index-') && row.name.endsWith('.js')
          ? ' <- entry'
          : row.name.startsWith('Viewport3D') || row.name.startsWith('Charts')
            ? ' <- deferred'
            : '';
      console.log(
        `  ${row.name.padEnd(38)} ${String(row.rawKb).padStart(6)} ${String(row.gzipKb).padStart(6)}${tag}`,
      );
    }
    console.log(
      `  ${'TOTAL JavaScript (gzip)'.padEnd(38)} ${' '.repeat(6)} ${String(totalGzip).padStart(6)}`,
    );
    console.log('  ' + '-'.repeat(52));

    expect(totalGzip).toBeGreaterThan(0);
  });
});
