# QuakeStudio

**Educational earthquake response simulator for students.** Build a simplified
building, shake it, and watch how it sways.

> ⚠️ **Educational simulation using simplified assumptions. Not a structural
> safety assessment.** Every engineering number in this project is a placeholder
> pending review by a civil/structural engineer.

## Status

**Phase 3 — Real-time response & data output.** Complete. The building sways,
the chart cursor tracks it, and a run exports to CSV. **Still not validated**
— every coefficient is a placeholder, and Phase 5 compares this engine against
an independent Python implementation.

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: tooling, tokens, assumptions config | ✅ |
| 1 | UI shell & static prototype | ✅ |
| 2 | Simulation engine + Web Worker | ✅ |
| 3 | Real-time response & data output | ✅ |
| 4 | Parameter comparison & persistence | ⏳ |
| 5 | Verification, accessibility, polish | ⏳ |
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
git commit -m "Phase 3: real-time response and data output"
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
| `npm run e2e` | Playwright end-to-end tests (18 specs) |

`npm run e2e` fails until you have run `npm run e2e:install` at least once.

## The workspace

Desktop (≥1024px) is three zones: controls on the left, the 3D viewport and
playback bar in the middle, results on the right. Below 1024px those become
Build / Simulate / Results tabs, one at a time.

Controls to know about:

- **Template picker** — six starting points, each with a one-line description.
  Editing any field afterwards switches the label to "Custom".
- **Glossary** — every jargon term has a ⓘ that explains it in one sentence.
- **Motion exaggeration** (×20) — real displacement is millimetres, which is
  invisible at this scale. The slider magnifies the 3D view only; the numbers
  stay true.

Disabled on purpose, each labelled with the phase that delivers it: playback
(Phase 3), comparison (Phase 4), save / export CSV / assumptions (Phases 3–5),
and Site & ground (Phase 7, pending engineering approval).

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