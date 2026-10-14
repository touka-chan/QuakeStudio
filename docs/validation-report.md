# Validation report

Generated 2026-10-14 by `python/reference/python/compare.py`. Every number below is measured, not typed in by hand — re-running the comparison regenerates this file.

> ⚠️ **This validates the software, not the engineering.** Read
> [What this does and does not prove](#what-this-does-and-does-not-prove)
> before treating any number here as an endorsement of the model.

## Verdict: PASS

The TypeScript engine and the independent Python reference agree to **6.3e-11%** at worst across 16 cases — tolerance was 1.0e-06%.

| Quantity | Worst disagreement |
|---|---|
| Natural periods (3 modes) | 2.8e-14 % |
| Peak displacement (every floor) | 1.3e-11 % |
| Story drift ratio (every story) | 6.3e-11 % |
| Max drift ratio | 7.3e-12 % |
| Roof displacement history | 2.2e-11 % (NRMSE) |
| Ground acceleration history | 1.8e-11 % (NRMSE) |
| Phase lag between histories | 0.00e+00 s |

The agreement is 15,846× tighter than the threshold, which is the expected result: two correct implementations of the same arithmetic disagree only by floating-point rounding.

## What this does and does not prove

### It does prove

The TypeScript engine implements the model described in `engineeringAssumptions.ts`. The matrix assembly, the eigenvalue solution, the Rayleigh damping calibration, the Newmark-β time integration and the synthetic ground-motion generator all behave as specified — across 1 to 20 floors, all four materials, both frame types, and all three ground-motion presets.

The reference shares the *specification* (the same constants, read from the same exported JSON file) but not the *code*: it solves the generalised eigenproblem through LAPACK instead of reducing to M⁻¹K and running a hand-written Jacobi rotation, factorises with LAPACK Cholesky instead of its own substitution, and steps time with whole-matrix NumPy expressions instead of a fused row loop.

### It does not prove

That the model is a good description of a real building. Both sides read the same coefficients, so an assumption that is wrong — a damping ratio twice what it should be — is wrong identically in both and this comparison reports a clean pass.

**Every engineering constant is still a placeholder.** They remain the subject of the adviser review in [`assumptions.md` §1](../assumptions.md#1-review-checklist); this report does not discharge any of those rows.

The drift-ratio definition is reproduced, not endorsed: it differences per-floor *peaks*, which is smaller than the peak of the instantaneous story drift. Both implementations do the same thing, so this comparison cannot detect it. Flagged in `assumptions.md` §7a.

## Tolerances, and why 5% is not the number used here

The specification names a **5%** tolerance, and it is still carried in `SOLVER.validationTolerancePct` awaiting adviser confirmation. That figure is a reasonable target for comparing a model against **a real structure** or a commercial package — real codes make different idealisations, and 5% is a sensible place to draw the line.

It is the wrong threshold for **this** comparison. Two implementations of the same linear algebra, given the same doubles, should not disagree by anything except rounding — the correct expectation is around 1e-12. Allowing 5% here would let a genuine bug sail through: a sign error in one place, or a damping term dropped entirely, can still land inside 5% on a lightly shaken model.

So this harness asserts **1.0e-06%** and reports what it actually measured. The 5% figure belongs to a different question — whether the model matches reality — which needs an adviser and, ideally, a benchmark structure.

## Method

```
engineeringAssumptions.ts
        │  npm run validate:constants
        ▼
  constants.json ──────────┐
                           │  shared: the specification
  cases.json ──────────┐   │
        │              │   │
        ▼              ▼   ▼
   TypeScript      Python reference
     engine         (NumPy / SciPy)
        │              │
        ▼              │
  ts-results.json     │
        └──────► compare.py ──► docs/validation-report.md
```

| Step | Command |
|---|---|
| Export the shared constants | `npm run validate:constants` |
| Solve every case with the shipping engine | `npm run validate:ts` |
| Solve with Python and compare | `python reference/python/compare.py` |
| All three | `npm run validate` |

Constants are shared through `constants.json` so that a disagreement cannot be blamed on a stale copy of a number. Newmark parameters: β = 0.25, γ = 0.5, dt = 0.01 s.

Comparisons are relative and symmetric — `|a − b| / max(|a|, |b|)` — so a quantity near zero does not report a meaningless percentage. The history comparisons are NRMSE: normalised by the signal's own RMS, they measure the whole time history rather than only its peaks, which is what would catch a phase error that leaves every peak unchanged.

## Per-case results

| Case | Floors | Material / frame | Motion | T₁ TS | T₁ Py | Period err | Peak err | Drift err | History NRMSE |
|---|---|---|---|---|---|---|---|---|---|
| `default-5-concrete-moment-harmonic` | 5 | concrete / moment | harmonic | 0.6284 s | 0.6284 s | 4.4e-15 % | 2.1e-14 % | 5.2e-14 % | 3.7e-14 % |
| `floors-3-composite-moment-harmonic` | 3 | composite / moment | harmonic | 0.4176 s | 0.4176 s | 3.8e-15 % | 2.6e-14 % | 3.5e-14 % | 3.6e-14 % |
| `floors-10-steel-braced-harmonic` | 10 | steel / braced | harmonic | 0.7736 s | 0.7736 s | 1.1e-14 % | 4.0e-13 % | 9.9e-13 % | 8.3e-13 % |
| `floors-15-wood-moment-harmonic` | 15 | wood / moment | harmonic | 1.5934 s | 1.5934 s | 2.8e-14 % | 5.0e-13 % | 2.1e-12 % | 1.1e-12 % |
| `floors-20-concrete-moment-harmonic` | 20 | concrete / moment | harmonic | 2.1548 s | 2.1548 s | 6.6e-15 % | 4.0e-13 % | 1.4e-12 % | 2.9e-13 % |
| `floors-1-concrete-moment-harmonic` | 1 | concrete / moment | harmonic | 0.1734 s | 0.1734 s | 9.6e-16 % | 3.3e-15 % | 2.9e-15 % | 9.1e-15 % |
| `floors-2-concrete-moment-harmonic` | 2 | concrete / moment | harmonic | 0.3019 s | 0.3019 s | 1.1e-15 % | 1.6e-14 % | 3.2e-14 % | 1.7e-14 % |
| `floors-8-concrete-damping-override` | 8 | concrete / moment | harmonic | 0.9152 s | 0.9152 s | 4.9e-15 % | 5.2e-14 % | 2.6e-13 % | 1.3e-13 % |
| `floors-6-concrete-moment-random` | 6 | concrete / moment | random | 0.7270 s | 0.7270 s | 4.0e-15 % | 5.8e-13 % | 2.0e-12 % | 2.2e-11 % |
| `floors-6-concrete-moment-impulse` | 6 | concrete / moment | impulse | 0.7270 s | 0.7270 s | 4.0e-15 % | 9.7e-15 % | 3.6e-14 % | 9.1e-14 % |
| `floors-10-concrete-moment-near-resonance` | 10 | concrete / moment | harmonic | 1.0940 s | 1.0940 s | 2.0e-15 % | 2.6e-14 % | 1.9e-13 % | 4.2e-13 % |
| `floors-4-steel-braced-impulse` | 4 | steel / braced | impulse | 0.3717 s | 0.3717 s | 1.8e-15 % | 1.3e-14 % | 1.6e-14 % | 1.6e-13 % |
| `floors-12-composite-braced-random` | 12 | composite / braced | random | 0.9189 s | 0.9189 s | 9.1e-15 % | 7.3e-12 % | 6.3e-11 % | 2.0e-11 % |
| `floors-7-wood-moment-impulse` | 7 | wood / moment | impulse | 0.7783 s | 0.7783 s | 1.4e-15 % | 2.2e-14 % | 6.6e-14 % | 2.9e-13 % |
| `floors-5-composite-moment-random` | 5 | composite / moment | random | 0.6945 s | 0.6945 s | 8.0e-16 % | 1.3e-11 % | 4.4e-11 % | 2.2e-11 % |
| `floors-9-steel-moment-harmonic-short` | 9 | steel / moment | harmonic | 1.0056 s | 1.0056 s | 3.3e-16 % | 2.1e-14 % | 5.9e-14 % | 9.8e-14 % |

Errors are percentages; `0` means the two agree to within floating-point noise.

## Why these cases

Agreeing on the default model proves very little. The matrix is built around the places where an implementation is most likely to go wrong:

- **`default-5-concrete-moment-harmonic`** — The default model. If this disagrees, everything else is suspect.
- **`floors-3-composite-moment-harmonic`** — Shortest building in the main sweep.
- **`floors-10-steel-braced-harmonic`** — Braced frame: the stiffness multiplier must apply after period calibration.
- **`floors-15-wood-moment-harmonic`** — Lightest material — the largest acceleration response.
- **`floors-20-concrete-moment-harmonic`** — The tallest building the UI allows. Longest solve, densest eigenproblem.
- **`floors-1-concrete-moment-harmonic`** — EDGE: a single floor has one mode, so Rayleigh damping cannot be calibrated to modes 1 and 2. The mass-proportional fallback must match.
- **`floors-2-concrete-moment-harmonic`** — EDGE: the smallest case with two modes, so the Rayleigh branch switches exactly here.
- **`floors-8-concrete-damping-override`** — EDGE: a user-set damping ratio must replace the material default, not add to it.
- **`floors-6-concrete-moment-random`** — EDGE: the seeded pseudo-random generator must produce the identical series in both languages.
- **`floors-6-concrete-moment-impulse`** — EDGE: a short pulse. Free vibration after it decays, so any damping difference shows up in the tail.
- **`floors-10-concrete-moment-near-resonance`** — EDGE: shaking close to the building's own frequency. Largest displacements, so the largest absolute error — the hardest case to agree on.
- **`floors-4-steel-braced-impulse`** — Stiff frame under an impulse: short period, so the timestep is most likely to be too coarse.
- **`floors-12-composite-braced-random`** — Mid-height braced composite under band-limited random motion.
- **`floors-7-wood-moment-impulse`** — Light and flexible — the combination with the largest drift ratios.
- **`floors-5-composite-moment-random`** — Another random-motion case, different geometry, to catch anything seed- or shape-specific.
- **`floors-9-steel-moment-harmonic-short`** — Short record (10 s). Checks the taper at the end of the record is handled the same way.

## Engine performance

All 16 cases solve in well under a second combined (worst single case under 10 ms). Fast enough to re-run on every parameter change, which is what makes this usable for exploration rather than a one-off check.

## What would make this stronger

1. **Replace the placeholders.** This is the only step that changes whether the tool means anything. See `assumptions.md` §1.
2. **Compare against a real structure.** Run the same model for a published benchmark building and check it against measured or peer-reviewed results. That is where the 5% tolerance belongs, and it needs the adviser to pick the benchmark.
3. **Confirm the drift definition.** Differencing per-floor peaks understates drift. The standard quantity is the peak of the instantaneous interstory drift, which is always larger. Changing it would shift every drift number the app shows.
4. **Agree the drift colour bands.** They currently do not discriminate (`assumptions.md` §7a).

---

*Regenerate with `npm run validate`. If you change an engineering constant, both implementations move together automatically — that is the point of exporting `constants.json`.*
