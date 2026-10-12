# Storage layer

Implemented in Phase 4. The MVP persists to IndexedDB, with a localStorage
fallback. A FastAPI + PostgreSQL backend is deliberately deferred, but the UI
must not know that: everything goes through `RunStorage`, so swapping the
implementation touches no component.

```ts
export interface RunStorage {
  saveRun(record: RunRecord): Promise<RunRecord>;
  listRuns(): Promise<RunSummary[]>;   // newest first
  loadRun(id: string): Promise<RunRecord | null>;
  deleteRun(id: string): Promise<void>;
  exportAll(): Promise<string>;       // one JSON document
  importAll(json: string): Promise<number>; // validated, returns the count
  readonly backendName: string;
  readonly isDegraded: boolean;
}
```

Every method is async even though the local implementations are not, precisely
so the swap stays cheap.

## Files

| File | What it is |
| --- | --- |
| `types.ts` | The interface, plus `createRunRecord` and `toSummary` |
| `idbRunStorage.ts` | IndexedDB backend — the real store |
| `localRunStorage.ts` | Fallback for private mode and locked-down browsers |
| `index.ts` | `getRunStorage()` — picks a backend once, for the app's lifetime |

## Why IndexedDB rather than localStorage

One 20-storey, 60-second run is 20 floors × 6,000 steps ≈ 120,000 displacement
values. localStorage holds roughly 5 MB in total, so a couple of runs fill it.

The raw IndexedDB API is used rather than a wrapper library. The surface needed
is small — one object store, four operations — and keeping it explicit means a
student can read exactly what is stored and how.

## The fallback is honest about losing data

`LocalRunStorage` tries to store a run untouched, and only thins it if that
overflows the quota. Thinning resamples the time series uniformly; peaks,
drift ratios and periods are carried over **exactly**, because they are maxima
over the whole record and resampling would change them.

A thinned run can still show its summary numbers but cannot replay the
animation faithfully. `isDegraded` reports this and the UI says so, rather than
quietly presenting a truncated run as a complete one.

## Two things that bite when writing IndexedDB by hand

Both are load-bearing; changing either re-introduces a bug that is very hard to
see, because the write succeeds.

**Attach `oncomplete` before awaiting the request.** A transaction auto-commits
once its last request finishes, and `await` yields to the event loop. Handlers
attached after that never fire, so the promise never settles. `withStore`
therefore attaches the commit listeners before it runs the callback.

**Wait for the transaction, not just the request.** A `put` that has fired
`onsuccess` is not yet durable. `withStore` awaits `complete` before returning.

## Moving runs between people

There is no server, so a saved run travels as a JSON file.
`lib/runJson.ts` owns that format, and validation is the load-bearing part: the
file may have been hand-edited, written by an older version, or simply be the
wrong file entirely.

- Nothing is written to storage until the **whole** document has been validated.
  A half-imported set of runs is worse than a rejected file.
- A file from a newer format version is refused rather than guessed at.
- If some runs import cleanly and others do not, the good ones are imported and
  `PartialImportError` reports what was skipped.

Two JSON quirks are worth knowing, both harmless and both locked down by
`tests/unit/storage.test.ts`:

- `undefined` does not survive serialisation, so an unset `dampingRatio` is
  simply absent after a round trip.
- JSON has no negative zero, so `-0` reloads as `0`. They compare equal
  numerically and format identically.