/* =========================================================================
   Content model
   -------------------------------------------------------------------------
   Every user-facing value the demo administrator can manage lives in one
   serialisable document. This file deliberately imports nothing from the
   simulator: config modules hydrate from this document, and the admin
   repository writes it, so keeping the shape independent prevents a cycle.

   IDs for materials, frame types and floor uses are FIXED. They are tied to
   the solver, CSS tokens and the 3D scene, so the admin can edit their labels
   and values but cannot add or remove them.
   ========================================================================= */

export const MATERIAL_IDS = ['concrete', 'steel', 'composite', 'wood'] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

export const FRAME_TYPE_IDS = ['moment', 'braced'] as const;
export type FrameTypeId = (typeof FRAME_TYPE_IDS)[number];

export const OCCUPANCY_IDS = ['office', 'residential', 'parking', 'storage', 'custom'] as const;
export type OccupancyId = (typeof OCCUPANCY_IDS)[number];

export const GROUND_MOTION_PRESET_IDS = ['harmonic', 'random', 'impulse'] as const;
export type GroundMotionPresetId = (typeof GROUND_MOTION_PRESET_IDS)[number];

export const CONTENT_SCHEMA_VERSION = 1;
export const CONTENT_STORAGE_KEY = 'quakestudio.content.v1';
export const CONTENT_UPDATED_EVENT = 'quakestudio:content-updated';

export type PlaybackSpeed = number;

export const LOGO_ICONS = ['building', 'waves', 'layers', 'activity'] as const;
export type LogoIcon = (typeof LOGO_ICONS)[number];

export const TOUR_ICONS = ['building', 'layers', 'play', 'waves', 'compare'] as const;
export type TourIcon = (typeof TOUR_ICONS)[number];

export const TOUR_TARGETS = ['controls', 'loads', 'play', 'results', 'compare'] as const;
export type TourTarget = (typeof TOUR_TARGETS)[number];

export const WELCOME_ICONS = ['play', 'waves', 'compare'] as const;
export type WelcomeIcon = (typeof WELCOME_ICONS)[number];

export type RangeContent = {
  min: number;
  max: number;
  step: number;
  default: number;
};

export type MaterialContent = {
  label: string;
  dampingRatio: number;
  periodCt: number;
  periodExponentX: number;
  bareMassPerAreaKgM2: number;
};

export type FrameTypeContent = {
  label: string;
  stiffnessFactor: number;
};

export type OccupancyContent = {
  label: string;
  liveKPa: number;
  description: string;
  colorLight: string;
  colorDark: string;
};

export type LoadAssumptionsContent = {
  codeBasis: string;
  gravityMs2: number;
  defaultDeadLoadKPa: number;
  liveLoadParticipation: number;
  minDeadLoadKPa: number;
  maxDeadLoadKPa: number;
  minLiveLoadKPa: number;
  maxLiveLoadKPa: number;
  sourceNote: string;
};

export type GeometryContent = {
  minFloors: number;
  maxFloors: number;
  floorHeightM: RangeContent;
  widthM: RangeContent;
  depthM: RangeContent;
};

export type GroundMotionContent = {
  pgaG: RangeContent;
  frequencyHz: RangeContent;
  defaultSeed: number;
  sampleDtS: number;
  taperDurationS: number;
  randomBandHz: { low: number; high: number };
  impulseDurationS: number;
};

export type ViewportContent = {
  defaultExaggeration: number;
  minExaggeration: number;
  maxExaggeration: number;
  exaggerationStep: number;
  defaultGridDivisions: number;
  groundThicknessM: number;
};

export type PlaybackContent = {
  speeds: number[];
  defaultSpeed: number;
  defaultLoop: boolean;
};

export type DefaultBuildingContent = {
  id: string;
  name: string;
  floors: number;
  floorHeightM: number;
  widthM: number;
  depthM: number;
  material: MaterialId;
  frameType: FrameTypeId;
};

export type DefaultGroundMotionContent = {
  preset: GroundMotionPresetId;
  pgaG: number;
  frequencyHz: number;
  durationS: number;
  dt: number;
  seed: number;
};

export type GroundMotionPresetContent = {
  label: string;
  description: string;
};

export type EngineeringContent = {
  materials: Record<MaterialId, MaterialContent>;
  frameTypes: Record<FrameTypeId, FrameTypeContent>;
  occupancies: Record<OccupancyId, OccupancyContent>;
  loadAssumptions: LoadAssumptionsContent;
  incompatibleUses: Partial<Record<OccupancyId, MaterialId[]>>;
  geometry: GeometryContent;
  groundMotion: GroundMotionContent;
  viewport: ViewportContent;
  playback: PlaybackContent;
  defaultBuilding: DefaultBuildingContent;
  defaultGroundMotion: DefaultGroundMotionContent;
  groundMotionPresets: Record<GroundMotionPresetId, GroundMotionPresetContent>;
};

export type TemplateBuildingContent = {
  floors: number;
  floorHeightM: number;
  widthM: number;
  depthM: number;
  material: MaterialId;
  frameType: FrameTypeId;
};

export type TemplateContent = {
  id: string;
  label: string;
  description: string;
  building: TemplateBuildingContent;
};

export type GlossaryEntryContent = {
  id: string;
  term: string;
  definition: string;
};

export type TourStepContent = {
  id: string;
  target: TourTarget;
  title: string;
  body: string;
  icon: TourIcon;
};

export type TourContent = {
  enabled: boolean;
  buttonLabel: string;
  buttonTooltip: string;
  steps: TourStepContent[];
};

export type WelcomeStepContent = {
  id: string;
  icon: WelcomeIcon;
  title: string;
  body: string;
};

export type WelcomeContent = {
  enabled: boolean;
  title: string;
  description: string;
  acknowledgement: string;
  assumptionsLabel: string;
  startLabel: string;
  footer: string;
  steps: WelcomeStepContent[];
};

export type BrandingContent = {
  appName: string;
  documentTitle: string;
  metaDescription: string;
  logoIcon: LogoIcon;
  disclaimerShort: string;
  disclaimerLong: string;
};

export type CopyContent = Record<string, string>;

export type DriftBandContent = {
  id: string;
  /** null on the final, open-ended band. */
  max: number | null;
  label: string;
  note: string;
  colorLight: string;
  colorDark: string;
};

export type FeatureContent = {
  compareEnabled: boolean;
  maxBuildings: number;
  maxSideBySide: number;
  feedbackEnabled: boolean;
  installPromptEnabled: boolean;
  savedRunsEnabled: boolean;
  csvExportEnabled: boolean;
  welcomeEnabled: boolean;
  tourEnabled: boolean;
  defaultCutaway: boolean;
  defaultCompareView: 'sideBySide' | 'ghost';
};

export type AssumptionReviewContent = {
  /** Row id -> false once an engineer has signed the value off. */
  placeholder: Record<string, boolean>;
  /** Row id -> replacement review note. */
  notes: Record<string, string>;
};

export type ContentDocument = {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  updatedAt: string;
  branding: BrandingContent;
  copy: CopyContent;
  engineering: EngineeringContent;
  templates: TemplateContent[];
  defaultTemplateId: string;
  glossary: GlossaryEntryContent[];
  tour: TourContent;
  welcome: WelcomeContent;
  driftBands: DriftBandContent[];
  features: FeatureContent;
  assumptionReview: AssumptionReviewContent;
};

/** A short, stable id for an item created in the admin. */
export function contentId(prefix: string): string {
  const tail =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${tail}`;
}

/** Slug used for glossary ids. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'entry';
}
