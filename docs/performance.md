# Performance

**Measured:** 13 October 2026, on the Phase 5 build. Numbers are gzipped, which
is what a browser actually downloads.

Reproduce with:

```bash
npm run build
npm test -- bundle          # prints the table below and checks the budgets
```

`tests/unit/bundle.test.ts` asserts every figure in this document, so the two
cannot drift apart silently.

## Result

| Chunk | Raw | Gzipped | When it loads |
|---|---|---|---|
| **Entry (`index-*.js`)** | 575 KB | **176 KB** | Immediately — the app shell |
| `Viewport3D-*.js` | 943 KB | 251 KB | On demand — Three.js and both viewports |
| `Charts-*.js` | 380 KB | 109 KB | On demand — Recharts and the three charts |
| `FeedbackDialog-*.js` | 16 KB | 6 KB | On demand — the usability questionnaire |
| `worker-*.js` | 7 KB | 3 KB | With the simulation engine |
| `sw.js` + `workbox-*.js` | 18 KB | — | With the service worker, for offline use |
| CSS | 62 KB | 13 KB | Immediately |
| Fonts | 296 KB | — | Only the subsets the page uses |

**Initial JavaScript: 536 KB → 176 KB gzipped, a 67% reduction.**

Everything the user can interact with in the first moment — controls, playback
bar, metric cards, the comparison table, the disclaimer — is in the entry chunk.
The two heavy libraries now arrive after the interface is already usable.

## What changed, and why

### Three.js is deferred (`LazyViewport.tsx` → `Viewport3D.tsx`)

Three.js is the single largest dependency here. Loading it up front meant the
page stayed blank until ~250 KB more had downloaded and parsed.

Both viewports live in **one** lazy chunk, deliberately. Splitting them would
pull Three.js in twice across a session: you pay for the view you open first,
and the second arrives from cache at the same moment anyway.

`LazyViewport.tsx` shows a placeholder that **names the building** rather than a
spinner — a user arriving during the gap is told what is about to appear
instead of looking at an empty rectangle.

### Recharts is deferred (`LazyCharts.tsx` → `Charts.tsx`)

The metric cards above the charts carry the headline numbers and render
immediately, so deferring the graphs costs the user nothing they were waiting
for.

All three charts are lazy-loaded together. Three separate `lazy()` calls would
make three requests that each pull their own copy of Recharts' shared
dependencies — worse than shipping them in one chunk.

The placeholder **reserves the height the charts will occupy**. Without that the
results panel visibly jumps as the chunk lands, which is more disruptive than
the loading itself.

### `ComparisonTable` stays eager

It contains no chart code, renders no canvas, and is the part of comparison mode
that carries the actual numbers. Deferring it would hide results behind a
spinner for no saving.

## Things that looked like problems and were not

Recorded because they are easy to "fix" and the fix would be worse.

### The 14 font files

The build emits ~296 KB of `.woff2` across 14 files, including Cyrillic, Greek
and Vietnamese subsets — for an English-only application.

**This costs the user nothing.** `@fontsource-variable` declares each subset in
one CSS file with its own `unicode-range`, and a browser only downloads a subset
when the page actually contains a glyph from it. The real transfer is about
**87 KB** (Latin for both families).

`@fontsource-variable` has no per-subset entry point — `@fontsource-variable/inter/latin.css`
does not exist. Importing it produced a build with **no font files at all** and
no error, which would have silently dropped the app's typography. That was
tried, caught, and reverted.

If deploy size ever matters more than the import staying maintainable, write
`@font-face` blocks pointing at `files/inter-latin-wght-normal.woff2` directly.
Do not guess the paths — a wrong path fails silently and the page simply loses
its fonts, exactly as above.

### The simulation worker

7 KB, gzipped to 3. It is already a separate chunk, which is the point: the
engine must not block the UI thread. A budget test asserts it stays separate and
stays small, because inlining it would be invisible until the app started
dropping frames on every slider drag.

### Source maps: 9 MB that were being shipped

