import { GROUND_MOTION, GRAVITY_MS2 } from '@/config/engineeringAssumptions';
import type { GroundMotionConfig } from '@/types';

/* =========================================================================
   Synthetic ground motion
   -------------------------------------------------------------------------
   Three presets, all generated rather than recorded. That keeps the project
   free of licensing questions, and every run is reproducible: the random
   preset is driven by a fixed seed, so the same seed always returns the same
   shake. That reproducibility is what makes Phase 5's comparison against the
   Python reference solver meaningful.

   Real recorded accelerograms can be imported later; the presets exist so the
   MVP is self-contained.
   ========================================================================= */

/** Ground acceleration samples in m/s², one per timestep. */
export type GroundMotionSeries = {
  /** Sample times in seconds. */
  time: number[];
  /** Acceleration in m/s². */
  accel: number[];
  /** Largest |acceleration| actually produced, in g. Useful for the UI. */
  achievedPgaG: number;
};

export function generateGroundMotion(motion: GroundMotionConfig): GroundMotionSeries {
  const dt = motion.dt;
  const steps = Math.max(2, Math.round(motion.durationS / dt) + 1);

  const time: number[] = [];
  const raw: number[] = [];

  for (let step = 0; step < steps; step++) {
    const t = step * dt;
    time.push(t);
    raw.push(sampleAt(t, motion));
  }

  // Scale so the largest sample equals the requested PGA exactly. Doing this
  // after generation rather than analytically means every preset honours the
  // user's strength setting identically.
  const peak = raw.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const scale = peak > 0 ? (motion.pgaG * GRAVITY_MS2) / peak : 0;
  const accel = raw.map((value) => value * scale);

  const achievedPgaG =
    accel.reduce((max, value) => Math.max(max, Math.abs(value)), 0) / GRAVITY_MS2;

  return { time, accel, achievedPgaG };
}

/* ------------------------------------------------------------------ presets */

/** Unit-amplitude waveform for the chosen preset, before PGA scaling. */
function sampleAt(t: number, motion: GroundMotionConfig): number {
  switch (motion.preset) {
    case 'harmonic':
      return harmonic(t, motion);
    case 'random':
      return random(t, motion);
    case 'impulse':
      return impulse(t);
  }
}

function harmonic(t: number, motion: GroundMotionConfig): number {
  const f = motion.frequencyHz ?? GROUND_MOTION.frequencyHz.default;
  const taper = GROUND_MOTION.taperDurationS;

  // Taper in and out so the record starts and ends at rest. Without this the
  // building gets an artificial impulse at t=0 and at the end.
  const ramp = Math.min(1, t / taper, (motion.durationS - t) / taper);
  const envelope = ramp <= 0 ? 0 : Math.sin((Math.PI / 2) * ramp);

  return envelope * Math.sin(2 * Math.PI * f * t);
}

function random(t: number, motion: GroundMotionConfig): number {
  const { low, high } = GROUND_MOTION.randomBandHz;
  const seed = motion.seed ?? GROUND_MOTION.defaultSeed;
  const { durationS } = motion;

  // Sum a fixed set of in-band sinusoids at frequencies derived from the seed.
  // This is white-ish noise band-limited to [low, high] — simple, deterministic
  // and cheap enough to regenerate on every slider drag.
  let value = 0;
  for (let k = 1; k <= RANDOM_HARMONICS; k++) {
    const u = pseudoRandom(seed + k * 7919);
    const frequency = low + (high - low) * u;
    const phase = 2 * Math.PI * pseudoRandom(seed + k * 104729);
    const amplitude = 1 / k; // weight low frequencies more, like real records
    value += amplitude * Math.sin(2 * Math.PI * frequency * t + phase);
  }

  const ramp = Math.min(1, t / 0.5, (durationS - t) / 0.5);
  return value * (ramp <= 0 ? 0 : Math.sin((Math.PI / 2) * ramp));
}

function impulse(t: number): number {
  const duration = GROUND_MOTION.impulseDurationS;
  if (t > duration) return 0;

  // A half-sine pulse: zero at both ends, so it transfers momentum without the
  // discontinuity a raw spike would introduce. A short lead keeps the pulse
  // clear of the very first sample.
  const lead = 0.2 * duration;
  if (t < lead) return 0;
  return Math.sin(((t - lead) / (duration - lead)) * Math.PI);
}

/* ------------------------------------------------------------------- noise */

const RANDOM_HARMONICS = 12;

/**
 * Deterministic pseudo-random value in [0, 1) from an integer seed.
 *
 * Math.sin-based hashing: short, stable across engines, and good enough for
 * choosing which frequencies a synthetic record contains. NOT suitable for
 * anything that needs statistical quality.
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The dominant frequency of a generated record, for display.
 *
 * Found by picking the largest FFT-like bin via a coarse search, which is
 * plenty for "about what frequency is this" in the UI.
 */
export function dominantFrequencyHz(
  series: GroundMotionSeries,
  maxHz = GROUND_MOTION.frequencyHz.max,
): number {
  const { time, accel } = series;
  if (accel.length < 2) return 0;

  const duration = time[time.length - 1]!;

  let bestHz = 0;
  let bestPower = -Infinity;

  for (let hz = 0.2; hz <= maxHz; hz += 0.05) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < accel.length; i++) {
      const angle = 2 * Math.PI * hz * time[i]!;
      re += accel[i]! * Math.cos(angle);
      im += accel[i]! * Math.sin(angle);
    }
    const power = re * re + im * im;
    if (power > bestPower) {
      bestPower = power;
      bestHz = hz;
    }
  }
  return duration > 0 ? bestHz : 0;
}
