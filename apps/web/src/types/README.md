# Shared types & Zod schemas

Zod schemas for everything that crosses a boundary: the simulation worker, a
saved run, and an imported file. The schemas **are** the types (`z.infer`), so a
value cannot be described in one place and validated in another.

```ts
type BuildingConfig      // floors, dimensions, material, frameType
type GroundMotionConfig  // preset, PGA, frequency, duration, dt, seed
type SimulationResult    // time, floorDisp, peaks, drifts, periods
type RunRecord           // config snapshot + result + appVersion
```

Validation is load-bearing for imports rather than decorative: `lib/runJson.ts`
refuses a whole file before writing anything, because a half-imported set of
runs is worse than a rejected one. See `src/storage/README.md`.

Phase 7 reserves optional fields on `BuildingConfig` — `soilType`,
`foundationType`, `faultDistanceKm` — so site factors can be added **without
rewriting the data model**. Keep them optional and unused until approved.

`SimulationResult.floorDisp` is indexed `[floor][time]`. Both the 3D animation
and the charts read from this one array; there is no second copy.