`sourcemap: true` was unconditional, so every build wrote ~9 MB of `.map` files
into `dist` — roughly **nine times the size of the application**. Deploy the
folder as-is and anyone who guesses the URL gets them.

They are now **off by default**. There is no server-side stack to debug in
production, and the source is public on GitHub anyway. Opt in when debugging a
built bundle:

```bash
VITE_SOURCEMAP=true npm run build
```

The dev server is unaffected and always has working maps. A budget test asserts
`dist` contains no `.map` files, so this cannot silently come back.

## Budgets

Enforced by `tests/unit/bundle.test.ts`. Deliberately set above today's figures
so ordinary work does not trip them — they exist to catch a structural
regression, not to police kilobytes.

| Budget | Limit | Actual |
|---|---|---|
| Entry chunk, gzipped | 220 KB | 176 KB |
| Total JavaScript, gzipped | 620 KB | 528 KB |
| Simulation worker, gzipped | 30 KB | 3 KB |
| `Viewport3D`, `Charts` and `FeedbackDialog` must exist as separate chunks | — | ✅ |
| Every emitted chunk must be precached for offline | — | ✅ |
| Source maps in `dist` | none | none |

The total-JavaScript budget alone would **not** catch an eager re-import: the
total does not change when a lazy chunk is folded back in. Only the
chunk-separation check notices, which is why it exists.

## Offline

A service worker precaches the whole build, so QuakeStudio works with no
network at all. Android and desktop Chromium; iOS install is out of scope
because Safari exposes no install API. That is not a downgrade: every byte it needs is either in the
repository or computed on the device, because there is no server call anywhere
in the app. A student in a basement lab gets the full simulator.

The precache has to include the **lazy** chunks, and that is the part which is
easy to get wrong. `Viewport3D`, `Charts` and `FeedbackDialog` are dynamic
imports, fetched at runtime. Precaching only `index.html` produces an app that
opens offline and then breaks the moment a student opens the 3D viewport —
which is most of what they came for. The simulation worker is the same: it is
created with `new Worker(new URL(...))`, so a stranded worker looks perfectly
healthy until you notice the numbers never change.

Two budgets would have hidden this: workbox's 2 MB per-file limit silently
dropped nothing here but would drop the 943 KB 3D chunk as the app grows, and
the bundle budget does not care what is cached. Both are raised/asserted, and
`tests/e2e/pwa.spec.ts` verifies the whole sequence with the network genuinely
switched off.

Run those separately, because they need a production build rather than the dev
server:

```bash
npm run test:pwa
```

## Runtime performance

Measured by `tests/unit/solver.test.ts`, which asserts the budgets rather than
just reporting them:

| Case | Budget | Measured |
|---|---|---|
| 20 floors, 60 s at `dt` = 0.01 (6,000 steps) | < 200 ms | ~5 ms |
| 5 floors, 20 s (typical) | < 50 ms | ~5 ms |

The worst case is roughly **40× under budget**, because `K_eff` is
Cholesky-factored once and reused for every step. That headroom is why
`dt` could be halved for a refinement pass without touching the frame budget —
worth considering if the adviser asks for tighter time integration.

## Rendering

A 60 fps animation causes **zero React renders**:

- The 3D sway writes to Three.js transforms inside `useFrame`.
- The chart cursor moves with `transform` from its own `requestAnimationFrame`.

`PlaybackClock` is mounted once, above everything that reads time, so it keeps
ticking regardless of which tab is visible on mobile.

## What was deliberately not done

- **No bundle analysis tool.** A visualiser would have found the same two
  libraries in a minute, and would then be another dependency and another config
  file to maintain. The build output names them.
- **No manual chunking.** It splits *where* code lives but does not defer
  anything, so the browser still waits for all of it. `React.lazy` actually
  removes Three.js and Recharts from the critical path.
- **No service worker or caching layer.** The app is fully offline-capable
  already — fonts are bundled and there is no backend. A service worker would
  add update-prompt UX and cache-invalidation bugs for no benefit at this size.