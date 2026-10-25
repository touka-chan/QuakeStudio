import { describe, expect, it } from 'vitest';

import { LOAD_ASSUMPTIONS, MATERIALS, type MaterialId } from '@/config/engineeringAssumptions';
import {
  allOfficeFloorLoads,
  bareFloorMassKg,
  bareFloorWeightKN,
  incompatibleUsesFor,
  needsReviewFor,
  normalizeFloorLoads,
  presetLiveLoadKPa,
} from '@/config/floorLoads';
import { DEFAULT_BUILDING_CONFIG, DEFAULT_MOTION_CONFIG } from '@/config/templates';
import { buildModel } from '@/engine/buildingModel';
import { simulate } from '@/engine/solver';
import { buildingConfigSchema, type BuildingConfig, type FloorLoad } from '@/types';

/* ==========================================================================
   Floor loads
   --------------------------------------------------------------------------
   Every expected number here is derived from the documented formula, not from
   a recorded output:

       W_i = (DL_i + ψ·LL_i) × A        m_i = W_i × 1000 / g

   The load must change MASS ONLY. Stiffness is calibrated from a reference
   building (all Office, default participation), so the last few tests pin the
   thing that is easiest to get wrong: a heavier building must not become
   stiffer.
   ========================================================================== */

const WIDTH = 10;
const DEPTH = 14;
const AREA = WIDTH * DEPTH; // 140 m², the build prompt's worked example
const PSI = LOAD_ASSUMPTIONS.liveLoadParticipation;

function withLoads(floors: number, loads: FloorLoad[], participation = PSI): BuildingConfig {
  return {
    ...DEFAULT_BUILDING_CONFIG,
    id: 'floor-load-test',
    name: 'Floor load test',
    floors,
    widthM: WIDTH,
    depthM: DEPTH,
    floorLoads: loads,
    liveLoadParticipation: participation,
  };
}

function load(
  floor: number,
  occupancy: FloorLoad['occupancy'],
  dead = LOAD_ASSUMPTIONS.defaultDeadLoadKPa,
  live = presetLiveLoadKPa(occupancy),
  liveOverridden = false,
): FloorLoad {
  return { floor, occupancy, deadLoadKPa: dead, liveLoadKPa: live, liveOverridden };
}

describe('floor load presets', () => {
  it('matches the worked example: one office floor weighs 756 kN', () => {
    const model = buildModel(withLoads(5, allOfficeFloorLoads(5)));

    // 4.8 + 0.25 × 2.4 = 5.4 kPa; × 140 m² = 756.0 kN
    expect(model.floorWeightsKN[0]).toBeCloseTo(756.0, 10);
    expect(model.floorDeadKN[0]).toBeCloseTo(4.8 * AREA, 10);
    expect(model.floorLiveCountedKN[0]).toBeCloseTo(0.25 * 2.4 * AREA, 10);
  });

  it('matches the worked example: one residential floor weighs 738.5 kN', () => {
    const model = buildModel(withLoads(1, [load(1, 'residential')]));
    expect(model.floorWeightsKN[0]).toBeCloseTo(738.5, 10);
  });

  it('matches the worked example: one storage floor weighs 882 kN', () => {
    const model = buildModel(withLoads(1, [load(1, 'storage')]));
    expect(model.floorWeightsKN[0]).toBeCloseTo(882.0, 10);
  });

  it('gives office and parking the same live load, because both are 2.4 kPa', () => {
    // Deliberate, not a copy-paste error: both presets are 2.4 kPa in NSCP
    // Table 205-1 as summarised. The test keeps that from being "fixed"
    // silently in one place only.
    expect(presetLiveLoadKPa('office')).toBe(presetLiveLoadKPa('parking'));
  });

  it('matches the mixed five-floor example exactly', () => {
    const mixed = [
      load(1, 'parking'),
      load(2, 'storage'),
      load(3, 'office'),
      load(4, 'office'),
      load(5, 'residential'),
    ];
    const model = buildModel(withLoads(5, mixed));

    expect(model.totalWeightKN).toBeCloseTo(3888.5, 10);
    expect(model.floorWeightsKN).toEqual(expect.arrayContaining([756.0, 882.0, 738.5]));
  });

  it('is 2.87% heavier than the same building all-office', () => {
    const mixed = buildModel(
      withLoads(5, [
        load(1, 'parking'),
        load(2, 'storage'),
        load(3, 'office'),
        load(4, 'office'),
        load(5, 'residential'),
      ]),
    );
    const office = buildModel(withLoads(5, allOfficeFloorLoads(5)));
    const difference = (mixed.totalWeightKN - office.totalWeightKN) / office.totalWeightKN;

    expect(office.totalWeightKN).toBeCloseTo(3780, 10);
    expect(difference * 100).toBeCloseTo(2.87, 2);
  });

  it('counts no live load at ψ = 0 and all of it at ψ = 1', () => {
    const deadOnly = buildModel(withLoads(3, allOfficeFloorLoads(3), 0));
    const full = buildModel(withLoads(3, allOfficeFloorLoads(3), 1));

    expect(deadOnly.floorWeightsKN[0]).toBeCloseTo(4.8 * AREA, 10);
    expect(deadOnly.floorLiveCountedKN[0]).toBe(0);
    expect(full.floorWeightsKN[0]).toBeCloseTo((4.8 + 2.4) * AREA, 10);
    expect(full.floorLiveCountedKN[0]).toBeCloseTo(2.4 * AREA, 10);
  });

  it('is linear in the participation factor', () => {
    const quarter = buildModel(withLoads(2, allOfficeFloorLoads(2), 0.25));
    const half = buildModel(withLoads(2, allOfficeFloorLoads(2), 0.5));
    const dead = 4.8 * AREA;
    const live = 2.4 * AREA;

    expect(quarter.floorWeightsKN[0]).toBeCloseTo(dead + 0.25 * live, 10);
    expect(half.floorWeightsKN[0]).toBeCloseTo(dead + 0.5 * live, 10);
  });
});

