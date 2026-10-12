# Zustand stores

| Store | Holds |
|---|---|
| `configStore` | Building **A**, the comparison building **B**, the ground motion, and **both** results. |
| `compareStore` | Comparison **view** state only: on/off, side-by-side vs ghost, which side the controls edit. |
| `playbackStore` | Current playback time, play/pause, speed, loop, motion exaggeration. |

The playback store drives **both** the 3D animation and the chart cursor from the
same displacement arrays. That is a single source of truth and must stay one.

## Why `configStore` holds both buildings

It would be tidier to give B its own store. It would also be wrong.

Comparison mode requires the two sides to be solved from **one** worker request
under **one** ground motion. If A and B were solved by two independent requests,
they would race: drag a slider on A and B would be left showing numbers from a
different input. That is precisely the quiet wrongness this tool must never have.

So `configStore` owns both buildings and both results, and `compareStore` reads
B from there rather than duplicating it. `compareStore` exists only to hold
things that are genuinely presentation: which view, which side.

## The rule that keeps comparison honest

> The earthquake is shared. Any difference in the response comes from the
> buildings alone.

`configStore.motion` is the only motion. There is no per-building override, and
the results table states the shared PGA and duration in a caption so a reader
can see it.

## Solving

Every mutator calls `resolve()`, which batches:

```ts
const batch = compareBuilding ? [building, compareBuilding] : [building];
solver.request(batch, motion);
```

`resolveNow()` is the escape hatch for when compare mode changes rather than a
config value — it skips the 150 ms debounce, because the user just clicked a
button and is waiting.

`EMPTY_RESULT` must stay **above** the store, not inside it. The solver client
is created at module scope and its callback references the store, so a store
defined first would be in its temporal dead zone when that callback first fires.