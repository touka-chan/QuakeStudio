import { BUILDING_TEMPLATES, DEFAULT_TEMPLATE_ID } from '@/config/templates';
import { GLOSSARY_ENTRIES } from '@/config/glossary';
import { TOUR_STEP_CONTENT } from '@/components/tutorial/tourSteps';
import { DRIFT_BAND_CONTENT } from '@/lib/driftScale';
import { BRANDING, FEATURES, TOUR_UI, WELCOME } from './branding';
import { COPY } from './copy';
import { buildDefaultEngineeringContent } from './engineeringDefaults';
import { CONTENT_SCHEMA_VERSION, type ContentDocument } from './types';

/* =========================================================================
   Default document
   -------------------------------------------------------------------------
   Built from the values the simulator would use with no saved content. Kept
   in one place so a reset, an export before the first save, and the repository
   fallback all agree.
   ========================================================================= */

export function buildDefaultContent(): ContentDocument {
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    branding: { ...BRANDING },
    copy: { ...COPY },
    engineering: buildDefaultEngineeringContent(),
    templates: BUILDING_TEMPLATES.map((template) => ({
      id: template.id,
      label: template.label,
      description: template.description,
      building: {
        floors: template.building.floors,
        floorHeightM: template.building.floorHeightM,
        widthM: template.building.widthM,
        depthM: template.building.depthM,
        material: template.building.material,
        frameType: template.building.frameType,
      },
    })),
    defaultTemplateId: DEFAULT_TEMPLATE_ID,
    glossary: GLOSSARY_ENTRIES.map((entry) => ({ ...entry })),
    tour: {
      enabled: TOUR_UI.enabled,
      buttonLabel: TOUR_UI.buttonLabel,
      buttonTooltip: TOUR_UI.buttonTooltip,
      steps: TOUR_STEP_CONTENT.map((step) => ({ ...step })),
    },
    welcome: {
      ...WELCOME,
      steps: WELCOME.steps.map((step) => ({ ...step })),
    },
    driftBands: DRIFT_BAND_CONTENT.map((band) => ({ ...band })),
    features: { ...FEATURES },
    assumptionReview: { placeholder: {}, notes: {} },
  };
}
