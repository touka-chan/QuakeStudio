# Storage layer

**Empty in Phase 0.** Implemented in Phase 4.

The MVP persists to IndexedDB. A FastAPI + PostgreSQL backend is deliberately
deferred, but the UI must not know that: define the interface now, swap the
implementation later.

```ts
export interface RunStorage {
  saveRun(record: RunRecord): Promise<RunRecord>;
  listRuns(): Promise<RunSummary[]>;
  loadRun(id: string): Promise<RunRecord | null>;
  deleteRun(id: string): Promise<void>;
  exportAll(): Promise<string>;   // JSON download
  importAll(json: string): Promise<number>; // validated with Zod
}
```

Implement `IndexedDbRunStorage` against this. Any future HTTP client implements
the same four methods, and no UI code changes.

Persistence goes through Zod validation so a hand-edited or stale import file
fails with a friendly message instead of crashing the app.