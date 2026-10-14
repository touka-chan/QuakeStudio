import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadCsv } from '@/lib/csv';
import { bundleFilename, isPartialImport, RunImportError } from '@/lib/runJson';
import { formatMm } from '@/lib/utils';
import { getRunStorage } from '@/storage';
import { createRunRecord } from '@/storage/types';
import { useConfigStore } from '@/store/configStore';
import { useCompareStore } from '@/store/compareStore';
import { APP_VERSION, type RunRecord, type RunSummary } from '@/types';

/* =========================================================================
   Saved runs
   -------------------------------------------------------------------------
   Save, load, delete, and move runs between people as JSON.

   Everything goes through the `RunStorage` interface, so swapping IndexedDB
   for an HTTP backend later touches nothing here.

   Two behaviours worth calling out:
     • Loading a run tells the user which phase it belongs to. A record saved
       by an older app version may not have the fields this one expects, and
       silently dropping those would be worse than saying so.
     • The backend name is shown, because the fallback stores thinned history.
       A user on that backend should know a saved run may replay differently.
   ========================================================================= */

const M2S_TO_MM = 1000;

type Status = { tone: 'ok' | 'warn' | 'error'; message: string } | null;

/**
 * Contents of the saved-runs dialog.
 *
 * Renders `DialogContent` only — the surrounding `Dialog` and
 * `DialogTrigger` are supplied by `TopBar`, which owns the trigger button.
 *
 * That split is not cosmetic. Radix restores focus to its `DialogTrigger` when
 * a dialog closes; with no trigger registered it has nothing to restore to,
 * so pressing Escape drops focus onto `<body>`. A keyboard user then has to
 * tab from the very top of the document again to get back where they were.
 */
