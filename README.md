# QuakeStudio

**Educational earthquake response simulator for students.** Build a simplified
building, shake it, and watch how it sways.

> ⚠️ **Educational simulation using simplified assumptions. Not a structural
> safety assessment.** Every engineering number in this project is a placeholder
> pending review by a civil/structural engineer.

## Status

**Phase 5 — Verification, accessibility and performance.** Complete. The engine
is cross-validated against an independent Python implementation, the app passes
an axe-core audit with zero violations, and initial JavaScript dropped from
536 KB to 175 KB gzipped.

**Still not validated engineering.** The cross-check proves the code implements
the model in `engineeringAssumptions.ts` as specified. It does not prove the
model is right — every coefficient remains a placeholder awaiting review.

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: tooling, tokens, assumptions config | ✅ |
| 1 | UI shell & static prototype | ✅ |
| 2 | Simulation engine + Web Worker | ✅ |
| 3 | Real-time response & data output | ✅ |
| 4 | Parameter comparison & persistence | ✅ |
| 5 | Verification, accessibility, polish | ✅ |
| 6 | Usability testing | ⏳ |
| 7 | _Optional_ — site factors, pending client + adviser approval | ⏳ |

## ⚠️ Read this before trusting a number

The model is real structural dynamics — mass, stiffness, damping, Newmark
integration, and a Cholesky-factored solve. But **every coefficient is a
placeholder** (`src/config/engineeringAssumptions.ts`), and the model has not
yet been checked against an independent implementation.

So the *relationships* are trustworthy — a braced frame really does sway less, a
taller building really does have a longer period — while the *absolute values*
are not. See [`docs/assumptions.md`](docs/assumptions.md).

## Working on this repo

Everything commits straight to `main`:

```bash
git add -A
git commit -m "Phase 4: parameter comparison and persistence"
git push
```

### ⚠️ Commit authorship

The Phase 0–2 commits are authored as
`QuakeStudio Team <team@quakestudio.local>` — a placeholder identity, not a
real GitHub account. They are **not** linked to your GitHub profile and do not
count toward your contributions graph. To fix that for future commits:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

Rewriting the existing commits' authorship is possible with `git rebase` plus a
force-push, so it is best done now rather than once there are more of them.

## Requirements

- **Node.js ≥ 22.12** (Vite 8 needs it; 24.x recommended)
- npm 10+
- Python 3.11+ — only from Phase 5, for the reference solver

## Getting started

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

## Scripts

