# Validation harness

Cross-checks the TypeScript engine against an **independent Python
implementation** of the same model.

A passing unit test proves the engine agrees with itself. It says nothing about
whether the engine is *right*. That is the gap this directory exists to close.

## Run it

```bash
npm run validate
```

That runs all three steps below. Individually:

| Step | Command | Produces |
|---|---|---|
| Export the shared constants | `npm run validate:constants` | `constants.json` |
| Solve every case with the shipping engine | `npm run validate:ts` | `ts-results.json` |
| Solve with Python and compare | `npm run validate:python` | `docs/validation-report.md` |

Python needs NumPy and SciPy:

```bash
pip install -r reference/python/requirements.txt
```

The comparison **exits non-zero** if the two implementations disagree beyond
tolerance, so it can gate CI.

## Why the constants are exported rather than copied

If the Python solver carried its own copy of the mass-per-area or damping
figures, a disagreement would be ambiguous: a bug in TypeScript, a typo in
Python, or a stale copy of a number. So `constants.json` is generated from
`engineeringAssumptions.ts` — the single source of truth — and read by the
reference.

Change a number in the TypeScript config, re-run, and both sides move
together. The review checklist in `docs/assumptions.md` §1 stays meaningful
because there is exactly one number to review.

## How the independence is achieved

Where a choice was available, the reference deliberately makes a **different**
one, so that agreement is evidence rather than coincidence:

| Concern | TypeScript (ships) | Python reference |
|---|---|---|
| Eigenvalues | hand-written Jacobi, on the mass-reduced `M⁻¹K` | `scipy.linalg.eigh` on the **generalised** problem `(M, K)` |
| Linear solve | hand-written Cholesky + substitution | `scipy.linalg.cho_solve` (LAPACK) |
| Time stepping | fused double loop over matrix rows | whole-matrix NumPy expressions |
| Assembly | index arithmetic into a flat `Float64Array` | `@` operators on 2-D arrays |

The generalisation matters: TypeScript reduces to `M⁻¹K` and solves a standard
problem, while the reference hands `M` and `K` straight to LAPACK. Agreement
therefore also confirms the reduction step was correct.

**What is deliberately *not* independent:** the model itself. Both sides use the
same constants, the same period formula, the same Rayleigh calibration and the
same Newmark-β parameters — because the question is "does the code implement
the specification", not "do two people invent the same building".

## What this does and does not prove

It proves the TypeScript engine implements `engineeringAssumptions.ts` as
specified.

It does **not** prove the model is physically right. A wrong assumption is
wrong identically on both sides, so this comparison reports a clean pass. Every
engineering constant is still a placeholder pending the adviser review in
`docs/assumptions.md` §1.

Full reasoning, measured numbers and the per-case table are in
[`docs/validation-report.md`](../docs/validation-report.md).

## Files

| File | Purpose |
|---|---|
| `export-constants.ts` | `engineeringAssumptions.ts` → `constants.json` |
| `run-ts-engine.ts` | Solves `cases.json` with the shipping engine → `ts-results.json` |
| `cases.json` | The 16-case matrix, checked in so the run is reproducible |
| `constants.json` | Shared engineering constants (**committed** — the adviser reads this) |
| `python/reference_solver.py` | Independent NumPy/SciPy solver |
| `python/compare.py` | Runs both, measures the differences, writes the report |
| `python/requirements.txt` | NumPy, SciPy |

## Why the matrix looks like it does

Agreeing on the default model proves very little. The cases are chosen around
where an implementation is most likely to go wrong:

- **1 floor** — one mode, so Rayleigh damping cannot be calibrated to modes 1
  and 2. The mass-proportional fallback has to match.
- **2 floors** — the smallest case with two modes, where the Rayleigh branch
  switches.
- **20 floors** — the largest the UI allows.
- **Damping override** — a user-set ratio must replace the material default,
  not add to it.
- **All three motion presets** — the seeded pseudo-random generator has to
  produce an identical series in two languages.
- **Near-resonance** — the largest displacements, so the hardest case to agree
  on.
- **Impulse** — free vibration decays afterwards, so any damping difference
  shows up in the tail.