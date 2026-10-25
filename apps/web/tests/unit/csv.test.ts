import { describe, expect, it } from 'vitest';

import { DEFAULT_BUILDING_CONFIG, DEFAULT_MOTION_CONFIG } from '@/config/templates';
import { LOAD_ASSUMPTIONS } from '@/config/engineeringAssumptions';
import { bareFloorWeightKN } from '@/config/floorLoads';
import { simulate } from '@/engine/solver';
import { buildCsv } from '@/lib/csv';
import type { SimulationResult } from '@/types';

/* ==========================================================================
   CSV export

   The on-screen numbers and the file must agree, and an old run must not grow
   weights it never had. These tests read the text the user downloads, not an
   intermediate object, so a formatting change cannot slip through.
   ========================================================================== */

function result(): SimulationResult {
  return simulate(DEFAULT_BUILDING_CONFIG, DEFAULT_MOTION_CONFIG);
}

function withoutWeights(value: SimulationResult): SimulationResult {
  return {
    ...value,
    floorWeightsKN: [],
    floorDeadKN: [],
    floorLiveCountedKN: [],
    totalWeightKN: 0,
    floorMassesKg: [],
  };
}

describe('CSV export', () => {
  it('writes the floor-load inputs and the recorded weights', () => {
    const csv = buildCsv(DEFAULT_BUILDING_CONFIG, DEFAULT_MOTION_CONFIG, result());

    expect(csv).toContain('# --- Floor loads ---');
    expect(csv).toContain(
      `# Live-load participation (psi),${LOAD_ASSUMPTIONS.liveLoadParticipation}`,
    );
    // A weight column only exists on a run that recorded weights.
    expect(csv).toContain(
      '# Floor,Use,Dead load (kPa),Live load (kPa),Counted live (kPa),Weight (kN),Mass (kg)',
    );
    expect(csv).toContain('# 1,Office,4.8,2.4,0.6000,');
    expect(csv).toContain('# Total weight (kN),');
    expect(csv).toContain('# Counted live share of weight (%),');
    expect(csv).not.toContain('Floor weights not recorded');
  });

  it('does not invent weights for a run saved before floor loads', () => {
    const csv = buildCsv(DEFAULT_BUILDING_CONFIG, DEFAULT_MOTION_CONFIG, withoutWeights(result()));

    expect(csv).toContain('# Floor weights not recorded in this run.');
    expect(csv).not.toContain('# Total weight (kN),');
    expect(csv).not.toContain('Weight (kN)');
    // The inputs still travel, because the migrated building does have them.
    expect(csv).toContain('# 1,Office,4.8,2.4,0.6000');
  });

  it('writes the counted share for a non-default participation', () => {
    const building = { ...DEFAULT_BUILDING_CONFIG, liveLoadParticipation: 0.5 };
    const csv = buildCsv(building, DEFAULT_MOTION_CONFIG, result());

    expect(csv).toContain('# Live-load participation (psi),0.5');
    expect(csv).toContain('# 1,Office,4.8,2.4,1.2000,');
  });

  it('marks a loads-off run as bare structure, not as occupancy loads', () => {
    const building = { ...DEFAULT_BUILDING_CONFIG, loadsEnabled: false };
    const csv = buildCsv(
      building,
      DEFAULT_MOTION_CONFIG,
      simulate(building, DEFAULT_MOTION_CONFIG),
    );

    expect(csv).toContain('# Floor loads counted,off');
    // The basis travels with the file: bare floor mass per material, the
    // concrete placeholder row of assumptions.md §5a.
    expect(csv).toContain('# Bare floor mass (kg/m2),600');
    // The use/load columns would lie about what this run counted, so the
    // bare branch writes its own, honest column set.
    expect(csv).not.toContain('# Floor,Use,Dead load (kPa)');
    expect(csv).toContain('# Floor,Bare structure weight (kN),Mass (kg)');

    // The same helper the engine used writes the expected value, so this row
    // pins the basis without re-implementing it: 600 kg/m² × 140 m² × g.
    const perFloor = bareFloorWeightKN(14 * 10, 'concrete');
    expect(csv).toContain(`# 5,600,${perFloor.toFixed(4)},`);
    expect(csv).toContain('# Total weight (kN),');
    expect(csv).toContain('# Counted live share of weight (%),0.0000');
    expect(csv).toContain('# (0% is exact while floor loads are off');
  });

  it('does not invent bare weights when a loads-off record carries none', () => {
    const building = { ...DEFAULT_BUILDING_CONFIG, loadsEnabled: false };
    const csv = buildCsv(building, DEFAULT_MOTION_CONFIG, withoutWeights(result()));

    expect(csv).toContain('# Floor weights not recorded in this run.');
    // Rows still identify the basis, with the weight cells left empty.
    expect(csv).toContain('# 5,600');
    expect(csv).not.toContain('# Total weight (kN),');
  });
});
