import { z } from 'zod';

import {
  CONTENT_SCHEMA_VERSION,
  FRAME_TYPE_IDS,
  GROUND_MOTION_PRESET_IDS,
  LOGO_ICONS,
  MATERIAL_IDS,
  TOUR_ICONS,
  TOUR_TARGETS,
  WELCOME_ICONS,
  type ContentDocument,
} from './types';

/* =========================================================================
   Content validation
   -------------------------------------------------------------------------
   One schema is used by the repository before anything is written, and by the
   admin forms for field-level messages. It is intentionally strict: a demo
   admin should never be able to save a document that makes the simulator fail
   on its next load.
   ========================================================================= */

const text = (max = 2_000) => z.string().trim().min(1, 'This cannot be empty.').max(max);
const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour, for example #15803d.');

const rangeSchema = z
  .object({
    min: z.number().finite(),
    max: z.number().finite(),
    step: z.number().finite().positive('The step must be greater than zero.'),
    default: z.number().finite(),
  })
  .superRefine((value, ctx) => {
    if (value.min >= value.max) {
      ctx.addIssue({ code: 'custom', path: ['min'], message: 'The minimum must be below the maximum.' });
    }
    if (value.default < value.min || value.default > value.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['default'],
        message: 'The default must sit between the minimum and the maximum.',
      });
    }
  });

const materialSchema = z.object({
  label: text(60),
  dampingRatio: z.number().min(0.001).max(0.2),
  periodCt: z.number().positive(),
  periodExponentX: z.number().positive(),
  bareMassPerAreaKgM2: z.number().nonnegative(),
});

const frameTypeSchema = z.object({
  label: text(60),
  stiffnessFactor: z.number().positive(),
});

const occupancySchema = z.object({
  label: text(60),
  liveKPa: z.number().nonnegative().max(100),
  description: text(240),
  colorLight: hex,
  colorDark: hex,
});

const materialRecordSchema = z.object({
  concrete: materialSchema,
  steel: materialSchema,
  composite: materialSchema,
  wood: materialSchema,
});

const frameRecordSchema = z.object({
  moment: frameTypeSchema,
  braced: frameTypeSchema,
});

const occupancyRecordSchema = z.object({
  office: occupancySchema,
  residential: occupancySchema,
  parking: occupancySchema,
  storage: occupancySchema,
  custom: occupancySchema,
});

const loadAssumptionsSchema = z
  .object({
    codeBasis: text(400),
    gravityMs2: z.number().positive(),
    defaultDeadLoadKPa: z.number().nonnegative(),
    liveLoadParticipation: z.number().min(0).max(1),
    minDeadLoadKPa: z.number().nonnegative(),
    maxDeadLoadKPa: z.number().positive(),
    minLiveLoadKPa: z.number().nonnegative(),
    maxLiveLoadKPa: z.number().positive(),
    sourceNote: text(400),
  })
  .superRefine((value, ctx) => {
    if (value.minDeadLoadKPa >= value.maxDeadLoadKPa) {
      ctx.addIssue({
        code: 'custom',
        path: ['minDeadLoadKPa'],
        message: 'The minimum dead load must be below the maximum.',
      });
    }
    if (value.defaultDeadLoadKPa < value.minDeadLoadKPa || value.defaultDeadLoadKPa > value.maxDeadLoadKPa) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultDeadLoadKPa'],
        message: 'The default dead load must sit inside the allowed range.',
      });
    }
    if (value.minLiveLoadKPa >= value.maxLiveLoadKPa) {
      ctx.addIssue({
        code: 'custom',
        path: ['minLiveLoadKPa'],
        message: 'The minimum live load must be below the maximum.',
      });
    }
  });

const geometrySchema = z
  .object({
    minFloors: z.number().int().min(1).max(100),
    maxFloors: z.number().int().min(1).max(100),
    floorHeightM: rangeSchema,
    widthM: rangeSchema,
    depthM: rangeSchema,
  })
  .superRefine((value, ctx) => {
    if (value.minFloors >= value.maxFloors) {
      ctx.addIssue({
        code: 'custom',
        path: ['minFloors'],
        message: 'The minimum floor count must be below the maximum.',
      });
    }
  });

