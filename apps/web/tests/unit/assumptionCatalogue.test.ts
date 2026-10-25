import { describe, expect, it } from 'vitest';

import {
  ASSUMPTIONS,
  ASSUMPTION_GROUPS,
  assumptionsFilename,
  assumptionsMarkdown,
  placeholderCount,
} from '@/config/assumptionCatalogue';
import {
  FRAME_TYPES,
  GEOMETRY,
  LOAD_ASSUMPTIONS,
  MATERIALS,
  OCCUPANCY_IDS,
  SOLVER,
} from '@/config/engineeringAssumptions';

/* ==========================================================================
   The assumption catalogue behind the "Assumptions" page.

   The catalogue exists so that page cannot drift away from the values the
   engine actually runs on. That only holds if the catalogue really is derived
   from the config and really does cover it — which is what these tests check.
   A catalogue that quietly omits a coefficient would be worse than no page at
   all: it would read as complete.
   ========================================================================== */

describe('assumption catalogue', () => {
  it('lists every material and every coefficient that feeds the solver', () => {
    for (const id of Object.keys(MATERIALS)) {
      expect(
        ASSUMPTIONS.some((row) => row.id === `material-${id}-dampingRatio`),
        `${id} damping is missing from the catalogue`,
      ).toBe(true);
      expect(
        ASSUMPTIONS.some((row) => row.id === `material-${id}-periodCt`),
        `${id} Ct is missing from the catalogue`,
      ).toBe(true);
      expect(
        ASSUMPTIONS.some((row) => row.id === `material-${id}-periodExponentX`),
        `${id} exponent x is missing from the catalogue`,
      ).toBe(true);
    }

    // …and the value shown is the value in the config, not a copy that can go
    // stale.
    const concreteDamping = ASSUMPTIONS.find((row) => row.id === 'material-concrete-dampingRatio');
    expect(concreteDamping?.raw).toBe(MATERIALS.concrete.dampingRatio);
  });

  it('lists the floor-load model the engine actually multiplies', () => {
    const byId = new Map(ASSUMPTIONS.map((row) => [row.id, row]));

    expect(byId.get('load-default-dead')?.raw).toBe(LOAD_ASSUMPTIONS.defaultDeadLoadKPa);
    expect(byId.get('load-live-participation')?.raw).toBe(LOAD_ASSUMPTIONS.liveLoadParticipation);

    for (const occupancy of OCCUPANCY_IDS) {
      if (occupancy === 'custom') continue;
      const row = byId.get(`load-live-${occupancy}`);
      expect(row, `${occupancy} live load is missing from the catalogue`).toBeDefined();
      expect(row?.raw).toBe(LOAD_ASSUMPTIONS.occupancies[occupancy].liveKPa);
    }
  });

  it('lists every frame type at the configured stiffness', () => {
    for (const [id, frame] of Object.entries(FRAME_TYPES)) {
      const row = ASSUMPTIONS.find((entry) => entry.id === `frame-${id}-stiffnessFactor`);
      expect(row, `${id} stiffness is missing from the catalogue`).toBeDefined();
      expect(row?.raw).toBe(frame.stiffnessFactor);
    }
  });

  it('shows the geometry and solver limits the UI actually enforces', () => {
    const byId = new Map(ASSUMPTIONS.map((row) => [row.id, row]));

    expect(byId.get('geometry-min-floors')?.raw).toBe(GEOMETRY.minFloors);
    expect(byId.get('geometry-max-floors')?.raw).toBe(GEOMETRY.maxFloors);
    expect(byId.get('geometry-floor-height')?.raw).toBe(GEOMETRY.floorHeightM.default);
    expect(byId.get('solver-dt')?.raw).toBe(SOLVER.dtS);
  });

  it('gives every row a label, a value, units and a note', () => {
    for (const row of ASSUMPTIONS) {
      expect(row.label.trim(), `${row.id} needs a label`).not.toBe('');
      expect(row.value.trim(), `${row.id} needs a value`).not.toBe('');
      expect(row.units.trim(), `${row.id} needs units`).not.toBe('');
      expect(row.note.trim(), `${row.id} needs a note`).not.toBe('');
      expect(Number.isFinite(row.raw), `${row.id} raw value should be finite`).toBe(true);
    }
  });

  it('never renders NaN or Infinity into the page', () => {
    // A raw value of Infinity would render as "Infinity" in front of a user.
    for (const row of ASSUMPTIONS) {
      expect(row.value, `${row.id} rendered badly`).not.toMatch(/NaN|Infinity|undefined/i);
    }
  });

  it('accounts for every coefficient the solver reads', () => {
    /*
     * The real risk is omission: a catalogue missing a coefficient would still
     * look complete on the page, and a reviewer would trust it.
     *
     * Counts are derived from the config rather than written out, so adding a
     * material or a coefficient fails this test until the catalogue is updated
     * too — which is the point.
     */
    const materialCount = Object.keys(MATERIALS).length;
    const fieldCount = 3; // damping, Ct, exponent

    expect(ASSUMPTIONS.filter((row) => row.group === 'Materials')).toHaveLength(
      materialCount * fieldCount,
    );

    expect(ASSUMPTIONS.filter((row) => row.group === 'Frame types')).toHaveLength(
      Object.keys(FRAME_TYPES).length,
    );

    // Two shared load values (dead load and participation) plus one live-load
    // row per preset use. Custom has no preset of its own.
    const presetOccupancies = OCCUPANCY_IDS.filter((id) => id !== 'custom').length;
    expect(ASSUMPTIONS.filter((row) => row.group === 'Floor loads')).toHaveLength(
      2 + presetOccupancies,
    );

    // Every numeric material coefficient must be represented by some row, so a
    // newly added material field cannot slip through unnoticed.
    for (const material of Object.values(MATERIALS)) {
      for (const value of [material.dampingRatio, material.periodCt, material.periodExponentX]) {
        expect(
          ASSUMPTIONS.some((row) => row.raw === value),
          `no row carries the coefficient ${value}`,
        ).toBe(true);
      }
    }
  });

  it('uses unique ids, so React keys and anchors are stable', () => {
    const ids = ASSUMPTIONS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns every row to a group that is rendered', () => {
    for (const row of ASSUMPTIONS) {
      expect(ASSUMPTION_GROUPS).toContain(row.group);
    }
  });

  it('has no empty groups, which would render a bare heading', () => {
    for (const group of ASSUMPTION_GROUPS) {
      expect(
        ASSUMPTIONS.filter((row) => row.group === group).length,
        `${group} has no rows`,
      ).toBeGreaterThan(0);
    }
  });

  it('marks unresolved coefficients as needing review', () => {
    // Nothing has been signed off yet, so the page must not imply otherwise.
    expect(placeholderCount()).toBeGreaterThan(0);

    for (const id of ['material', 'frame', 'load', 'geometry', 'solver', 'motion']) {
      expect(ASSUMPTIONS.some((row) => row.id.startsWith(id))).toBe(true);
    }

    // Every material coefficient is a placeholder.
    for (const row of ASSUMPTIONS.filter((entry) => entry.id.startsWith('material-'))) {
      expect(row.placeholder, `${row.id} should await review`).toBe(true);
    }
  });

  it('separates engineering judgement from numerical method', () => {
    // β and γ are properties of the chosen integration scheme. There is nothing
    // for an engineer to confirm, so listing them as "needs review" would be
    // noise on a checklist that already has real items.
    const beta = ASSUMPTIONS.find((row) => row.id === 'solver-newmark-beta');
    const gamma = ASSUMPTIONS.find((row) => row.id === 'solver-newmark-gamma');
    expect(beta?.placeholder).toBe(false);
    expect(gamma?.placeholder).toBe(false);
  });
});

describe('assumptionsMarkdown', () => {
  const markdown = assumptionsMarkdown();

  it('leads with the fact that nothing is confirmed', () => {
    expect(markdown).toMatch(/placeholder pending review/i);
    expect(markdown).toMatch(/single source/i);
  });

  it('lists every assumption', () => {
    for (const row of ASSUMPTIONS) {
      expect(markdown, `${row.label} missing from the markdown`).toContain(row.label);
    }
  });

  it('carries the review status as a word, not just a symbol', () => {
    expect(markdown).toContain('needs review');
    expect(markdown).toContain('fixed by method');
  });

  it('reports how many values are outstanding', () => {
    expect(markdown).toContain(`${placeholderCount()} of ${ASSUMPTIONS.length}`);
  });

  it('carries no claim of structural safety', () => {
    // The export is the thing an adviser forwards. It must not read as an
    // endorsement, so it states plainly that it is not one.
    expect(markdown).not.toMatch(/safe|approved|certified|compliant/i);
  });

  it('suggests a filename ending in .md', () => {
    expect(assumptionsFilename()).toMatch(/^quakestudio-assumptions\.md$/);
  });
});
