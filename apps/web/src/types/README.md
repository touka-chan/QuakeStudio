# Shared types & Zod schemas

**Empty in Phase 0.** Populated alongside the first consumer (Phase 1 for
`BuildingConfig` parsing of templates, Phase 4 for import validation).

Planned, per spec §6:

```ts
type BuildingConfig      // floors, dimensions, material, frameType
type GroundMotionConfig  // preset, PGA, frequency, duration, dt, seed
type SimulationResult    // time, floorDisp, peaks, drifts, periods
type RunRecord           // config snapshot + result + appVersion
```

Phase 7 reserves optional fields on `BuildingConfig` — `soilType`,
`foundationType`, `faultDistanceKm` — so site factors can be added **without
rewriting the data model**. Keep them optional and unused until approved.

`SimulationResult.floorDisp` is indexed `[floor][time]`. Both the 3D animation
and the charts read from this one array; there is no second copy.