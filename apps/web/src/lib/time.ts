/* =========================================================================
   Time helpers
   -------------------------------------------------------------------------
   Small, shared, and free of React. The playback clock, the 3D view and the
   charts all need the same answers to "where are we, and how far through are
   we", and they must agree exactly — a cursor that disagrees with the
   animation is the classic way this tool would mislead a student.
   ========================================================================= */

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function clampTime(time: number, durationS: number): number {
  if (Number.isNaN(time)) return 0;
  if (time < 0) return 0;
  return time > durationS ? durationS : time;
}

/**
 * Displacement at a floor for a given time, LINEARLY INTERPOLATED between
 * samples.
 *
 * Nearest-sample lookup makes the building visibly step at the timestep
 * (a 10 mm jump every 0.01 s). Interpolating is what makes the sway look
 * continuous. The engine works at dt = 0.01 s, so this matters.
 */
export function sampleDisplacement(
  floorDisp: number[][],
  time: number[],
  floorIndex: number,
  timeS: number,
): number {
  const series = floorDisp[floorIndex];
  if (!series || series.length === 0 || time.length === 0) return 0;

  const last = time.length - 1;
  if (timeS <= time[0]!) return series[0] ?? 0;
  if (timeS >= time[last]!) return series[last] ?? 0;

  // Binary search for the interval containing timeS.
  let low = 0;
  let high = last;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (time[mid]! <= timeS) low = mid;
    else high = mid;
  }

  const t0 = time[low]!;
  const t1 = time[high]!;
  const span = t1 - t0;
  if (span <= 0) return series[low] ?? 0;

  const fraction = (timeS - t0) / span;
  const a = series[low] ?? 0;
  const b = series[high] ?? 0;
  return a + (b - a) * fraction;
}
