import { describe, expect, it } from 'vitest';

import { MATERIALS, GEOMETRY, LOAD_ASSUMPTIONS } from '@/config/engineeringAssumptions';
import { allOfficeFloorLoads } from '@/config/floorLoads';
import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import {
  buildModel,
  buildRayleighDamping,
  buildStiffnessMatrix,
  fundamentalPeriodS,
  rayleighCoefficients,
  storyStiffnessForPeriod,
} from '@/engine/buildingModel';
import { symmetricEigen } from '@/engine/matrix';
import type { BuildingConfig } from '@/types';

/* ==========================================================================
   Structural model: mass, stiffness, damping and natural periods.
   --------------------------------------------------------------------------
   The checks here are the ones that would silently produce plausible-looking
   but wrong results if they broke, so each one is anchored to something
   independently derivable rather than to a previously recorded output.
   ========================================================================== */

const BASE: BuildingConfig = { ...DEFAULT_BUILDING_CONFIG };

describe('stiffness matrix', () => {
  it('is tridiagonal with -k off the diagonal', () => {
    const k = 1e6;
    const n = 5;
    const { a } = buildStiffnessMatrix(n, k);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (Math.abs(i - j) === 1) expect(a[i * n + j]!).toBe(-k);
        else if (Math.abs(i - j) > 1) expect(a[i * n + j]!).toBe(0);
      }
    }
  });

  it('resists rigid-body translation only through the base', () => {
    const n = 7;
    const k = 2.5e6;
    const { a } = buildStiffnessMatrix(n, k);

    // The base is FIXED, so translating every floor by the same amount is not
    // a free mode — the ground pushes back. That reaction shows up as a single
    // non-zero row sum at floor 1, equal to one story's stiffness.
    for (let i = 0; i < n; i++) {
      let rowSum = 0;
      for (let j = 0; j < n; j++) rowSum += a[i * n + j]!;
      if (i === 0) expect(rowSum).toBeCloseTo(k, 6);
      else expect(rowSum, `row ${i}`).toBeCloseTo(0, 6);
    }
  });

  it('gives every floor two stories except the top', () => {
    const k = 1e6;
    const n = 4;
    const { a } = buildStiffnessMatrix(n, k);
    expect(a[0 * n + 0]).toBe(2 * k); // floor 1: ground story + story to floor 2
    expect(a[1 * n + 1]).toBe(2 * k); // an interior floor
    expect(a[(n - 1) * n + (n - 1)]).toBe(k); // top floor: one story below
  });

  it('handles the single-floor case', () => {
    const { a } = buildStiffnessMatrix(1, 1e6);
    expect(a.length).toBe(1);
    expect(a[0]).toBe(1e6);
  });
});

describe('storyStiffnessForPeriod', () => {
  it('reproduces the target period through the model', () => {
    const n = 6;
    const mass = 800;
    const target = 0.9;

    const k = storyStiffnessForPeriod(mass, n, target);

    // Feed that k back through M⁻¹K and check the first eigenvalue really
    // does give T = target. This is the property the UI depends on.
    const matrix = buildStiffnessMatrix(n, k);
    const { values } = symmetricEigen({
      n,
      a: Float64Array.from(matrix.a, (value) => value / mass),
    });

    const period = (2 * Math.PI) / Math.sqrt(values[0]!);
    expect(period).toBeCloseTo(target, 8);
  });

  it('needs stiffer stories to hit the same period with more floors', () => {
    // k = m·ω₁² / (4·sin²(π/(2(2N+1)))). The sin term shrinks as N grows,
    // so holding the target period fixed means each story must be stiffer —
    // which is what stops a 15-storey tower being floppy.
    const k5 = storyStiffnessForPeriod(800, 5, 0.9);
    const k15 = storyStiffnessForPeriod(800, 15, 0.9);
    expect(k15).toBeGreaterThan(k5);
  });

  it('rejects a non-positive target period', () => {
    expect(() => storyStiffnessForPeriod(800, 5, 0)).toThrow(/positive/i);
  });
});

