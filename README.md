# QuakeStudio

**Educational earthquake response simulator for students.** Build a simplified
building, shake it, and watch how it sways — then compare two designs under the
identical earthquake.

> ⚠️ **Educational simulation using simplified assumptions. Not a structural
> safety assessment.** Every engineering number in this project is a placeholder
> pending review by a civil/structural engineer.

---

## Status

**Phases 0–5 complete. Phase 6 instrumented, study not yet run. Phase 7
optional and awaiting client + engineering-adviser approval.**

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: tooling, tokens, assumptions config | ✅ |
| 1 | UI shell & static prototype | ✅ |
| 2 | Simulation engine + Web Worker | ✅ |
| 3 | Real-time response & data output | ✅ |
| 4 | Parameter comparison & persistence | ✅ |
| 5 | Verification, accessibility, performance, copy review | ✅ |
| 6 | Usability testing — instrument, protocol, expert review ✅ · **study not yet run** ⏳ | ⏳ |
| 7 | _Optional_ — site factors (soil, foundation, fault distance) | ⏳ |

### What has been verified

| Claim | Evidence | Result |
|---|---|---|
| The engine implements the specified model | TypeScript vs an independent Python solver, 16 cases | **PASS** — worst disagreement 6.3e-11% |
| The app is accessible | axe-core over every surface + real-browser focus/tab/live-region tests | **0 violations** |
| The app is usable with a keyboard | Playwright tab-order and focus-return specs | **Pass** |
| It is fast enough | Lazy-loaded chunks, no `setState` in the animation loop | Entry JS **536 KB → 175 KB** gzipped |
| The wording is honest | A deliberate copy review, defect by defect | 4 defects fixed |
| The study instrument is correctly scored | Two independent implementations cross-checked | **PASS** — 10 cases agree exactly |

### What has **not** been verified

**The engineering.** The cross-check proves the code implements the model in
`engineeringAssumptions.ts` as specified. It cannot prove the model is right —
a wrong assumption is reproduced identically on both sides of the comparison.

So the *relationships* are trustworthy — a braced frame really does sway less, a
taller building really does have a longer period — while the *absolute values*
are not. Every coefficient awaits adviser review
([`docs/assumptions.md`](docs/assumptions.md)).

---

## ⚠️ Read this before trusting a number

The model is real structural dynamics — mass, stiffness, damping, Newmark
integration, and a Cholesky-factored solve. It has been cross-validated against
an independent implementation to 6.3e-11%, which says the arithmetic is
faithful.

But **every coefficient is a placeholder**
([`apps/web/src/config/engineeringAssumptions.ts`](apps/web/src/config/engineeringAssumptions.ts)).
Validation proves the code does what the config says; nothing so far proves the
config is physically right. That is what the engineering adviser is for, and it
is the single largest open item in this project.

A disclaimer is visible in the app at all times, and the About & Assumptions
page derives its rows **from the config file at runtime** — so it cannot drift
from what the engine actually runs.

---

## What the app does

**Desktop (≥1024px)** is three zones: controls on the left, the 3D viewport and
playback bar in the middle, results on the right. **Below 1024px** those become
Build / Simulate / Results tabs, one at a time.

Controls worth knowing about:

- **Template picker** — six starting points, each with a one-line description.
  Editing any field afterwards switches the label to "Custom". It is replaced by
  an **A / B switcher** while comparison is on.
- **Glossary** — every jargon term has a ⓘ that explains it in one sentence.
- **Motion exaggeration** (×20) — real displacement is millimetres, which is
  invisible at this scale. The slider magnifies the 3D view only; **the numbers
  stay true**, and the playback bar says so in as many words.

**Disabled on purpose:** Site & ground (soil, foundation, fault distance) is
visible but unavailable — Phase 7 scope, pending engineering approval. It is
labelled as such rather than hidden, so the boundary of the model is explicit.

### Comparison

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
well as a sign so the direction does not depend on colour. **Nothing in the
comparison says which building is better** — that is a verdict this tool is not
entitled to.

Both sides are solved in a **single** worker request. Two separate requests
would race and leave one side showing numbers from different inputs.

A persistent **"Editing A / Editing B"** indicator sits outside the scrolling
controls panel, so it stays visible however far you scroll down.

### Saving and sharing runs

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

See [`apps/web/src/storage/README.md`](apps/web/src/storage/README.md) for the
`RunStorage` interface, the fallback's limits, and the two IndexedDB footguns.