Run from the repository root.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 5173 |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint across the repo |
| `npm run lint:fix` | ESLint with autofix |
| `npm run format` | Prettier, write |
| `npm run format:check` | Prettier, verify only |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit + component tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run e2e:install` | **Download Playwright's Chromium (~500 MB, once)** |
| `npm run e2e` | Playwright end-to-end tests (54 specs) |
| `npm run validate` | Cross-check the engine against the Python reference |

`npm run e2e` fails until you have run `npm run e2e:install` at least once.

`npm run validate` needs Python with NumPy and SciPy:

```bash
pip install -r reference/python/requirements.txt
```

It regenerates [`docs/validation-report.md`](docs/validation-report.md) from
measured numbers, and **exits non-zero** if the two implementations disagree
beyond tolerance — so it can gate CI.

## The workspace

Desktop (≥1024px) is three zones: controls on the left, the 3D viewport and
playback bar in the middle, results on the right. Below 1024px those become
Build / Simulate / Results tabs, one at a time.

Controls to know about:

- **Template picker** — six starting points, each with a one-line description.
  Editing any field afterwards switches the label to "Custom". It is replaced by
  an **A / B switcher** while comparison is on.
- **Glossary** — every jargon term has a ⓘ that explains it in one sentence.
- **Motion exaggeration** (×20) — real displacement is millimetres, which is
  invisible at this scale. The slider magnifies the 3D view only; the numbers
  stay true.

Disabled on purpose, each labelled with the phase that delivers it: the
assumptions page (Phase 5) and Site & ground (Phase 7, pending engineering
approval).

## Comparison

`Compare with another building` adds a second configuration and runs **both**
under the identical earthquake. That last part is the whole point of the
feature, so the results table states the shared PGA and duration in a caption
and the 3D view colours each side in a fixed hue — blue for A, amber for B, in
both light and dark themes, because in a comparison the colour *is* the identity
of a series.

Two presentations, switched at the top of the viewport:

- **Side by side** — easiest to read when the buildings are very different.
- **Ghost overlay** — B translucent over A; best for spotting that two
  differently-shaped buildings happen to sway almost the same amount.

The change column gives the difference as a percentage of A, with an arrow as
well as a sign so the direction does not depend on colour. Nothing in the
comparison says which building is better — that is a verdict this tool is not
entitled to.

Both sides are solved in a **single** worker request. Two separate requests
would race and leave one side showing numbers from different inputs.

## Saving and sharing runs

`Save run` stores the current model, its motion, and its full result in the
browser — IndexedDB where available, localStorage otherwise. The dialog says
which backend it is using, because the fallback has to thin very long runs to
fit; a thinned run keeps its peaks and periods exactly but cannot replay the
animation frame for frame, and the UI says so rather than hiding it.

Runs can be **exported to one JSON file** and **imported** on another machine.
Imports are validated before anything is written: a file from a newer version, a
truncated file, or simply the wrong file is refused with a readable message,
and if only some runs in a file are valid the good ones import and the rest are
named.

See [`src/storage/README.md`](apps/web/src/storage/README.md) for the
`RunStorage` interface, the fallback's limits, and the two IndexedDB footguns.

## The engine

`src/engine/` implements a linear-elastic shear building:

```
M·ü + C·u̇ + K·u = −M·1·a_g(t)
```

integrated with Newmark-β (β = ¼, γ = ½ — unconditionally stable and
non-dissipative) at a fixed `dt = 0.01 s`. It runs in a Web Worker, debounced
at 150 ms, and drops stale responses so the numbers on screen always match the
controls you can see.

See [`src/engine/README.md`](apps/web/src/engine/README.md) for the invariants
and why each method was chosen.

## Playback

One clock drives everything. The 3D sway and the chart cursor both sample
displacement from the same `result.floorDisp` array via `sampleDisplacement`,
which interpolates between engine timesteps — nearest-sample lookup makes the
building visibly twitch rather than sway.

The animation writes to Three.js transforms inside `useFrame` and never calls
`setState`, and the chart cursor is moved with `transform` from its own
`requestAnimationFrame` loop. A 60 fps animation therefore causes zero React
renders.

**Motion exaggeration (×20 by default)** magnifies the 3D view only, because
real movement is millimetres. The numbers stay true, and the playback bar says
so in as many words.

`prefers-reduced-motion` keeps playback paused on load and halves the default
speed.

## CSV export

`Export CSV` writes the current run at full precision, in the units the UI
shows (displacement in mm, drift in percent, ground acceleration in m/s²).
Displacement columns come from the same `SimulationResult` the charts render,
so the file and the screen cannot disagree. The header block also states each
headline figure *exactly as displayed*, which makes the match checkable.

## Repository layout

```
QuakeStudio/
├─ apps/web/                    # Vite + React + TypeScript app
│  └─ src/
│     ├─ components/            # ui/ controls/ viewport/ charts/ layout/
│     ├─ config/engineeringAssumptions.ts   # ← ALL placeholder numbers
│     ├─ engine/                # solver, building model, worker (Phase 2)
│     ├─ store/                 # Zustand stores
│     ├─ storage/               # RunStorage interface + IndexedDB impl
│     ├─ styles/tokens.css      # ← design tokens, single source of truth
│     ├─ types/                 # shared types + Zod schemas
│     └─ lib/
├─ reference/python/            # NumPy/SciPy reference solver (Phase 5)
├─ docs/
│  ├─ assumptions.md            # ← what the engineering adviser reviews
│  └─ validation-report.md      # TS vs Python comparison (Phase 5)
├─ vitest.config.ts             # unit tests, run from the root
└─ eslint.config.js
```

## Where the important things live

| Concern | File |
|---|---|
| Every engineering constant | [`apps/web/src/config/engineeringAssumptions.ts`](apps/web/src/config/engineeringAssumptions.ts) |
| Every colour, font, spacing value | [`apps/web/src/styles/tokens.css`](apps/web/src/styles/tokens.css) |
| Open questions for the adviser | [`docs/assumptions.md`](docs/assumptions.md) |
| Does the engine do what the config says? | [`docs/validation-report.md`](docs/validation-report.md) |
| How the engine was cross-checked | [`reference/README.md`](reference/README.md) |
| Accessibility findings and gaps | [`docs/accessibility-audit.md`](docs/accessibility-audit.md) |
| Bundle sizes, budgets and what was deferred | [`docs/performance.md`](docs/performance.md) |
| Copy rules and the wording review | [`docs/copy-review.md`](docs/copy-review.md) |

Two rules keep this maintainable, and both are enforced by tests:

1. **No hard-coded engineering numbers** outside `engineeringAssumptions.ts`.
   A unit test scans the file and fails if an assumed value is missing its
   `// PLACEHOLDER – needs engineer review` comment.
2. **No hard-coded colours** in components — use a token. `tokens.css` keeps one
   hex palette, and shadcn/ui's variable names alias onto it rather than
   duplicating it. `contrast.test.ts` checks every foreground/background pair
   against WCAG AA, so a colour change that breaks contrast fails the build.

### Reading design tokens in Three.js

CSS variables do **not** work in WebGL — `color="var(--drift-2)"` renders
black. Use `useCssVar` / `useCssVars` from `src/lib/useCssVar.ts`, which
resolve a token to a concrete hex and re-resolve when the theme changes.

## Tech stack

React 19 · TypeScript 5.9 · Vite 8 · Tailwind CSS 4 · shadcn/ui · Zustand ·
Three.js + React Three Fiber · Recharts · Zod · Vitest · Playwright

TypeScript is pinned to 5.9.x on purpose: `typescript-eslint` does not yet
support TypeScript 7, and working lint tooling matters more here than a newer
compiler.

## License

MIT