describe('buildModel', () => {
  it('computes floor mass from the floor loads, not the material', () => {
    const building: BuildingConfig = {
      ...BASE,
      floors: 4,
      widthM: 20,
      depthM: 10,
      material: 'concrete',
      floorLoads: allOfficeFloorLoads(4),
      liveLoadParticipation: LOAD_ASSUMPTIONS.liveLoadParticipation,
    };
    const model = buildModel(building);

    const area = 20 * 10;
    const expectedWeight =
      (LOAD_ASSUMPTIONS.defaultDeadLoadKPa +
        LOAD_ASSUMPTIONS.liveLoadParticipation * LOAD_ASSUMPTIONS.occupancies.office.liveKPa) *
      area;

    expect(model.floorWeightsKN[0]).toBeCloseTo(expectedWeight, 10);
    expect(model.floorMassKg[0]).toBeCloseTo(
      (expectedWeight * 1000) / LOAD_ASSUMPTIONS.gravityMs2,
      6,
    );
    expect(model.floorMassKg.length).toBe(4);
    expect(model.totalWeightKN).toBeCloseTo(expectedWeight * 4, 10);
    // Absent the field the schema back-fills true, so an old run reads as ON.
    expect(model.loadsEnabled).toBe(true);
  });

  it('weighs every floor by its bare structure while loads are off', () => {
    const building: BuildingConfig = {
      ...BASE,
      floors: 4,
      widthM: 20,
      depthM: 10,
      material: 'steel',
      floorLoads: allOfficeFloorLoads(4),
      liveLoadParticipation: LOAD_ASSUMPTIONS.liveLoadParticipation,
      loadsEnabled: false,
    };
    const model = buildModel(building);

    const area = 20 * 10;
    // What one bare steel floor weighs: the material's placeholder mass times
    // the area, converted to kilonewtons by g.
    const bareWeight =
      (MATERIALS.steel.bareMassPerAreaKgM2 * area * LOAD_ASSUMPTIONS.gravityMs2) / 1000;

    for (const weight of model.floorWeightsKN) {
      expect(weight).toBeCloseTo(bareWeight, 10);
    }
    // The dead/live split keeps speaking the result schema's language: all of
    // a bare floor's weight is structure, none of it is counted live.
    for (const dead of model.floorDeadKN) {
      expect(dead).toBeCloseTo(bareWeight, 10);
    }
    for (const live of model.floorLiveCountedKN) {
      expect(live).toBe(0);
    }
    expect(model.totalWeightKN).toBeCloseTo(bareWeight * 4, 10);
    expect(model.participation).toBe(LOAD_ASSUMPTIONS.liveLoadParticipation); // reported, not used
    expect(model.loadsEnabled).toBe(false);
  });

  it('ignores the load rows entirely while loads are off, and keeps K calibrated', () => {
    const common: BuildingConfig = {
      ...BASE,
      floors: 3,
      widthM: 10,
      depthM: 10,
      material: 'wood',
      liveLoadParticipation: 0.25,
      loadsEnabled: false,
      floorLoads: [
        {
          floor: 1,
          occupancy: 'storage',
          deadLoadKPa: LOAD_ASSUMPTIONS.maxDeadLoadKPa,
          liveLoadKPa: LOAD_ASSUMPTIONS.maxLiveLoadKPa,
          liveOverridden: true,
        },
        {
          floor: 2,
          occupancy: 'storage',
          deadLoadKPa: LOAD_ASSUMPTIONS.maxDeadLoadKPa,
          liveLoadKPa: LOAD_ASSUMPTIONS.maxLiveLoadKPa,
          liveOverridden: true,
        },
        {
          floor: 3,
          occupancy: 'storage',
          deadLoadKPa: LOAD_ASSUMPTIONS.maxDeadLoadKPa,
          liveLoadKPa: LOAD_ASSUMPTIONS.maxLiveLoadKPa,
          liveOverridden: true,
        },
      ],
    };
    const withHeavyRows = buildModel(common);
    const withPlainRows = buildModel({ ...common, floorLoads: allOfficeFloorLoads(3) });

    // Both floors weigh exactly what the bare wood mass dictates, so the load
    // rows make no difference — even at their maximum.
    expect(withHeavyRows.floorWeightsKN).toEqual(withPlainRows.floorWeightsKN);
    expect(withHeavyRows.floorMassKg).toEqual(withPlainRows.floorMassKg);

    // And the same switch on flips the basis back to the rows.
    const loaded = buildModel({ ...common, loadsEnabled: true });
    expect(loaded.floorWeightsKN[0]).toBeGreaterThan(withHeavyRows.floorWeightsKN[0]!);
    // Stiffness was calibrated from the reference building, not from these
    // masses, so turning loads off must not re-tune it.
    expect(loaded.storyStiffnessNm).toBeCloseTo(withHeavyRows.storyStiffnessNm, 9);
  });

  it('rejects a floor with no weight instead of producing NaN', () => {
    const building: BuildingConfig = {
      ...BASE,
      floors: 2,
      liveLoadParticipation: 0,
      floorLoads: [
        {
          floor: 1,
          occupancy: 'custom',
          deadLoadKPa: 0,
          liveLoadKPa: 2.4,
          liveOverridden: true,
        },
        {
          floor: 2,
          occupancy: 'office',
          deadLoadKPa: 4.8,
          liveLoadKPa: 2.4,
          liveOverridden: false,
        },
      ],
    };
    expect(() => buildModel(building)).toThrow(/floor 1 has no weight/i);
  });

  it('gives the same floor mass under different materials', () => {
    // Mass now comes from the loads, so material no longer contributes weight.
    // It still supplies the damping ratio, which is what actually differed
    // between materials in the old model too: the period formula uses the same
    // Ct and x for all four, and stiffness was (and is) calibrated to it.
    const concrete = buildModel({ ...BASE, material: 'concrete' });
    const steel = buildModel({ ...BASE, material: 'steel' });

    expect(concrete.floorMassKg[0]!).toBeCloseTo(steel.floorMassKg[0]!, 6);
    expect(concrete.periodsS[0]!).toBeCloseTo(steel.periodsS[0]!, 10);
    expect(concrete.dampingRatio).not.toBe(steel.dampingRatio);
  });

  it('scales stiffness with the frame type', () => {
    const moment = buildModel({ ...BASE, frameType: 'moment' });
    const braced = buildModel({ ...BASE, frameType: 'braced' });
    expect(braced.storyStiffnessNm).toBeGreaterThan(moment.storyStiffnessNm);
  });

  it('gives taller buildings a longer natural period', () => {
    const short = buildModel({ ...BASE, floors: 3 });
    const tall = buildModel({ ...BASE, floors: 15 });
    expect(tall.periodsS[0]!).toBeGreaterThan(short.periodsS[0]!);
  });

  it('reports the fundamental mode first, with the longest period', () => {
    // Mode 1 is the slowest, so it has the LONGEST period. Higher modes are
    // faster, so periods decrease as the mode number rises. `periodsS[0]` is
    // what the UI labels "1st mode", so this ordering is load-bearing.
    const model = buildModel({ ...BASE, floors: 10 });
    for (let i = 1; i < model.periodsS.length; i++) {
      expect(model.periodsS[i]!, `mode ${i + 1}`).toBeLessThan(model.periodsS[i - 1]!);
    }
  });

  it('keeps frequencies ascending alongside those periods', () => {
    const model = buildModel({ ...BASE, floors: 10 });
    for (let i = 1; i < model.omega.length; i++) {
      expect(model.omega[i]!).toBeGreaterThan(model.omega[i - 1]!);
    }
    // omega and periods must describe the same modes, in opposite order.
    for (let i = 0; i < model.omega.length; i++) {
      expect((2 * Math.PI) / model.omega[i]!).toBeCloseTo(model.periodsS[i]!, 12);
    }
  });

  it('honours a damping override', () => {
    const model = buildModel({ ...BASE, dampingRatio: 0.1 });
    expect(model.dampingRatio).toBeCloseTo(0.1, 10);
  });

  it('is deterministic', () => {
    const a = buildModel(BASE);
    const b = buildModel(BASE);
    expect(a.periodsS).toEqual(b.periodsS);
    expect(Array.from(a.stiffness.a)).toEqual(Array.from(b.stiffness.a));
  });

  it('handles the 1-floor edge case', () => {
    const model = buildModel({ ...BASE, floors: 1 });
    expect(model.floors).toBe(1);
    expect(model.periodsS).toHaveLength(1);
    expect(Number.isFinite(model.periodsS[0]!)).toBe(true);
  });

  it('handles the 20-floor maximum', () => {
    const model = buildModel({ ...BASE, floors: GEOMETRY.maxFloors });
    expect(model.floors).toBe(20);
    expect(model.periodsS.length).toBe(20);
  });

  it('reports the stiffness that produces the documented period', () => {
    // Cross-check against the standalone period formula.
    expect(fundamentalPeriodS(BASE)).toBeCloseTo(
      MATERIALS[BASE.material].periodCt *
        (BASE.floors * BASE.floorHeightM) ** MATERIALS[BASE.material].periodExponentX,
      10,
    );
  });
});

