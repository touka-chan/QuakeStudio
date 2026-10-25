import {
  DEFAULT_BUILDING,
  DEFAULT_GROUND_MOTION,
  LOAD_ASSUMPTIONS,
  type FrameTypeId,
  type MaterialId,
} from './engineeringAssumptions';
import { allOfficeFloorLoads } from './floorLoads';
import type { BuildingConfig, GroundMotionConfig } from '@/types';

/* =========================================================================
   Building templates
   -------------------------------------------------------------------------
   The starting point most students pick from. `Custom` is not a template —
   it is the label shown once any field is edited by hand.

   Templates set the BUILDING only. The earthquake is chosen separately and is
   shared by both sides in comparison mode (Phase 4).

   A template deliberately does not carry floor loads. Floors start as Office
   at the default loads, and `DEFAULT_BUILDING_CONFIG` fills them in — a
   template that listed seven identical floor loads would be seven places for
   the defaults to drift.
   ========================================================================= */

/** The fields a template chooses. Loads are added from the defaults. */
type TemplateBuilding = Omit<
  BuildingConfig,
  'id' | 'name' | 'floorLoads' | 'liveLoadParticipation' | 'loadsEnabled'
>;

export type BuildingTemplate = {
  id: string;
  /** Short label for the picker. */
  label: string;
  /** One line explaining what this building is for, in plain language. */
  description: string;
  building: TemplateBuilding;
};

const template = (
  id: string,
  label: string,
  description: string,
  building: TemplateBuilding,
): BuildingTemplate => ({ id, label, description, building });

export const BUILDING_TEMPLATES: readonly BuildingTemplate[] = [
  template(
    'custom',
    'Custom',
    'Start from scratch, or edit any field on a template to leave the presets.',
    {
      floors: DEFAULT_BUILDING.floors,
      floorHeightM: DEFAULT_BUILDING.floorHeightM,
      widthM: DEFAULT_BUILDING.widthM,
      depthM: DEFAULT_BUILDING.depthM,
      material: DEFAULT_BUILDING.material,
      frameType: DEFAULT_BUILDING.frameType,
    },
  ),
  template(
    'tpl-3-concrete',
    '3-story concrete',
    'A short, stiff block. Barely moves — a good starting point.',
    {
      floors: 3,
      floorHeightM: 3.2,
      widthM: 16,
      depthM: 12,
      material: 'concrete',
      frameType: 'moment',
    },
  ),
  template(
    'tpl-5-concrete',
    '5-story concrete frame',
    'A typical small mid-rise. The default building.',
    {
      floors: 5,
      floorHeightM: 3.0,
      widthM: 14,
      depthM: 10,
      material: 'concrete',
      frameType: 'moment',
    },
  ),
  template(
    'tpl-10-steel',
    '10-story steel tower',
    'Taller and lighter. Sways more slowly and further than the concrete ones.',
    {
      floors: 10,
      floorHeightM: 3.3,
      widthM: 16,
      depthM: 14,
      material: 'steel',
      frameType: 'moment',
    },
  ),
  template(
    'tpl-8-composite-braced',
    '8-story composite, braced',
    'Same height as a steel tower, but braced, so it is much stiffer.',
    {
      floors: 8,
      floorHeightM: 3.2,
      widthM: 18,
      depthM: 16,
      material: 'composite',
      frameType: 'braced',
    },
  ),
  template(
    'tpl-4-wood',
    '4-story wood house',
    'Light and flexible. A good contrast with the concrete buildings.',
    { floors: 4, floorHeightM: 2.8, widthM: 10, depthM: 8, material: 'wood', frameType: 'moment' },
  ),
  template(
    'tpl-15-concrete',
    '15-story concrete high-rise',
    'Tall enough to move a lot. Watch the top floor drift.',
    {
      floors: 15,
      floorHeightM: 3.4,
      widthM: 20,
      depthM: 18,
      material: 'concrete',
      frameType: 'moment',
    },
  ),
] as const;

/** Id of the template the app opens with. */
export const DEFAULT_TEMPLATE_ID = 'tpl-5-concrete';

const defaultTemplate = (): BuildingTemplate => {
  const found = BUILDING_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID);
  if (!found) {
    throw new Error(`Default template "${DEFAULT_TEMPLATE_ID}" is missing from BUILDING_TEMPLATES`);
  }
  return found;
};

export const DEFAULT_BUILDING_CONFIG: BuildingConfig = (() => {
  const found = defaultTemplate();
  return {
    id: found.id,
    name: found.label,
    ...found.building,
    dampingRatio: undefined,
    floorLoads: allOfficeFloorLoads(found.building.floors),
    liveLoadParticipation: LOAD_ASSUMPTIONS.liveLoadParticipation,
    loadsEnabled: true,
  };
})();

export const DEFAULT_MOTION_CONFIG: GroundMotionConfig = {
  preset: DEFAULT_GROUND_MOTION.preset,
  pgaG: DEFAULT_GROUND_MOTION.pgaG,
  frequencyHz: DEFAULT_GROUND_MOTION.frequencyHz,
  durationS: DEFAULT_GROUND_MOTION.durationS,
  dt: DEFAULT_GROUND_MOTION.dt,
  seed: DEFAULT_GROUND_MOTION.seed,
};

export type { MaterialId, FrameTypeId };
