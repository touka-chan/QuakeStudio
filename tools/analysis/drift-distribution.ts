/**
 * Measure where story drift actually lands, so the colour bands can be chosen
 * against real numbers instead of guessed at.
 * =========================================================================
 * WHY THIS EXISTS
 *
 * docs/assumptions.md §7a records the problem: the five drift bands split at
 * 0.10 %, 0.20 %, 0.35 % and 0.50 %, thresholds picked before the engine ran at
 * all. Now that it does, a default 5-storey concrete building at 0.3 g puts
 * every story in the top band, and the scale reads as a single colour for the
 * most common thing a student will do.
 *
 * The file says "please advise on thresholds". That is a dead end: nobody can
 * review a question with no data attached. This produces the data.
 *
 * WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * It runs the shipping `simulate()` — the same function the app calls — over
 * the template set swept across a range of shaking intensities, and reports
 * where the resulting drift ratios fall.
 *
 * It does NOT choose the thresholds. Bands are a reading decision as much as a
 * numerical one, they must never imply a verdict about a building, and the
 * wording is a separate question again. What this produces is a distribution
 * and a set of candidate scales with their consequences spelled out, for an
 * engineer to accept, reject or replace.
 *
 * NOTHING HERE CHANGES THE APP.
 *
 * Usage
 * -----
 *     npx tsx --tsconfig apps/web/tsconfig.app.json tools/analysis/drift-distribution.ts
 */

import { BUILDING_TEMPLATES, DEFAULT_TEMPLATE_ID } from '@/config/templates';
import { GROUND_MOTION, SOLVER } from '@/config/engineeringAssumptions';
import { simulate } from '@/engine/solver';
import { DRIFT_BANDS, driftBand } from '@/lib/driftScale';
import type { BuildingConfig, GroundMotionConfig } from '@/types';

/**
 * Shaking intensities to sweep.
 *
 * 0.05 g to the app's own maximum of 0.6 g. It deliberately does NOT go past
 * what the slider allows: the bands have to be chosen for the range a student
 * can actually produce, and tuning them to a range the app cannot reach would
 * be answering a question nobody asked.
 */
const PGAS = Array.from({ length: 12 }, (_, i) =>
  Number((GROUND_MOTION.pgaG.min + i * 0.05).toFixed(2)),
).filter((pga) => pga <= GROUND_MOTION.pgaG.max + 1e-9);

/* ---- run ----------------------------------------------------------------- */

interface Sample {
  template: string;
  floors: number;
  material: string;
  frame: string;
  pgaG: number;
  /** Peak interstory drift ratio across all stories, as a fraction. */
  maxDriftRatio: number;
}

function sweep(): Sample[] {
  const samples: Sample[] = [];

  for (const template of BUILDING_TEMPLATES) {
    const building: BuildingConfig = {
      ...template.building,
      id: `drift-${template.id}`,
      name: template.label,
    };

    for (const pgaG of PGAS) {
      const motion: GroundMotionConfig = {
        preset: 'harmonic',
        pgaG,
        frequencyHz: GROUND_MOTION.frequencyHz.default,
        durationS: SOLVER.defaultDurationS,
        dt: SOLVER.dtS,
        seed: undefined,
      };

      const result = simulate(building, motion);

      samples.push({
        template: template.label,
        floors: building.floors,
        material: building.material,
        frame: building.frameType,
        pgaG,
        maxDriftRatio: result.maxDriftRatio,
      });
    }
  }

  return samples;
}

/* ---- statistics ---------------------------------------------------------- */

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low]!;
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (index - low);
}

const asPercent = (fraction: number) => (fraction * 100).toFixed(3);

/* ---- candidate scales ---------------------------------------------------- */

/**
 * The scales being compared.
 *
 * `max` is the band ceiling as a fraction. The last is always Infinity so an
 * extreme case still renders into the top band instead of falling through.
 */
