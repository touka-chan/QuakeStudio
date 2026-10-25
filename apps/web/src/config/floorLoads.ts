import {
  INCOMPATIBLE_USES,
  LOAD_ASSUMPTIONS,
  OCCUPANCY_IDS,
  MATERIALS,
  type MaterialId,
  type Occupancy,
} from './engineeringAssumptions';

/* =========================================================================
   Floor loads — pure helpers
   -------------------------------------------------------------------------
   These are deliberately free of React and of the type module, so the engine,
   the Zod schema, the UI and the Python export can all share one definition of
   what a floor weighs.

   THE FORMULA (docs/assumptions.md §2):

       A       = width × depth                        (m²)
       W_i     = (DL_i + ψ × LL_i) × A                (kN)
       m_i     = W_i × 1000 / g                       (kg)
       ψ       = liveLoadParticipation (default 0.25)

   With a building's floor loads OFF, the occupancy formula is not used at all
   and every floor weighs its bare structure instead — see
   `bareFloorWeightKN` below for how the material supplies the mass.

   Only the load is allowed to change mass. Stiffness is calibrated from a
   reference building whose floors are all Office at the default loads, so a
   heavier floor does not make the building stronger. See buildModel().
   ========================================================================= */

/** The shape every floor-load value has, without depending on Zod. */
export type FloorLoadValue = {
  floor: number;
  occupancy: Occupancy;
  deadLoadKPa: number;
  liveLoadKPa: number;
  liveOverridden: boolean;
};

/** Live load for a use, from the single source of truth. */
export function presetLiveLoadKPa(occupancy: Occupancy): number {
  return LOAD_ASSUMPTIONS.occupancies[occupancy].liveKPa;
}

/** A fresh floor at the default dead load and the Office live load. */
export function defaultFloorLoad(floor: number): FloorLoadValue {
  return {
    floor,
    occupancy: 'office',
    deadLoadKPa: LOAD_ASSUMPTIONS.defaultDeadLoadKPa,
    liveLoadKPa: presetLiveLoadKPa('office'),
    liveOverridden: false,
  };
}

/** Number of floors with the default Office load. */
export function allOfficeFloorLoads(floors: number): FloorLoadValue[] {
  return Array.from({ length: Math.max(0, floors) }, (_, index) => defaultFloorLoad(index + 1));
}

function isOccupancy(value: unknown): value is Occupancy {
  return typeof value === 'string' && (OCCUPANCY_IDS as readonly string[]).includes(value);
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Coerce anything that arrived from outside — a template, an old saved run, an
 * imported file — into exactly `floors` well-formed floor loads.
 *
 * Rules, from the build prompt:
 *   • No loads at all → every floor is Office at the defaults (migration).
 *   • Too few → the new floors copy the nearest existing floor.
 *   • Too many → the extra floors are dropped from the top.
 *   • Values outside the allowed range are clamped rather than rejected here;
 *     the Zod schema is what reports a friendly error at the boundary.
 */
export function normalizeFloorLoads(
  floors: number,
  loads?: readonly FloorLoadValue[] | null,
): FloorLoadValue[] {
  const count = Math.max(0, Math.floor(finiteOr(floors, 0)));
  const source = Array.isArray(loads) ? loads : [];

  const normalized: FloorLoadValue[] = [];
  for (let index = 0; index < count; index++) {
    const candidate = source[index];
    // The nearest existing floor is the one below a new top floor, which is
    // the last candidate already accepted.
    const fallback = normalized[index - 1] ?? defaultFloorLoad(index + 1);

    if (!candidate || typeof candidate !== 'object') {
      normalized.push({ ...fallback, floor: index + 1 });
      continue;
    }

    const occupancy = isOccupancy(candidate.occupancy) ? candidate.occupancy : 'office';
    const liveFallback = presetLiveLoadKPa(occupancy);

    normalized.push({
      floor: index + 1,
      occupancy,
      deadLoadKPa: clamp(
        finiteOr(candidate.deadLoadKPa, LOAD_ASSUMPTIONS.defaultDeadLoadKPa),
        LOAD_ASSUMPTIONS.minDeadLoadKPa,
        LOAD_ASSUMPTIONS.maxDeadLoadKPa,
      ),
      liveLoadKPa: clamp(
        finiteOr(candidate.liveLoadKPa, liveFallback),
        LOAD_ASSUMPTIONS.minLiveLoadKPa,
        LOAD_ASSUMPTIONS.maxLiveLoadKPa,
      ),
      liveOverridden: candidate.liveOverridden === true,
    });
  }
  return normalized;
}

/** Choose a use. A preset resets the live load; Custom keeps what is typed. */
export function applyOccupancy(load: FloorLoadValue, occupancy: Occupancy): FloorLoadValue {
  if (occupancy === 'custom') {
    return { ...load, occupancy, liveOverridden: true };
  }
  return {
    ...load,
    occupancy,
    liveLoadKPa: presetLiveLoadKPa(occupancy),
    liveOverridden: false,
  };
}

/**
 * Type a live load by hand. The value stops matching a preset, so the floor is
 * marked as Custom — which is what the badge in the panel reports.
 */
export function withLiveLoad(load: FloorLoadValue, liveLoadKPa: number): FloorLoadValue {
  return {
    ...load,
    occupancy: 'custom',
    liveLoadKPa: clamp(
      liveLoadKPa,
      LOAD_ASSUMPTIONS.minLiveLoadKPa,
      LOAD_ASSUMPTIONS.maxLiveLoadKPa,
    ),
    liveOverridden: true,
  };
}

/** Dead load edit, clamped to the documented range. */
export function withDeadLoad(load: FloorLoadValue, deadLoadKPa: number): FloorLoadValue {
  return {
    ...load,
    deadLoadKPa: clamp(
      deadLoadKPa,
      LOAD_ASSUMPTIONS.minDeadLoadKPa,
      LOAD_ASSUMPTIONS.maxDeadLoadKPa,
    ),
  };
}

/** The participation fraction a building actually uses. */
export function participationFor(building: { liveLoadParticipation?: number | null }): number {
  const value = building.liveLoadParticipation;
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, 0, 1)
    : LOAD_ASSUMPTIONS.liveLoadParticipation;
}