export function SaveLoadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const storage = getRunStorage();

  /** Re-read the list. Used after anything that changes storage. */
  const refresh = useCallback(async () => {
    try {
      setRuns(await storage.listRuns());
    } catch (error) {
      setStatus({ tone: 'error', message: describe(error) });
    }
  }, [storage]);

  /* Read the saved runs whenever the dialog OPENS.
   *
   * This has to be an effect, not an `onOpenChange` handler: the dialog is
   * opened from a button in another component, and Radix only reports CLOSE
   * transitions through `onOpenChange`. Hooking the read there means a reopened
   * dialog shows a stale list — it looks empty even though the runs are there.
   *
   * The setState calls sit inside promise callbacks rather than the effect
   * body, which is what keeps this a read from an external system instead of a
   * cascading render. `cancelled` guards the other half of that: closing the
   * dialog mid-read must not update a tree that has already gone.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    storage
      .listRuns()
      .then((found) => {
        if (cancelled) return;
        setRuns(found);
        setStatus(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({ tone: 'error', message: describe(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [open, storage]);

  const saveCurrent = async () => {
    const { building, compareBuilding, motion, result, resultB } = useConfigStore.getState();
    if (result.time.length === 0) {
      setStatus({ tone: 'error', message: 'Run the simulation before saving it.' });
      return;
    }

    setBusy(true);
    try {
      await storage.saveRun(createRunRecord({ building, motion, result, appVersion: APP_VERSION }));

      // In comparison mode, save B alongside A so the pair reloads together.
      if (useCompareStore.getState().enabled && resultB) {
        await storage.saveRun(
          createRunRecord({
            building: compareBuilding,
            motion,
            result: resultB,
            appVersion: APP_VERSION,
            id: `${createRunRecord({ building: compareBuilding, motion, result: resultB, appVersion: APP_VERSION }).id}-b`,
          }),
        );
      }

      setStatus({
        tone: storage.isDegraded ? 'warn' : 'ok',
        message: storage.isDegraded
          ? 'Saved, but this browser had to shorten the history. Peaks and periods are exact; replay may differ.'
          : 'Saved.',
      });
      await refresh();
    } catch (error) {
      setStatus({ tone: 'error', message: describe(error) });
    } finally {
      setBusy(false);
    }
  };

  const load = async (id: string) => {
    setBusy(true);
    try {
      const record: RunRecord | null = await storage.loadRun(id);
      if (!record) {
        setStatus({ tone: 'error', message: 'That run is no longer saved.' });
        return;
      }
      applyRun(record);
      setStatus({ tone: 'ok', message: `Loaded “${record.building.name}”.` });
      onOpenChange(false);
    } catch (error) {
      setStatus({ tone: 'error', message: describe(error) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await storage.deleteRun(id);
      await refresh();
    } catch (error) {
      setStatus({ tone: 'error', message: describe(error) });
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      const json = await storage.exportAll();
      await downloadCsv(bundleFilename(), json);
      setStatus({ tone: 'ok', message: 'Exported every saved run.' });
    } catch (error) {
      setStatus({ tone: 'error', message: describe(error) });
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const count = await storage.importAll(text);
      setStatus({ tone: 'ok', message: `Imported ${count} run${count === 1 ? '' : 's'}.` });
      await refresh();
    } catch (error) {
      const resolved = statusFor(error);
      setStatus(resolved);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl" showCloseButton={false}>
      {/*
          The corner X is turned off on purpose. This dialog's footer Close is
          the bigger touch target, and two buttons both announced as "Close"
          leave a screen-reader user with no way to tell them apart. Escape and
          clicking the backdrop still close.
        */}
      <DialogHeader>
        <DialogTitle>Saved runs</DialogTitle>
        <DialogDescription>
          Runs are stored in this browser ({storage.backendName}). Export to move them to another
          machine or share them.
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="transfer">Transfer</TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveCurrent} disabled={busy}>
              Save current run
            </Button>
            <Button variant="outline" onClick={exportAll} disabled={busy || runs.length === 0}>
              <Download aria-hidden="true" />
              Export all
            </Button>
          </div>

          {runs.length === 0 ? (
            <p className="rounded-app border border-dashed border-line px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing saved yet. Build a model, run it, then save it here.
            </p>
          ) : (
            <ScrollArea className="max-h-72">
              <ul className="space-y-2 pr-3">
                {runs.map((run) => (
                  <li
                    key={run.id}
                    className="flex items-center justify-between gap-3 rounded-app border border-line p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{run.name}</p>
                      <p className="font-mono-nums text-xs text-muted-foreground">
                        {run.floors} floors · {formatMm(run.maxDisp * M2S_TO_MM)} mm ·{' '}
                        {(run.maxDriftRatio * 100).toFixed(2)} % drift ·{' '}
                        {new Date(run.createdAt).toLocaleString()}
                      </p>
                      {run.appVersion !== APP_VERSION ? (
                        <p className="text-xs text-accent-yellow-text">
                          Saved by version {run.appVersion}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" onClick={() => load(run.id)}>
                        Load
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(run.id)}
                        aria-label={`Delete ${run.name}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="transfer" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Export writes every saved run to one JSON file. Import reads that file back. Files are
            checked before anything is saved.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportAll} disabled={busy || runs.length === 0}>
              <Download aria-hidden="true" />
              Export all runs
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-app border border-line px-3 py-2 text-sm hover:bg-surface-2">
              <Upload aria-hidden="true" className="size-4" />
              Import from file
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  void importFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </TabsContent>
      </Tabs>

      {status ? (
        <p
          role="status"
          className={`rounded-app px-3 py-2 text-sm ${
            status.tone === 'error'
              ? 'bg-danger/10 text-danger'
              : status.tone === 'warn'
                ? 'bg-warning-bg text-warning-text'
                : 'bg-surface-2 text-muted-foreground'
          }`}
        >
          {status.message}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ------------------------------------------------------------------------- */

/** Put a loaded run back into the app. */
function applyRun(record: RunRecord): void {
  const config = useConfigStore.getState();
  config.setBuilding({ ...record.building, id: `${record.building.id}-loaded` });
  config.setMotion({ ...record.motion });
  // The engine is re-run from the config, so the result in the record is used
  // only for reproducibility checking, not displayed directly.
  useConfigStore.setState({ resultB: null, activeFloor: null });
  useCompareStore.getState().disable();
}

/** A friendly message for an import failure, including the partial case. */
function statusFor(error: unknown): Status {
  if (isPartialImport(error)) {
    return { tone: 'warn', message: `${error.message} ${error.detail ?? ''}`.trim() };
  }
  if (error instanceof RunImportError) {
    return { tone: 'error', message: `${error.message} ${error.detail ?? ''}`.trim() };
  }
  return { tone: 'error', message: describe(error) };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