describe('Rayleigh damping', () => {
  it('gives exactly the target ratio at modes 1 and 2', () => {
    const omegas = [5, 12, 20];
    const zeta = 0.05;
    const { a0, a1 } = rayleighCoefficients(omegas, zeta, 3);

    for (const w of omegas.slice(0, 2)) {
      expect(a0 / (2 * w) + (a1 * w) / 2).toBeCloseTo(zeta, 12);
    }
  });

  it('falls back to mass-proportional damping for a single floor', () => {
    const { a0, a1 } = rayleighCoefficients([5], 0.05, 1);
    expect(a1).toBe(0);
    // With a1 = 0, ζ(ω₁) = a₀/(2ω₁).
    expect(a0 / (2 * 5)).toBeCloseTo(0.05, 12);
  });

  it('produces a symmetric positive-definite damping matrix', () => {
    const model = buildModel({ ...BASE, floors: 6 });
    const { n, a } = model.damping;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        expect(a[i * n + j]!).toBeCloseTo(a[j * n + i]!, 6);
      }
    }
    expect(a[0]!).toBeGreaterThan(0);
  });

  it('builds C = a0·M + a1·K', () => {
    const n = 3;
    const mass = new Float64Array([100, 100, 100]);
    const stiffness = buildStiffnessMatrix(n, 1000);
    const { a } = buildRayleighDamping(mass, stiffness, 0.5, 0.25, n);

    expect(a[0 * n + 0]!).toBeCloseTo(0.5 * 100 + 0.25 * stiffness.a[0]!, 10);
    expect(a[0 * n + 1]!).toBeCloseTo(0.25 * stiffness.a[1]!, 10);
  });
});

describe('energies', () => {
  it('concentrates strain energy in the bottom story for rigid translation', () => {
    // Translating every floor by the same amount stretches only the story
    // between the fixed base and floor 1. Energy = k, not zero — the base
    // does absorb the load, it just does it through one story.
    const n = 5;
    const k = 2e6;
    const { a } = buildStiffnessMatrix(n, k);
    const rigid = new Float64Array(n).fill(1);

    let energy = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) energy += rigid[i]! * a[i * n + j]! * rigid[j]!;
    }
    expect(energy).toBeCloseTo(k, 3);
  });

  it('strain energy is positive for a sheared shape', () => {
    const n = 5;
    const { a } = buildStiffnessMatrix(n, 2e6);
    const sheared = Float64Array.from({ length: n }, (_, i) => i * 0.01);

    let energy = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) energy += sheared[i]! * a[i * n + j]! * sheared[j]!;
    }
    expect(energy).toBeGreaterThan(0);
  });
});
