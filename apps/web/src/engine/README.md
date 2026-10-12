# QuakeStudio — simulation engine

**Empty in Phase 0.** Populated in Phase 2.

Planned modules, per the build spec:

| File | Purpose | Phase |
|---|---|---|
| `buildingModel.ts` | Builds `M`, `K`, `C` from a `BuildingConfig` + assumptions. Derives story stiffness from the target fundamental period. | 2 |
| `groundMotion.ts` | Generates `a_g(t)` for the harmonic / random / impulse presets. Deterministic for a given seed. | 2 |
| `solver.ts` | Newmark-β, average acceleration (β=1/4, γ=1/2). Returns the `SimulationResult`. | 2 |
| `worker.ts` | Web Worker wrapper so solving never blocks the UI thread. | 2 |

Hard requirements for whatever lands here:

- **Deterministic** — identical inputs must give identical outputs, every time.
- **No hard-coded engineering numbers** — import from `@/config/engineeringAssumptions`.
- **Unit-tested** — matrices, natural periods, edge cases (1 floor, 20 floors).