### CSV export

`Export CSV` writes the current run at full precision, in the units the UI shows
(displacement in mm, drift in percent, ground acceleration in m/s²). Displacement
columns come from the same `SimulationResult` the charts render, so the file and
the screen cannot disagree. The header block also states each headline figure
*exactly as displayed*, which makes the match checkable.

---

## How it works

### The engine

[`apps/web/src/engine/`](apps/web/src/engine/README.md) implements a
linear-elastic shear building:

```
M·ü + C·u̇ + K·u = −M·1·a_g(t)
```

integrated with Newmark-β (β = ¼, γ = ½ — unconditionally stable and
non-dissipative) at a fixed `dt = 0.01 s`. It runs in a Web Worker, debounced at
150 ms, and drops stale responses so the numbers on screen always match the
controls you can see.

The Python reference deliberately shares *constants* (exported to
`reference/constants.json`) but **not code**: it solves the generalised
eigenproblem with LAPACK instead of reducing to M⁻¹K + Jacobi, factorises with
LAPACK Cholesky rather than a hand-rolled routine, and steps the whole matrix
with NumPy. Two implementations that share no code can disagree; that is the
point.

### Playback

One clock drives everything. The 3D sway and the chart cursor both sample
displacement from the same `result.floorDisp` array via `sampleDisplacement`,
which interpolates between engine timesteps — nearest-sample lookup makes the
building visibly twitch rather than sway.

The animation writes to Three.js transforms inside `useFrame` and never calls
`setState`, and the chart cursor is moved with `transform` from its own
`requestAnimationFrame` loop. **A 60 fps animation therefore causes zero React
renders.**

`prefers-reduced-motion` keeps playback paused on load and halves the default
speed.

---

## Verification

This is the part of the project that took the most work, and it is what makes
the rest trustworthy.

### 1. Cross-validation against an independent solver

```bash
pip install -r reference/python/requirements.txt
npm run validate
```

Runs the TypeScript engine and the Python reference over a 16-case matrix,
regenerates [`docs/validation-report.md`](docs/validation-report.md) from
measured numbers, and **exits non-zero** on disagreement — so it can gate CI.

Current result: **PASS, worst disagreement 6.3e-11%.**

Two deliberate choices worth knowing if you change anything:

- **Tolerance is 1e-6, not the 5% the spec suggested.** 5% is the right
  threshold for comparing against a *real structure*, where modelling error is
  expected. Two implementations of the same arithmetic should agree to ~1e-12,
  and a 5% band would let a sign error pass.
- **The matrix is built around edges**, not around the default model: 1 floor,
  2 floors, 20 floors, damping override, all 3 motion presets, and a
  near-resonance case. Agreeing on the default model proves very little.

### 2. Accessibility

axe-core runs over every surface (idle, comparison mode, every dialog, the
import path), plus real-browser tests in Chromium for the things jsdom cannot
see: focus management, tab order, and live-region announcements.

Six defects were found and fixed. The dominant class was **markup that looks
right and conveys nothing** — `aria-label` on a roleless element is *prohibited*
and silently dropped by screen readers. It was the single most common defect in
the audit.

See [`docs/accessibility-audit.md`](docs/accessibility-audit.md).

### 3. Performance

Initial JavaScript went from **536 KB to 175 KB gzipped**. Three.js and Recharts
are lazy-loaded and the source maps are not shipped by default. Both viewports
deliberately share **one** 3D chunk — splitting them would pull Three.js twice
per session.

Lazy loading is easy to undo by accident, so `bundle.test.ts` separately asserts
the `Viewport3D-*`, `Charts-*` and `FeedbackDialog-*` chunks exist. The total
budget test cannot catch that regression; only these can.

See [`docs/performance.md`](docs/performance.md).

### 4. Copy review

Every user-visible string was reviewed for honesty — particularly anything that
could read as a structural verdict, or that overstated what the model
establishes. Four defects fixed, including an overclaim in the playback bar
("the numbers are the true values") and a stale "opens in Phase 5" label. See
[`docs/copy-review.md`](docs/copy-review.md).

### 5. Usability

See the next section.

---

## Usability testing: the study has not been run

QuakeStudio **ships the instrument, not the results.** The System Usability
Scale questionnaire is in the app under **Feedback**, the scoring follows the
published rule, and `analyze.py` turns exported responses into a report.