describe('stiffness does not move when the loads move', () => {
  const office = buildModel(withLoads(6, allOfficeFloorLoads(6)));
  const heavy = buildModel(
    withLoads(
      6,
      allOfficeFloorLoads(6).map((floor) => ({
        ...floor,
        deadLoadKPa: 9,
        liveLoadKPa: 8,
      })),
    ),
  );

  it('keeps every entry of K identical', () => {
    expect(Array.from(heavy.stiffness.a)).toEqual(Array.from(office.stiffness.a));
    expect(heavy.storyStiffnessNm).toBe(office.storyStiffnessNm);
  });

  it('keeps the reference mass independent of the user participation', () => {
    const low = buildModel(withLoads(4, allOfficeFloorLoads(4), 0));
    const high = buildModel(withLoads(4, allOfficeFloorLoads(4), 1));
    expect(low.referenceMassKg).toBe(high.referenceMassKg);
    expect(low.storyStiffnessNm).toBe(high.storyStiffnessNm);
  });

  it('makes the building heavier, not stronger', () => {
    expect(heavy.totalWeightKN).toBeGreaterThan(office.totalWeightKN);
    expect(heavy.periodsS[0]!).toBeGreaterThan(office.periodsS[0]!);
  });
});

describe('period scaling', () => {
  it('scales every period by √s when every mass is multiplied by s', () => {
    const base = buildModel(withLoads(5, allOfficeFloorLoads(5)));
    const factor = 4;
    const scaled = buildModel(
      withLoads(
        5,
        allOfficeFloorLoads(5).map((floor) => ({
          ...floor,
          deadLoadKPa: floor.deadLoadKPa * factor,
          liveLoadKPa: floor.liveLoadKPa * factor,
        })),
      ),
    );

    const expected = Math.sqrt(factor);
    expect(scaled.periodsS.length).toBe(base.periodsS.length);
    for (let index = 0; index < base.periodsS.length; index++) {
      expect(scaled.periodsS[index]! / base.periodsS[index]!).toBeCloseTo(expected, 8);
    }
  });

  it('never shortens T₁ when one floor is made heavier', () => {
    const base = buildModel(withLoads(8, allOfficeFloorLoads(8)));
    const topHeavy = buildModel(
      withLoads(
        8,
        allOfficeFloorLoads(8).map((floor) =>
          floor.floor === 8 ? { ...floor, deadLoadKPa: 15, liveLoadKPa: 20 } : floor,
        ),
      ),
    );

    expect(topHeavy.totalWeightKN).toBeGreaterThan(base.totalWeightKN);
    expect(topHeavy.periodsS[0]!).toBeGreaterThan(base.periodsS[0]!);
  });

  it('differs between a top-heavy and a bottom-heavy building of equal weight', () => {
    // Equal total weight, different distribution. If the eigenproblem were
    // reduced as M⁻¹K (only valid for uniform mass), these would agree.
    const heavy = { deadLoadKPa: 12, liveLoadKPa: 10 };
    const top = allOfficeFloorLoads(6).map((floor) =>
      floor.floor >= 5 ? { ...floor, ...heavy } : floor,
    );
    const bottom = allOfficeFloorLoads(6).map((floor) =>
      floor.floor <= 2 ? { ...floor, ...heavy } : floor,
    );

    const topModel = buildModel(withLoads(6, top));
    const bottomModel = buildModel(withLoads(6, bottom));

    expect(topModel.totalWeightKN).toBeCloseTo(bottomModel.totalWeightKN, 8);
    expect(topModel.periodsS[0]!).not.toBeCloseTo(bottomModel.periodsS[0]!, 6);
  });
});

