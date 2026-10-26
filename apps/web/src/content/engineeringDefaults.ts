import {
  DEFAULT_BUILDING,
  DEFAULT_GROUND_MOTION,
  FRAME_TYPES,
  FRAME_TYPE_IDS,
  GEOMETRY,
  GROUND_MOTION,
  GROUND_MOTION_PRESET_IDS,
  GROUND_MOTION_PRESETS,
  INCOMPATIBLE_USES,
  LOAD_ASSUMPTIONS,
  MATERIAL_IDS,
  MATERIALS,
  OCCUPANCY_COLORS,
  OCCUPANCY_IDS,
  PLAYBACK_DEFAULTS,
  PLAYBACK_SPEEDS,
  VIEWPORT,
} from '@/config/engineeringAssumptions';
import type { EngineeringContent, OccupancyId } from './types';

/* =========================================================================
   Engineering content snapshot
   -------------------------------------------------------------------------
   Built from the same mutable config records the simulator uses, so the UI
   thread and the solver worker can be given an identical snapshot. The worker
   cannot read localStorage, which is why this has to travel with the request.
   ========================================================================= */

export function buildDefaultEngineeringContent(): EngineeringContent {
  const occupancies = {} as EngineeringContent['occupancies'];
  for (const id of OCCUPANCY_IDS) {
    const load = LOAD_ASSUMPTIONS.occupancies[id];
    const color = OCCUPANCY_COLORS[id];
    occupancies[id] = {
      label: load.label,
      liveKPa: load.liveKPa,
      description: load.description,
      colorLight: color.colorLight,
      colorDark: color.colorDark,
    };
  }

  const materials = {} as EngineeringContent['materials'];
  for (const id of MATERIAL_IDS) {
    const material = MATERIALS[id];
    materials[id] = {
      label: material.label,
      dampingRatio: material.dampingRatio,
      periodCt: material.periodCt,
      periodExponentX: material.periodExponentX,
      bareMassPerAreaKgM2: material.bareMassPerAreaKgM2,
    };
  }

  const frameTypes = {} as EngineeringContent['frameTypes'];
  for (const id of FRAME_TYPE_IDS) {
    frameTypes[id] = {
      label: FRAME_TYPES[id].label,
      stiffnessFactor: FRAME_TYPES[id].stiffnessFactor,
    };
  }

  const groundMotionPresets = {} as EngineeringContent['groundMotionPresets'];
  for (const id of GROUND_MOTION_PRESET_IDS) {
    groundMotionPresets[id] = { ...GROUND_MOTION_PRESETS[id] };
  }

  const incompatibleUses: EngineeringContent['incompatibleUses'] = {};
  for (const [occupancy, materialsForUse] of Object.entries(INCOMPATIBLE_USES)) {
    if (materialsForUse) {
      incompatibleUses[occupancy as OccupancyId] = [...materialsForUse];
    }
  }

  return {
    materials,
    frameTypes,
    occupancies,
    loadAssumptions: {
      codeBasis: LOAD_ASSUMPTIONS.codeBasis,
      gravityMs2: LOAD_ASSUMPTIONS.gravityMs2,
      defaultDeadLoadKPa: LOAD_ASSUMPTIONS.defaultDeadLoadKPa,
      liveLoadParticipation: LOAD_ASSUMPTIONS.liveLoadParticipation,
      minDeadLoadKPa: LOAD_ASSUMPTIONS.minDeadLoadKPa,
      maxDeadLoadKPa: LOAD_ASSUMPTIONS.maxDeadLoadKPa,
      minLiveLoadKPa: LOAD_ASSUMPTIONS.minLiveLoadKPa,
      maxLiveLoadKPa: LOAD_ASSUMPTIONS.maxLiveLoadKPa,
      sourceNote: LOAD_ASSUMPTIONS.sourceNote,
    },
    incompatibleUses,
    geometry: {
      minFloors: GEOMETRY.minFloors,
      maxFloors: GEOMETRY.maxFloors,
      floorHeightM: { ...GEOMETRY.floorHeightM },
      widthM: { ...GEOMETRY.widthM },
      depthM: { ...GEOMETRY.depthM },
    },
    groundMotion: {
      pgaG: { ...GROUND_MOTION.pgaG },
      frequencyHz: { ...GROUND_MOTION.frequencyHz },
      defaultSeed: GROUND_MOTION.defaultSeed,
      sampleDtS: GROUND_MOTION.sampleDtS,
      taperDurationS: GROUND_MOTION.taperDurationS,
      randomBandHz: { ...GROUND_MOTION.randomBandHz },
      impulseDurationS: GROUND_MOTION.impulseDurationS,
    },
    viewport: { ...VIEWPORT },
    playback: {
      speeds: [...PLAYBACK_SPEEDS],
      defaultSpeed: PLAYBACK_DEFAULTS.defaultSpeed,
      defaultLoop: PLAYBACK_DEFAULTS.defaultLoop,
    },
    defaultBuilding: { ...DEFAULT_BUILDING },
    defaultGroundMotion: { ...DEFAULT_GROUND_MOTION },
    groundMotionPresets,
  };
}