**There is no SUS score in this repository.** A usability score without
participants is a made-up number, and writing one would be the most damaging
thing this project could do.

| Document | What it is |
|---|---|
| [`docs/usability-plan.md`](docs/usability-plan.md) | The protocol: recruiting, task script, ethics, how to report without overstating |
| [`docs/heuristic-evaluation.md`](docs/heuristic-evaluation.md) | Expert review against Nielsen's ten heuristics — real findings, but done by an agent reviewing its own work, so **it needs a human re-run** |
| `docs/usability-results.md` | **Does not exist yet.** Generated by the script once real participants have been tested |

Client target: **mean SUS ≥ 68** (the 50th percentile of Bangor's reference
corpus — i.e. "average").

### A trap in the scoring rule

Brooke's rule is **by item parity** — odd items (1, 3, 5, 7, 9) score
`value − 1`, even items (2, 4, 6, 8, 10) score `5 − value` — and for two items
that does **not** match the wording:

| Item | Statement | Reads as | Scored as |
|---|---|---|---|
| 8 | "I found the system to be easy to use." | positive | **reversed** |
| 10 | "I needed to learn a great deal…" | negative | **forward** |

So the natural "fix" — matching polarity to how a statement reads — costs
**10 points per response**, enough to move a whole study across the 68 target.
Scoring is keyed off the item number so a mislabelled flag cannot reach a
result.

Because that rule is now implemented **twice** — TypeScript for the score a
participant sees, Python for the score a researcher reports — it gets the same
treatment as the structural engine:

```bash
npm run usability:cross-check   # 10 cases, both implementations, must agree
```

### Running the analysis

```bash
# After running sessions and exporting responses from the app:
python tools/usability/analyze.py responses.json
```

Every figure in the generated report is computed, not typed in. The script
**refuses to call a sample under `--min-participants` a study** and exits
non-zero. Partial responses are excluded rather than scored over the answered
items — an unanswered question is missing data, not a low score, and averaging
would bias the sample against whichever question participants found hardest.

Running the study needs people, so it is a **scheduling task rather than a
development one**.

---

## Requirements

- **Node.js ≥ 22.12** (Vite 8 needs it; 24.x recommended)
- npm 10+
- Python 3.11+ — for the reference solver and the usability analysis
  (verified on 3.13)

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
| `npm run build` | Type-check, then build for production |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint across the repo |
| `npm run lint:fix` | ESLint with autofix |
| `npm run format` | Prettier, write |
| `npm run format:check` | Prettier, verify only |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit + component tests — **336 tests** |
| `npm run test:watch` | Vitest in watch mode |
| `npm run e2e:install` | **Download Playwright's Chromium (~500 MB, once)** |
| `npm run e2e` | Playwright end-to-end tests — **59 specs** |
| `npm run validate` | Cross-check the engine against the Python reference |
| `npm run usability:cross-check` | Cross-check the SUS scorer against Python |

`npm run e2e` fails until you have run `npm run e2e:install` at least once.

`npm run validate` and `npm run usability:cross-check` need Python with NumPy
and SciPy:

```bash
pip install -r reference/python/requirements.txt
```

Both regenerate a report from measured numbers and **exit non-zero** on
disagreement, so either can gate CI.

---

## Repository layout