describe('simulation results record the loads', () => {
  it('copies the weight breakdown into the result', () => {
    const building = withLoads(4, allOfficeFloorLoads(4));
    const model = buildModel(building);
    const result = simulate(building, DEFAULT_MOTION_CONFIG);

    expect(result.floorWeightsKN).toEqual(model.floorWeightsKN);
    expect(result.floorDeadKN).toEqual(model.floorDeadKN);
    expect(result.floorLiveCountedKN).toEqual(model.floorLiveCountedKN);
    expect(result.totalWeightKN).toBeCloseTo(model.totalWeightKN, 8);
    expect(result.floorMassesKg).toEqual(Array.from(model.floorMassKg));
  });

  it('changes the response when the load changes', () => {
    const light = withLoads(5, allOfficeFloorLoads(5));
    const heavy = withLoads(
      5,
      allOfficeFloorLoads(5).map((floor) => ({ ...floor, deadLoadKPa: 10 })),
    );

    const lightResult = simulate(light, DEFAULT_MOTION_CONFIG);
    const heavyResult = simulate(heavy, DEFAULT_MOTION_CONFIG);

    expect(heavyResult.totalWeightKN).toBeGreaterThan(lightResult.totalWeightKN);
    expect(heavyResult.maxDisp).not.toBeCloseTo(lightResult.maxDisp, 12);
  });

  it('stays deterministic with non-uniform loads', () => {
    const building = withLoads(7, [
      load(1, 'parking'),
      load(2, 'storage'),
      load(3, 'office'),
      load(4, 'residential'),
      load(5, 'office'),
      load(6, 'residential'),
      load(7, 'office', 6, 3.5, true),
    ]);
    const a = simulate(building, DEFAULT_MOTION_CONFIG);
    const b = simulate(building, DEFAULT_MOTION_CONFIG);
    expect(a.floorDisp).toEqual(b.floorDisp);
  });
});

describe('normalizing floor loads', () => {
  it('fills a building with no loads from the Office default', () => {
    const loads = normalizeFloorLoads(3);
    expect(loads).toHaveLength(3);
    for (const floor of loads) {
      expect(floor.occupancy).toBe('office');
      expect(floor.deadLoadKPa).toBe(LOAD_ASSUMPTIONS.defaultDeadLoadKPa);
      expect(floor.liveLoadKPa).toBe(presetLiveLoadKPa('office'));
      expect(floor.liveOverridden).toBe(false);
    }
  });

  it('copies the nearest existing floor when floors are added', () => {
    const existing = normalizeFloorLoads(2, [load(1, 'parking'), load(2, 'storage')]);
    const grown = normalizeFloorLoads(4, existing);

    expect(grown.map((floor) => floor.occupancy)).toEqual([
      'parking',
      'storage',
      'storage',
      'storage',
    ]);
    expect(grown.map((floor) => floor.floor)).toEqual([1, 2, 3, 4]);
  });

  it('drops extra floors from the top', () => {
    const loads = normalizeFloorLoads(2, [
      load(1, 'parking'),
      load(2, 'storage'),
      load(3, 'office'),
    ]);
    expect(loads.map((floor) => floor.occupancy)).toEqual(['parking', 'storage']);
  });

  it('clamps out-of-range values instead of producing NaN', () => {
    const [floor] = normalizeFloorLoads(1, [
      {
        floor: 1,
        occupancy: 'office',
        deadLoadKPa: Number.NaN,
        liveLoadKPa: 999,
        liveOverridden: false,
      },
    ]);
    expect(floor!.deadLoadKPa).toBe(LOAD_ASSUMPTIONS.defaultDeadLoadKPa);
    expect(floor!.liveLoadKPa).toBe(LOAD_ASSUMPTIONS.maxLiveLoadKPa);
  });

  it('repairs floor numbers that do not match their position', () => {
    const loads = normalizeFloorLoads(2, [load(9, 'office'), load(9, 'storage')]);
    expect(loads.map((floor) => floor.floor)).toEqual([1, 2]);
  });
});

