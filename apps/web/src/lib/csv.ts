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

/** Trigger a browser download. No-op outside a DOM. */
export function downloadCsv(filename: string, contents: string): void {
  if (typeof document === 'undefined') return;

  // The BOM makes Excel read the file as UTF-8 rather than the local codepage.
  // Prepended as an escape sequence: a literal U+FEFF character in source trips
  // ESLint's no-irregular-whitespace rule.
  const BOM = '\uFEFF';
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
