# Simulation engine

**Phase 2.** The production solver. Runs in a Web Worker so dragging a slider
never blocks the UI.

## Files

| File | Responsibility |
|---|---|
| `matrix.ts` | Dense linear algebra: Cholesky factorisation and solve, symmetric eigenvalues by cyclic Jacobi. |
| `buildingModel.ts` | Builds `M`, `K`, `C` from a `BuildingConfig`; derives story stiffness from the target period; reports natural periods. |
| `groundMotion.ts` | Generates `a_g(t)` for the three presets. Deterministic — same seed, same shake. |
| `solver.ts` | Newmark-β (β = ¼, γ = ½). Returns a `SimulationResult`. |
| `protocol.ts` | The typed message contract between UI and worker. Requests are **batches**. |
| `worker.ts` | The worker entry point. |
| `client.ts` | Owns the worker, debounces at 150 ms, discards stale responses. |

## Invariants — do not break these

1. **Deterministic.** Identical inputs must give bit-identical outputs. No
   randomness, no clock dependence. `solver.test.ts` asserts this directly.
2. **Units are metres and seconds throughout.** The UI converts to
   millimetres at the edge. Mixing units mid-engine hides conversion bugs.
3. **No hard-coded engineering numbers.** Everything comes from
   `@/config/engineeringAssumptions`.
4. **`floorDisp` is indexed `[floor][time]`.** The model steps through time at
   each floor and transposes on the way out. Charts and the 3D view both read
   this one array.
5. **One request solves the whole comparison.** `SolveRequest.buildings` is an
   array — one entry in single mode, two in comparison mode — and the response
   is in the same order. See below.

## Why requests are batches

Comparison mode needs two buildings under **one** ground motion, and that has to
be a single request. Two independent requests would race, and whichever lost
would leave one side showing numbers from different inputs.

Batching also does less work: the ground-motion series is generated once and
shared, which matters when the same shaking drives both sides.

## Why these choices

- **Newmark average acceleration, not Newmark linear.** It is unconditionally
  stable (a student cannot pick a `dt` that blows up) and non-dissipative (it
  will not swallow the high-frequency ringing this tool exists to show).
- **Cholesky, factored once.** `K_eff` is constant for a given model and
  timestep. Factorising per step would make the solver O(N³) per timestep and
  miss the 200 ms budget by orders of magnitude.
- **Jacobi eigenvalues, not an iterative solver.** It runs once per solve, is
  unconditionally reliable, and is short enough for a student to verify
  against the closed-form eigenvalues of a shear building — which
  `matrix.test.ts` does.
- **Dense, not sparse.** N ≤ 20. Dense is fast enough and far easier to check.

## Performance

Measured in `solver.test.ts`:

| Case | Budget |
|---|---|
| 20 floors, 60 s at `dt` = 0.01 (6,000 steps) | < 200 ms |
| 5 floors, 20 s (typical) | < 50 ms |

## Known simplifications

Linear-elastic, one direction, fixed base, no torsion, no soil interaction.
These are MVP boundaries, not oversights — see `docs/assumptions.md` §2.