import { Capacitor } from '@capacitor/core';

import { APP_VERSION } from '@/types';
import { formatMm, formatPct } from '@/lib/utils';
import type { BuildingConfig, GroundMotionConfig, SimulationResult } from '@/types';

/* =========================================================================
   CSV export
   -------------------------------------------------------------------------
   The spec is explicit: "exported CSV matches the on-screen numbers". The way
   to guarantee that is not to re-derive anything — write the SAME
   `SimulationResult` the charts read, in the SAME units the UI shows.

   Units, stated in the header block so a file opened in a spreadsheet ten
   weeks later is not ambiguous:
     • displacement and drift: MILLIMETRES and PERCENT (what the UI shows)
     • ground acceleration: m/s² (the engine's native unit)
     • the raw values the engine produced are metres and fractions

   Values are written at full precision. Rounding to what the UI displays
   would make the file disagree with the screen for no benefit.
   ========================================================================= */

/** Build the CSV text. Separated from downloading so it can be unit tested. */
export function buildCsv(
  building: BuildingConfig,
  motion: GroundMotionConfig,
  result: SimulationResult,
): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  // ---- Header block ------------------------------------------------------
  lines.push('# QuakeStudio simulation export');
  lines.push(
    '# Educational simulation using simplified assumptions. Not a structural safety assessment.',
  );
  lines.push(`# Exported,${now}`);
  lines.push(`# QuakeStudio version,${APP_VERSION}`);
  lines.push('#');
  lines.push('# --- Building ---');
  lines.push(`# Name,${csvEscape(building.name)}`);
  lines.push(`# Floors,${building.floors}`);
  lines.push(`# Floor height (m),${building.floorHeightM}`);
  lines.push(`# Width (m),${building.widthM}`);
  lines.push(`# Depth (m),${building.depthM}`);
  lines.push(`# Material,${building.material}`);
  lines.push(`# Frame type,${building.frameType}`);
  lines.push('#');
  lines.push('# --- Earthquake ---');
  lines.push(`# Preset,${motion.preset}`);
  lines.push(`# Peak ground acceleration (g),${motion.pgaG}`);
  if (motion.frequencyHz !== undefined) {
    lines.push(`# Frequency (Hz),${motion.frequencyHz}`);
  }
  if (motion.seed !== undefined) lines.push(`# Seed,${motion.seed}`);
  lines.push(`# Duration (s),${motion.durationS}`);
  lines.push(`# Time step (s),${motion.dt}`);
  lines.push('#');
  lines.push('# --- Results ---');
  // Full precision first, then the value exactly as the metric card renders
  // it. The brief asks that the CSV "matches the on-screen numbers" — writing
  // both makes that literally checkable, while the full-precision figure is
  // what someone actually wants to analyse.
  lines.push(`# Peak displacement (mm),${(result.maxDisp * 1000).toFixed(4)}`);
  lines.push(`# Peak displacement as shown on screen (mm),${formatMm(result.maxDisp * 1000)}`);
  lines.push(
    `# Max interstory drift ratio as shown on screen (%),${formatPct(result.maxDriftRatio * 100)}`,
  );
  lines.push(`# Max interstory drift ratio (%),${(result.maxDriftRatio * 100).toFixed(4)}`);
  lines.push(`# Natural periods (s),${result.periodsS.map((p) => p.toFixed(4)).join(' ')}`);
  lines.push('#');
  lines.push('# Displacement columns are in MILLIMETRES, relative to the ground.');
  lines.push('# Drift columns are PERCENT of floor height.');
  lines.push('# Ground acceleration is in m/s^2 (engine native unit).');
  lines.push('');

  // ---- Data block --------------------------------------------------------
  const header = ['time_s'];
  for (let floor = 1; floor <= building.floors; floor++) {
    header.push(`floor_${floor}_disp_mm`);
  }
  for (let floor = 1; floor <= building.floors; floor++) {
    header.push(`floor_${floor}_drift_pct`);
  }
  header.push('ground_accel_ms2');
  lines.push(header.join(','));

  const { time, floorDisp, groundAccel } = result;

  for (let step = 0; step < time.length; step++) {
    const row: string[] = [time[step]!.toFixed(2)];
    for (let floor = 0; floor < building.floors; floor++) {
      row.push(((floorDisp[floor]?.[step] ?? 0) * 1000).toFixed(6));
    }
    for (const drift of result.driftRatio) {
      row.push((drift * 100).toFixed(6));
    }
    row.push((groundAccel[step] ?? 0).toFixed(6));
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/**
 * Trigger a download.
 *
 * ── WHY THIS IS NOT JUST an <a download> ──────────────────────────────────
 * On the web that is all it takes. Inside an Android WebView it is not:
 * `URL.createObjectURL` plus a synthetic anchor click is SILENTLY IGNORED,
 * because the WebView has no download listener registered. No file appears, no
 * error is thrown, and nothing is logged. Verified on a realme running
 * Android 11 — the button appears to work and produces nothing at all.
 *
 * That is the worst possible failure mode for this button: CSV export is how a
 * student gets simulation data into a report, so "no error, no file" looks
 * exactly like success until the moment they go to submit.
 *
 * So on a native platform the bytes go to the filesystem and the system share
 * sheet opens instead. On the web, nothing changes.
 *
 * The BOM makes Excel read the file as UTF-8 rather than the local codepage.
 * Prepended as an escape sequence: a literal U+FEFF character in source trips
 * ESLint's no-irregular-whitespace rule.
 */
export async function downloadCsv(filename: string, contents: string): Promise<void> {
  const BOM = '\uFEFF';

  if (Capacitor.isNativePlatform()) {
    await shareCsv(filename, BOM + contents);
    return;
  }

  if (typeof document === 'undefined') return;

  const blob = new Blob([BOM + contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

/**
 * Native export: write the file, then offer it.
 *
 * Both plugins are imported dynamically. A static import would pull native
 * code into the web build for a path that only ever runs on a phone, and the
 * entry chunk has a deliberate budget.
 */
async function shareCsv(filename: string, contents: string): Promise<void> {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    await Filesystem.writeFile({
      path: filename,
      data: contents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });

    /*
     * The share SHEET rather than a silent save to a fixed folder: on a phone
     * "where did that file go" is a question with no good answer, whereas Drive,
     * email or a cable are all one tap away and a visible choice.
     */
    await Share.share({ title: filename, url: uri });
  } catch (error) {
    console.error('CSV export failed:', error);
    throw new Error(
      'Could not export the CSV. The file could not be written on this device.',
    );
  }
}

/** Filesystem-safe name, e.g. `quakestudio-5-story-concrete-frame.csv`. */
export function csvFilename(building: BuildingConfig): string {
  const slug = building.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `quakestudio-${slug || 'simulation'}.csv`;
}

/** Quote a value if it contains a comma, quote or newline. */
function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