```
QuakeStudio/
├─ apps/web/                          # Vite + React + TypeScript app
│  └─ src/
│     ├─ components/                  # ui/ controls/ viewport/ charts/ layout/
│     ├─ config/engineeringAssumptions.ts   # ← ALL placeholder numbers
│     ├─ engine/                      # solver, building model, worker (Phase 2)
│     ├─ feedback/                    # SUS instrument, scoring, dialog (Phase 6)
│     ├─ storage/                     # RunStorage interface + IndexedDB impl
│     ├─ store/                       # Zustand stores
│     ├─ styles/tokens.css            # ← design tokens, single source of truth
│     ├─ types/                       # shared types + Zod schemas
│     └─ lib/
├─ reference/
│  ├─ python/                         # NumPy/SciPy reference solver
│  ├─ cases.json                      # the 16-case validation matrix
│  └─ constants.json                  # generated, shared with the Python side
├─ tools/usability/                   # SUS analysis + scorer cross-check
├─ docs/
│  ├─ assumptions.md                  # ← what the engineering adviser reviews
│  ├─ validation-report.md            # generated: TS vs Python (Phase 5)
│  ├─ accessibility-audit.md          # axe results + findings (Phase 5)
│  ├─ performance.md                  # bundle sizes and budgets (Phase 5)
│  ├─ copy-review.md                  # wording review (Phase 5)
│  ├─ usability-plan.md               # study protocol (Phase 6)
│  └─ heuristic-evaluation.md         # Nielsen's ten heuristics (Phase 6)
├─ vitest.config.ts                   # unit tests, run from the root
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
| Bundle sizes, budgets, what was deferred | [`docs/performance.md`](docs/performance.md) |
| Copy rules and the wording review | [`docs/copy-review.md`](docs/copy-review.md) |
| How to run the usability study | [`docs/usability-plan.md`](docs/usability-plan.md) |
| Expert usability review | [`docs/heuristic-evaluation.md`](docs/heuristic-evaluation.md) |
| Engine invariants and method choices | [`apps/web/src/engine/README.md`](apps/web/src/engine/README.md) |
| Storage interface and its limits | [`apps/web/src/storage/README.md`](apps/web/src/storage/README.md) |
| Store architecture | [`apps/web/src/store/README.md`](apps/web/src/store/README.md) |

### Two rules that keep this maintainable

Both are enforced by tests, not by discipline:

1. **No hard-coded engineering numbers** outside `engineeringAssumptions.ts`.
   A unit test scans the file and fails if an assumed value is missing its
   `// PLACEHOLDER – needs engineer review` comment.
2. **No hard-coded colours** in components — use a token. `tokens.css` keeps one
   hex palette, and shadcn/ui's variable names alias onto it rather than
   duplicating it. `contrast.test.ts` checks every foreground/background pair
   against WCAG AA, so a colour change that breaks contrast fails the build.

### Reading design tokens in Three.js

CSS variables do **not** work in WebGL — `color="var(--drift-2)"` renders
black. Use `useCssVar` / `useCssVars` from `apps/web/src/lib/useCssVar.ts`, which
resolve a token to a concrete hex and re-resolve when the theme changes.

---

## Tech stack

React 19 · TypeScript 5.9 · Vite 8 · Tailwind CSS 4 · shadcn/ui · Zustand ·
Three.js + React Three Fiber · Recharts · Zod · Vitest · Playwright · NumPy +
SciPy

TypeScript is pinned to 5.9.x on purpose: `typescript-eslint` does not yet
support TypeScript 7, and working lint tooling matters more here than a newer
compiler.

## Working on this repo

Everything commits straight to `main`:

```bash
git add -A
git commit -m "Phase 6: usability study instrument"
git push
```

### ⚠️ Commit authorship

Commits are authored as
`QuakeStudio Team <team@quakestudio.local>` — a placeholder identity, not a real
GitHub account. They are **not** linked to your GitHub profile and do not count
toward your contributions graph. To fix that for future commits:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

Rewriting existing authorship is possible with `git rebase` plus a force-push, so
it is best done now rather than once there are more commits.

### Conventions worth knowing before you change things

- **`erasableSyntaxOnly` is on.** No TypeScript `enum`, no constructor
  parameter properties. Plain classes need explicit field declarations.
- **`tsconfig` has no `paths` at the root.** `tsx` scripts need
  `--tsconfig apps/web/tsconfig.app.json` to resolve the `@/` alias.
- **Dialogs live beside their `DialogTrigger`** so Radix restores focus on
  close. Moving one away from its trigger silently breaks that.
- **The shadcn CLI writes to a literal `apps/web/@/` directory** and imports
  `cn` from `"cn"`. After adding a component, move it into
  `src/components/ui/`, replace the import with `from "@/lib/utils"`, then run
  Prettier.

---

## Open items

| Item | Blocked on |
|---|---|
| Every engineering coefficient is a placeholder | Engineering adviser — [`docs/assumptions.md`](docs/assumptions.md) §1 |
| Drift colour bands do not discriminate | Engineering adviser — `docs/assumptions.md` §7a |
| Drift-ratio definition differs per-floor *peaks* | Engineering adviser |
| Usability study has not been run | **People** — needs ~10 students, [`docs/usability-plan.md`](docs/usability-plan.md) |
| Site factors (soil, foundation, fault distance) | Client + engineering adviser (Phase 7) |

---

## License

MIT — except the System Usability Scale instrument, which is the work of
Bangor, Kortum & Miller and is used here without charge for evaluation. Confirm
the terms with the authors before redistributing this repository publicly.