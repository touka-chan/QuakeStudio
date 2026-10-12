# QuakeStudio

**Educational earthquake response simulator for students.** Build a simplified
building, shake it, and watch how it sways.

> ⚠️ **Educational simulation using simplified assumptions. Not a structural
> safety assessment.** Every engineering number in this project is a placeholder
> pending review by a civil/structural engineer.

## Status

**Phase 0 — Foundation.** Complete. The design system, engineering-assumption
register, tooling, and test setup are in place. The app currently renders a
design-system proof page, not the workspace.

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: tooling, tokens, assumptions config | ✅ |
| 1 | UI shell & static prototype (mock data) | ⏳ |
| 2 | Simulation engine + Web Worker | ⏳ |
| 3 | Real-time response & data output | ⏳ |
| 4 | Parameter comparison & persistence | ⏳ |
| 5 | Verification, accessibility, polish | ⏳ |
| 6 | Usability testing | ⏳ |
| 7 | _Optional_ — site factors, pending client + adviser approval | ⏳ |

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
| `npm run e2e` | Playwright end-to-end tests |

`npm run e2e` fails until you have run `npm run e2e:install` at least once.

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
   duplicating it.

## Tech stack

React 19 · TypeScript 5.9 · Vite 8 · Tailwind CSS 4 · shadcn/ui · Zustand ·
Three.js + React Three Fiber · Recharts · Zod · Vitest · Playwright

TypeScript is pinned to 5.9.x on purpose: `typescript-eslint` does not yet
support TypeScript 7, and working lint tooling matters more here than a newer
compiler.

## License

MIT