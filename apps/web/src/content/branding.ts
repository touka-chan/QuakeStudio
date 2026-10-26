import {
  DEFAULT_BRANDING,
  DEFAULT_FEATURES,
  DEFAULT_TOUR_UI,
  DEFAULT_WELCOME,
} from './brandingDefaults';
import { brandingSchema, featuresSchema, tourSchema, welcomeSchema } from './schema';
import { readStoredContent } from './storage';

const saved = readStoredContent();

const storedBranding = brandingSchema.safeParse(saved?.branding);
const storedWelcome = welcomeSchema.safeParse(saved?.welcome);
const storedFeatures = featuresSchema.safeParse(saved?.features);
const storedTour = tourSchema.safeParse(saved?.tour);

export const BRANDING = storedBranding.success
  ? { ...DEFAULT_BRANDING, ...storedBranding.data }
  : DEFAULT_BRANDING;

export const WELCOME = storedWelcome.success
  ? { ...DEFAULT_WELCOME, ...storedWelcome.data }
  : DEFAULT_WELCOME;

export const FEATURES = storedFeatures.success
  ? { ...DEFAULT_FEATURES, ...storedFeatures.data }
  : DEFAULT_FEATURES;

export const TOUR_UI = storedTour.success
  ? {
      enabled: storedTour.data.enabled,
      buttonLabel: storedTour.data.buttonLabel,
      buttonTooltip: storedTour.data.buttonTooltip,
    }
  : DEFAULT_TOUR_UI;
