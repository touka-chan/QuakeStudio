# Zustand stores

**Empty in Phase 0.**

| Store | Holds | Phase |
|---|---|---|
| `configStore` | The active `BuildingConfig` + `GroundMotionConfig` (and A/B copies in compare mode). | 2 |
| `resultStore` | Latest `SimulationResult` per config, plus worker status ("Updating…"). | 2 |
| `playbackStore` | Current playback time, play/pause, speed, loop, motion exaggeration. | 3 |

The playback store drives **both** the 3D animation and the chart cursor from the
same displacement arrays. Phase 3 must keep that a single source of truth.