import { APP_VERSION, runRecordSchema, type RunRecord } from '@/types';

/* =========================================================================
   Run import / export
   -------------------------------------------------------------------------
   QuakeStudio's MVP has no server, so a saved run moves between people as a
   JSON file. That makes validation the load-bearing part: a file may have been
   hand-edited, written by an older version, or simply be the wrong file
   entirely.

   Nothing is written to storage until the WHOLE document has been validated.
   A half-imported set of runs is worse than a rejected file.
   ========================================================================= */

export const EXPORT_FORMAT = 'quakestudio-runs';
/**
 * Version 2 adds floor loads to the building and weights to the result.
 *
 * Version 1 files still import: the schemas fill absent loads from the
 * all-office defaults and leave old weights empty, which the UI reads as
 * "not recorded" rather than as a zero-weight building.
 */
export const EXPORT_VERSION = 2;

export type RunBundle = {
  format: typeof EXPORT_FORMAT;
  version: number;
  /** ISO timestamp of the export. */
  exportedAt: string;
  appVersion: string;
  runs: RunRecord[];
};

/** Serialise runs into the portable bundle format. */
export function exportRunJson(runs: RunRecord[], appVersion = APP_VERSION): string {
  const bundle: RunBundle = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    runs,
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * A rejection, phrased for a student rather than a developer.
 *
 * A plain class rather than `extends Error`: the project compiles with
 * `erasableSyntaxOnly`, which forbids constructor parameter properties.
 */
export class RunImportError extends Error {
  readonly detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'RunImportError';
    this.detail = detail;
  }
}

/**
 * Parse and validate an exported bundle.
 *
 * Throws `RunImportError` with a message safe to show in the UI. On success,
 * every returned record is known to satisfy `runRecordSchema`.
 */
export function parseRunJson(json: string): RunRecord[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new RunImportError('That file is not valid JSON, so it cannot be a QuakeStudio export.');
  }

  if (typeof data !== 'object' || data === null) {
    throw new RunImportError('That file does not contain a QuakeStudio export.');
  }

  const bundle = data as Partial<RunBundle>;

  if (bundle.format !== EXPORT_FORMAT) {
    throw new RunImportError(
      'That file was not exported from QuakeStudio, so its contents cannot be trusted.',
      `Expected format "${EXPORT_FORMAT}", found "${String(bundle.format)}".`,
    );
  }

  if (typeof bundle.version !== 'number') {
    throw new RunImportError('That file does not say which QuakeStudio version wrote it.');
  }

  if (bundle.version < 1) {
    throw new RunImportError('That file does not contain a usable QuakeStudio export.');
  }

  if (bundle.version > EXPORT_VERSION) {
    throw new RunImportError(
      `That file was written by a newer version of QuakeStudio (format v${bundle.version}). Update QuakeStudio before importing it.`,
    );
  }

  if (!Array.isArray(bundle.runs)) {
    throw new RunImportError('That file does not contain a list of runs.');
  }

  if (bundle.runs.length === 0) {
    throw new RunImportError('That file contains no runs to import.');
  }

  // Validate every run before returning any of them.
  const accepted: RunRecord[] = [];
  const rejected: string[] = [];

  bundle.runs.forEach((candidate, index) => {
    const parsed = runRecordSchema.safeParse(candidate);
    if (parsed.success) {
      accepted.push(parsed.data);
      return;
    }

    const first = parsed.error.issues[0];
    rejected.push(
      `Run ${index + 1}${first ? ` (${first.path.join('.') || 'record'}: ${first.message})` : ''}`,
    );
  });

  if (accepted.length === 0) {
    throw new RunImportError(
      `None of the ${bundle.runs.length} runs in that file could be read.`,
      rejected.slice(0, 5).join('\n'),
    );
  }

  // Some runs were bad but others were fine: import what we can and say so.
  if (rejected.length > 0) {
    throw new PartialImportError(accepted, rejected);
  }

  return accepted;
}

/** Thrown when some runs import cleanly and others do not. */
export class PartialImportError extends RunImportError {
  readonly accepted: RunRecord[];
  readonly rejected: string[];

  constructor(accepted: RunRecord[], rejected: string[]) {
    super(
      `Imported ${accepted.length} of ${accepted.length + rejected.length} runs; the rest could not be read.`,
      rejected.join('\n'),
    );
    this.name = 'PartialImportError';
    this.accepted = accepted;
    this.rejected = rejected;
  }
}

/** Narrowing helper so callers can recover the good records. */
export function isPartialImport(error: unknown): error is PartialImportError {
  return error instanceof PartialImportError;
}

/** Suggest a filename for a downloaded bundle. */
export function bundleFilename(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `quakestudio-runs-${stamp}.json`;
}

/** Read a `File` as text. */
export async function readFileAsText(file: File): Promise<string> {
  return file.text();
}