/** DL + ψ·LL, in kPa. The number shown in the floor list. */
export function countedLoadKPa(
  deadLoadKPa: number,
  liveLoadKPa: number,
  participation: number,
): number {
  return deadLoadKPa + clamp(participation, 0, 1) * liveLoadKPa;
}

/** Floor area in m². */
export function floorAreaM2(widthM: number, depthM: number): number {
  return Math.max(0, widthM) * Math.max(0, depthM);
}

/** Earthquake weight of one floor, in kN. */
export function floorWeightKN(
  areaM2: number,
  deadLoadKPa: number,
  liveLoadKPa: number,
  participation: number,
): number {
  return countedLoadKPa(deadLoadKPa, liveLoadKPa, participation) * areaM2;
}

/** Weight in kN → mass in kg. */
export function massKgFromWeightKN(weightKN: number): number {
  return (weightKN * 1000) / LOAD_ASSUMPTIONS.gravityMs2;
}

/*
 * BARE STRUCTURE — what a floor weighs when floor loads are OFF.
 *
 * The mass cannot be zero: the eigenproblem divides by its square root, which
 * is exactly why the engine refuses a weightless floor. So "loads off" has a
 * defined meaning rather than an impossible one — the occupancy loads are not
 * counted at all, and the floor weighs what its material's bare structure
 * weighs. Those figures live on MATERIALS, and are the same placeholder
 * mass-per-area values the review checklist has tracked since before the
 * floor-loads feature existed.
 */

/** Mass of one bare floor, in kg: the material's floor mass times the area. */
export function bareFloorMassKg(areaM2: number, material: MaterialId): number {
  return MATERIALS[material].bareMassPerAreaKgM2 * Math.max(0, areaM2);
}

/** Earthquake weight of one bare floor, in kN (weight = mass × gravity). */
export function bareFloorWeightKN(areaM2: number, material: MaterialId): number {
  return (bareFloorMassKg(areaM2, material) * LOAD_ASSUMPTIONS.gravityMs2) / 1000;
}

/**
 * Materials a floor's use is flagged against, or [] when the use is expected.
 *
 * This is a review flag, not a rule the engine enforces — see
 * INCOMPATIBLE_USES for what the flag claims.
 */
export function incompatibleUsesFor(occupancy: Occupancy): readonly MaterialId[] {
  return (INCOMPATIBLE_USES as Partial<Record<Occupancy, readonly MaterialId[]>>)[occupancy] ?? [];
}

/** True when a floor's use is not expected on this building's material. */
export function needsReviewFor(occupancy: Occupancy, material: MaterialId): boolean {
  return incompatibleUsesFor(occupancy).includes(material);
}

/**
 * The mass used to calibrate story stiffness.
 *
 * This is the "reference building": same geometry, material and frame, every
 * floor Office at the DEFAULT loads, at the DEFAULT participation. It must not
 * read the user's loads or slider — otherwise adding load would change the
 * stiffness and the building would magically get stronger, which is exactly
 * what §3.2 of the build prompt forbids.
 */
export function referenceFloorMassKg(areaM2: number): number {
  const referenceWeightKN =
    countedLoadKPa(
      LOAD_ASSUMPTIONS.defaultDeadLoadKPa,
      presetLiveLoadKPa('office'),
      LOAD_ASSUMPTIONS.liveLoadParticipation,
    ) * areaM2;
  return massKgFromWeightKN(referenceWeightKN);
}