const groundMotionSchema = z
  .object({
    pgaG: rangeSchema,
    frequencyHz: rangeSchema,
    defaultSeed: z.number().int(),
    sampleDtS: z.number().positive(),
    taperDurationS: z.number().nonnegative(),
    randomBandHz: z
      .object({ low: z.number().positive(), high: z.number().positive() })
      .superRefine((value, ctx) => {
        if (value.low >= value.high) {
          ctx.addIssue({
            code: 'custom',
            path: ['low'],
            message: 'The low band edge must be below the high edge.',
          });
        }
      }),
    impulseDurationS: z.number().positive(),
  })
  .superRefine((value, ctx) => {
    if (value.randomBandHz.high > value.frequencyHz.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['randomBandHz', 'high'],
        message: 'The random band cannot exceed the maximum shaking frequency.',
      });
    }
  });

const viewportSchema = z
  .object({
    defaultExaggeration: z.number().positive(),
    minExaggeration: z.number().positive(),
    maxExaggeration: z.number().positive(),
    exaggerationStep: z.number().positive(),
    defaultGridDivisions: z.number().int().positive(),
    groundThicknessM: z.number().positive(),
  })
  .superRefine((value, ctx) => {
    if (value.minExaggeration >= value.maxExaggeration) {
      ctx.addIssue({
        code: 'custom',
        path: ['minExaggeration'],
        message: 'The minimum exaggeration must be below the maximum.',
      });
    }
    if (
      value.defaultExaggeration < value.minExaggeration ||
      value.defaultExaggeration > value.maxExaggeration
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultExaggeration'],
        message: 'The default exaggeration must sit inside the allowed range.',
      });
    }
  });

const playbackSchema = z
  .object({
    speeds: z.array(z.number().positive()).min(1, 'Offer at least one playback speed.').max(8),
    defaultSpeed: z.number().positive(),
    defaultLoop: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!value.speeds.includes(value.defaultSpeed)) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultSpeed'],
        message: 'The default speed must be one of the offered speeds.',
      });
    }
    if (new Set(value.speeds).size !== value.speeds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['speeds'],
        message: 'Each playback speed can appear only once.',
      });
    }
  });

const defaultBuildingSchema = z.object({
  id: text(100),
  name: text(100),
  floors: z.number().int().min(1).max(100),
  floorHeightM: z.number().min(1).max(20),
  widthM: z.number().min(2).max(200),
  depthM: z.number().min(2).max(200),
  material: z.enum(MATERIAL_IDS),
  frameType: z.enum(FRAME_TYPE_IDS),
});

const defaultMotionSchema = z.object({
  preset: z.enum(GROUND_MOTION_PRESET_IDS),
  pgaG: z.number().positive(),
  frequencyHz: z.number().positive(),
  durationS: z.number().positive(),
  dt: z.number().positive(),
  seed: z.number().int(),
});

const presetRecordSchema = z.object({
  harmonic: z.object({ label: text(60), description: text(240) }),
  random: z.object({ label: text(60), description: text(240) }),
  impulse: z.object({ label: text(60), description: text(240) }),
});

const incompatibleUsesSchema = z
  .object({
    office: z.array(z.enum(MATERIAL_IDS)).optional(),
    residential: z.array(z.enum(MATERIAL_IDS)).optional(),
    parking: z.array(z.enum(MATERIAL_IDS)).optional(),
    storage: z.array(z.enum(MATERIAL_IDS)).optional(),
    custom: z.array(z.enum(MATERIAL_IDS)).optional(),
  })
  .default({});