const CANDIDATES: Array<{ id: string; description: string; cuts: number[] }> = [
  {
    id: 'current',
    description: 'What ships today. Chosen before the engine ran.',
    cuts: [0.001, 0.002, 0.0035, 0.005],
  },
  {
    id: 'even-spread',
    description: 'Linear bands spaced to divide the observed range into five equal parts.',
    cuts: [0.005, 0.01, 0.015, 0.02],
  },
  {
    id: 'log',
    description: 'Geometric, each band about 2x the last. Log-ish data reads evenly this way.',
    cuts: [0.0025, 0.005, 0.01, 0.02],
  },
];

function bandCounts(samples: Sample[], cuts: number[]): number[] {
  const counts = new Array(cuts.length + 1).fill(0);
  for (const sample of samples) {
    let index = cuts.length;
    for (let i = 0; i < cuts.length; i += 1) {
      if (sample.maxDriftRatio < cuts[i]!) {
        index = i;
        break;
      }
    }
    counts[index] += 1;
  }
  return counts;
}

/* ---- report -------------------------------------------------------------- */

function main() {
  const defaultLabel = BUILDING_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID)?.label ?? '';
  const samples = sweep();
  const values = samples.map((s) => s.maxDriftRatio).sort((a, b) => a - b);

  console.log(
    `\n  Story drift across ${BUILDING_TEMPLATES.length} templates x ${PGAS.length} intensities`,
  );
  console.log(`  = ${samples.length} runs, all through the shipping simulate()\n`);

  console.log('  DISTRIBUTION of peak drift ratio');
  console.log(`  ${'-'.repeat(52)}`);
  console.log(`  min      ${asPercent(values[0]!)} %`);
  console.log(`  p10      ${asPercent(percentile(values, 0.1))} %`);
  console.log(`  p25      ${asPercent(percentile(values, 0.25))} %`);
  console.log(`  median   ${asPercent(percentile(values, 0.5))} %`);
  console.log(`  p75      ${asPercent(percentile(values, 0.75))} %`);
  console.log(`  p90      ${asPercent(percentile(values, 0.9))} %`);
  console.log(`  p99      ${asPercent(percentile(values, 0.99))} %`);
  console.log(`  max      ${asPercent(values[values.length - 1]!)} %`);
  console.log(
    `  ratio p90/p10  ${(percentile(values, 0.9) / percentile(values, 0.1)).toFixed(1)}x`,
  );

  /*
   * The default building, identified by id rather than by its shape.
   *
   * Filtering on `floors === 5 && material === 'concrete'` matched twice: the
   * `custom` template IS the default configuration, so the table printed every
   * intensity twice and looked like twice as much evidence as it was.
   */
  const defaultSamples = samples.filter((s) => s.template === defaultLabel);
  console.log(`\n  THE DEFAULT 5-storey concrete building (the first thing anyone sees)`);
  console.log(`  ${'-'.repeat(52)}`);
  for (const sample of defaultSamples) {
    const band = driftBand(sample.maxDriftRatio);
    console.log(
      `  ${sample.pgaG.toFixed(2)} g  ${asPercent(sample.maxDriftRatio).padStart(7)} %   -> ${band.label} (${band.token})`,
    );
  }

  console.log(`\n  HOW EACH CANDIDATE SCALE SPREADS THE ${samples.length} RUNS`);
  console.log(`  ${'-'.repeat(72)}`);

  for (const candidate of CANDIDATES) {
    const counts = bandCounts(samples, candidate.cuts);
    const parts = counts
      .map((count, i) => `${i + 1}:${count} (${((count / samples.length) * 100).toFixed(0)}%)`)
      .join('  ');

    // A scale is only doing its job if all five bands get used. Count how many
    // bands land completely empty, because that is the failure being fixed.
    const empty = counts.filter((c) => c === 0).length;

    console.log(`\n  ${candidate.id} — ${candidate.description}`);
    console.log(
      `    cuts: ${candidate.cuts.map((c) => `${asPercent(c)}%`).join(', ')}, open-ended`,
    );
    console.log(`    ${parts}`);
    console.log(`    ${empty === 0 ? 'all five bands used' : `${empty} band(s) never used`}`);
  }

  console.log(`\n  Bands as they ship: ${DRIFT_BANDS.map((b) => b.label).join(' -> ')}`);
  console.log('\n  This prints numbers. It does not change the app — see the header.\n');
}

main();