describe('schema migration', () => {
  it('parses a building saved before floor loads existed', () => {
    const old = {
      id: 'legacy',
      name: 'Legacy',
      floors: 5,
      floorHeightM: 3,
      widthM: 10,
      depthM: 14,
      material: 'concrete',
      frameType: 'moment',
    };

    const parsed = buildingConfigSchema.parse(old);
    expect(parsed.floorLoads).toHaveLength(5);
    expect(parsed.floorLoads.every((floor) => floor.occupancy === 'office')).toBe(true);
    expect(parsed.liveLoadParticipation).toBe(LOAD_ASSUMPTIONS.liveLoadParticipation);
  });

  it('keeps explicit loads and participation', () => {
    const parsed = buildingConfigSchema.parse({
      id: 'explicit',
      name: 'Explicit',
      floors: 2,
      floorHeightM: 3,
      widthM: 10,
      depthM: 14,
      material: 'steel',
      frameType: 'braced',
      floorLoads: [load(1, 'parking'), load(2, 'storage')],
      liveLoadParticipation: 0.5,
    });

    expect(parsed.floorLoads[1]!.occupancy).toBe('storage');
    expect(parsed.liveLoadParticipation).toBe(0.5);
  });

  it('rejects a load outside the documented range', () => {
    const parsed = buildingConfigSchema.safeParse({
      ...DEFAULT_BUILDING_CONFIG,
      floorLoads: allOfficeFloorLoads(DEFAULT_BUILDING_CONFIG.floors).map((floor, index) =>
        index === 0 ? { ...floor, liveLoadKPa: 999 } : floor,
      ),
    });
    expect(parsed.success).toBe(false);
  });
});

describe('bare structure (loads off)', () => {
  // Every figure traces to MATERIALS' bareMassPerAreaKgM2, which is a
  // PLACEHOLDER row in docs/assumptions.md §5a pending engineer review — the
  // numbers are checked here for arithmetic, not for engineering truth.
  it('converts a bare floor mass to weight through g', () => {
    for (const [id, material] of Object.entries(MATERIALS)) {
      const massKg = material.bareMassPerAreaKgM2 * AREA;
      const weightKN = bareFloorWeightKN(AREA, id as MaterialId);
      expect(weightKN).toBeCloseTo((massKg * LOAD_ASSUMPTIONS.gravityMs2) / 1000, 10);
      expect(bareFloorMassKg(AREA, id as MaterialId)).toBeCloseTo(massKg, 8);
    }
  });

  it('scales with area and never goes negative', () => {
    expect(bareFloorWeightKN(0, 'concrete')).toBe(0);
    expect(bareFloorWeightKN(-3, 'steel')).toBe(0);
    expect(bareFloorWeightKN(AREA, 'composite')).toBeCloseTo(
      (MATERIALS.composite.bareMassPerAreaKgM2 * AREA * LOAD_ASSUMPTIONS.gravityMs2) / 1000,
      10,
    );
  });

  it('flags exactly the wood pairs the assumptions document lists', () => {
    expect(needsReviewFor('parking', 'wood')).toBe(true);
    expect(needsReviewFor('storage', 'wood')).toBe(true);
    // The flag is scoped to the flagged material, so nothing else is marked.
    expect(needsReviewFor('parking', 'concrete')).toBe(false);
    expect(needsReviewFor('parking', 'steel')).toBe(false);
    expect(needsReviewFor('parking', 'composite')).toBe(false);
    expect(needsReviewFor('office', 'wood')).toBe(false);
    expect(needsReviewFor('residential', 'wood')).toBe(false);
    expect(needsReviewFor('custom', 'wood')).toBe(false);
    expect(incompatibleUsesFor('parking')).toEqual(['wood']);
    expect(incompatibleUsesFor('office')).toEqual([]);
  });
});