export const engineeringContentSchema = z
  .object({
    materials: materialRecordSchema,
    frameTypes: frameRecordSchema,
    occupancies: occupancyRecordSchema,
    loadAssumptions: loadAssumptionsSchema,
    incompatibleUses: incompatibleUsesSchema,
    geometry: geometrySchema,
    groundMotion: groundMotionSchema,
    viewport: viewportSchema,
    playback: playbackSchema,
    defaultBuilding: defaultBuildingSchema,
    defaultGroundMotion: defaultMotionSchema,
    groundMotionPresets: presetRecordSchema,
  })
  .superRefine((value, ctx) => {
    const building = value.defaultBuilding;
    if (building.floors < value.geometry.minFloors || building.floors > value.geometry.maxFloors) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultBuilding', 'floors'],
        message: 'The default building must sit inside the geometry floor limits.',
      });
    }
    for (const field of ['floorHeightM', 'widthM', 'depthM'] as const) {
      const range = value.geometry[field];
      if (building[field] < range.min || building[field] > range.max) {
        ctx.addIssue({
          code: 'custom',
          path: ['defaultBuilding', field],
          message: 'The default building must sit inside the geometry limits.',
        });
      }
    }

    const motion = value.defaultGroundMotion;
    if (
      motion.pgaG < value.groundMotion.pgaG.min ||
      motion.pgaG > value.groundMotion.pgaG.max
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultGroundMotion', 'pgaG'],
        message: 'The default strength must sit inside the ground-motion limits.',
      });
    }
    if (
      motion.frequencyHz < value.groundMotion.frequencyHz.min ||
      motion.frequencyHz > value.groundMotion.frequencyHz.max
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultGroundMotion', 'frequencyHz'],
        message: 'The default frequency must sit inside the ground-motion limits.',
      });
    }
  });

export const templateContentSchema = z.object({
  id: text(100),
  label: text(80),
  description: text(240),
  building: z.object({
    floors: z.number().int().min(1).max(100),
    floorHeightM: z.number().min(1).max(20),
    widthM: z.number().min(2).max(200),
    depthM: z.number().min(2).max(200),
    material: z.enum(MATERIAL_IDS),
    frameType: z.enum(FRAME_TYPE_IDS),
  }),
});

export const glossaryEntrySchema = z.object({
  id: text(100),
  term: text(80),
  definition: text(600),
});

export const tourStepSchema = z.object({
  id: text(100),
  target: z.enum(TOUR_TARGETS),
  title: text(100),
  body: text(800),
  icon: z.enum(TOUR_ICONS),
});

export const welcomeStepSchema = z.object({
  id: text(100),
  icon: z.enum(WELCOME_ICONS),
  title: text(60),
  body: text(300),
});

export const tourSchema = z.object({
  enabled: z.boolean(),
  buttonLabel: text(60),
  buttonTooltip: text(240),
  steps: z.array(tourStepSchema).min(1, 'Keep at least one tour step.').max(12),
});

export const welcomeSchema = z.object({
  enabled: z.boolean(),
  title: text(100),
  description: text(240),
  acknowledgement: text(240),
  assumptionsLabel: text(60),
  startLabel: text(60),
  footer: text(500),
  steps: z.array(welcomeStepSchema).min(1, 'Keep at least one welcome step.').max(6),
});

export const brandingSchema = z.object({
  appName: text(60),
  documentTitle: text(100),
  metaDescription: text(300),
  logoIcon: z.enum(LOGO_ICONS),
  disclaimerShort: text(400),
  disclaimerLong: text(600),
});

export const copySchema = z
  .record(z.string(), z.string().max(4_000))
  .refine((value) => Object.keys(value).length <= 500, 'Too many copy keys.');

export const driftBandSchema = z.object({
  id: text(100),
  max: z.number().positive().nullable(),
  label: text(60),
  note: text(240),
  colorLight: hex,
  colorDark: hex,
});

export const driftBandsSchema = z
  .array(driftBandSchema)
  .min(2, 'Keep at least two drift bands.')
  .max(8)
  .superRefine((bands, ctx) => {
    if (bands[bands.length - 1]?.max !== null) {
      ctx.addIssue({
        code: 'custom',
        path: [bands.length - 1, 'max'],
        message: 'The final drift band must be open-ended (infinity).',
      });
    }
    let previous = 0;
    bands.forEach((band, index) => {
      if (band.max === null) {
        if (index !== bands.length - 1) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'max'],
            message: 'Only the final drift band can be open-ended.',
          });
        }
        return;
      }
      if (band.max <= previous) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'max'],
          message: 'Drift thresholds must increase from one band to the next.',
        });
      }
      previous = band.max;
    });
  });

export const featuresSchema = z
  .object({
    compareEnabled: z.boolean(),
    maxBuildings: z.number().int().min(2).max(4),
    maxSideBySide: z.number().int().min(1).max(4),
    feedbackEnabled: z.boolean(),
    installPromptEnabled: z.boolean(),
    savedRunsEnabled: z.boolean(),
    csvExportEnabled: z.boolean(),
    welcomeEnabled: z.boolean(),
    tourEnabled: z.boolean(),
    defaultCutaway: z.boolean(),
    defaultCompareView: z.enum(['sideBySide', 'ghost']),
  })
  .superRefine((value, ctx) => {
    if (value.maxSideBySide > value.maxBuildings) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxSideBySide'],
        message: 'The side-by-side limit cannot exceed the number of buildings.',
      });
    }
  });

export const assumptionReviewSchema = z.object({
  placeholder: z.record(z.string(), z.boolean()),
  notes: z.record(z.string(), z.string().max(1_000)),
});

export const contentDocumentSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    updatedAt: z.string().min(1),
    branding: brandingSchema,
    copy: copySchema,
    engineering: engineeringContentSchema,
    templates: z.array(templateContentSchema).min(1).max(30),
    defaultTemplateId: text(100),
    glossary: z.array(glossaryEntrySchema).max(200),
    tour: tourSchema,
    welcome: welcomeSchema,
    driftBands: driftBandsSchema,
    features: featuresSchema,
    assumptionReview: assumptionReviewSchema,
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    value.templates.forEach((template, index) => {
      if (ids.has(template.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['templates', index, 'id'],
          message: 'Template ids must be unique.',
        });
      }
      ids.add(template.id);

      const geometry = value.engineering.geometry;
      if (template.building.floors < geometry.minFloors || template.building.floors > geometry.maxFloors) {
        ctx.addIssue({
          code: 'custom',
          path: ['templates', index, 'building', 'floors'],
          message: `This template is outside the current floor limits (${geometry.minFloors}–${geometry.maxFloors}).`,
        });
      }
      for (const field of ['floorHeightM', 'widthM', 'depthM'] as const) {
        const range = geometry[field];
        const number = template.building[field];
        if (number < range.min || number > range.max) {
          ctx.addIssue({
            code: 'custom',
            path: ['templates', index, 'building', field],
            message: 'This template is outside the current geometry limits.',
          });
        }
      }
    });

    if (!ids.has('custom')) {
      ctx.addIssue({
        code: 'custom',
        path: ['templates'],
        message: 'The Custom template is required and cannot be deleted.',
      });
    }
    if (!ids.has(value.defaultTemplateId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultTemplateId'],
        message: 'Choose a template that exists.',
      });
    }
    if (value.defaultTemplateId === 'custom') {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultTemplateId'],
        message: 'The Custom template cannot be the startup default.',
      });
    }

    const glossaryIds = new Set<string>();
    const terms = new Set<string>();
    value.glossary.forEach((entry, index) => {
      if (glossaryIds.has(entry.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['glossary', index, 'id'],
          message: 'Glossary ids must be unique.',
        });
      }
      const term = entry.term.trim().toLowerCase();
      if (terms.has(term)) {
        ctx.addIssue({
          code: 'custom',
          path: ['glossary', index, 'term'],
          message: 'This term already exists in the glossary.',
        });
      }
      glossaryIds.add(entry.id);
      terms.add(term);
    });

    const stepIds = new Set<string>();
    value.tour.steps.forEach((step, index) => {
      if (stepIds.has(step.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['tour', 'steps', index, 'id'],
          message: 'Tour step ids must be unique.',
        });
      }
      stepIds.add(step.id);
    });

    const welcomeIds = new Set<string>();
    value.welcome.steps.forEach((step, index) => {
      if (welcomeIds.has(step.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['welcome', 'steps', index, 'id'],
          message: 'Welcome step ids must be unique.',
        });
      }
      welcomeIds.add(step.id);
    });
  });

export type ParsedContentDocument = z.infer<typeof contentDocumentSchema>;

export type ContentIssue = {
  path: string;
  message: string;
};

export function contentIssues(error: z.ZodError): ContentIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function parseContent(value: unknown):
  | { success: true; data: ContentDocument }
  | { success: false; issues: ContentIssue[] } {
  const parsed = contentDocumentSchema.safeParse(value);
  if (!parsed.success) return { success: false, issues: contentIssues(parsed.error) };
  return { success: true, data: parsed.data };
}

export function issueFor(issues: readonly ContentIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.path === path)?.message;
}

export type { ContentDocument };
