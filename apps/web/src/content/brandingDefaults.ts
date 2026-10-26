import type {
  BrandingContent,
  FeatureContent,
  TourContent,
  WelcomeContent,
} from './types';

/* =========================================================================
   Branding, welcome and feature defaults
   -------------------------------------------------------------------------
   Kept outside the React tree so both the simulator and the admin can read the
   same values. The palette itself is deliberately not editable here; only the
   app name, logo glyph and the words around the product are.
   ========================================================================= */

export const DEFAULT_BRANDING: BrandingContent = {
  appName: 'QuakeStudio',
  documentTitle: 'QuakeStudio',
  metaDescription:
    'QuakeStudio — an educational earthquake response simulator. Not a structural safety assessment.',
  logoIcon: 'building',
  disclaimerShort:
    'Educational simulation using simplified assumptions. Not a structural safety assessment.',
  disclaimerLong:
    'This is a learning tool, not a safety check. QuakeStudio uses a simplified model with stated assumptions. Its results say nothing about whether a real building is safe.',
};

export const DEFAULT_TOUR_UI: Pick<TourContent, 'enabled' | 'buttonLabel' | 'buttonTooltip'> = {
  enabled: true,
  buttonLabel: 'How to use',
  buttonTooltip: 'Walk through the five things you can do here. Drag it anywhere.',
};

export const DEFAULT_WELCOME: WelcomeContent = {
  enabled: true,
  title: 'Welcome to QuakeStudio',
  description: 'Build a simple building, shake it, and watch how it sways.',
  acknowledgement: 'I understand that results are for learning only.',
  assumptionsLabel: 'Read the assumptions',
  startLabel: 'Start exploring',
  footer:
    'Every coefficient in this tool is a placeholder waiting for review by a structural engineer. The Assumptions button in the top bar lists them all.',
  steps: [
    {
      id: 'welcome-build',
      icon: 'play',
      title: 'Build',
      body: 'Pick a template or change the floors, size, material and frame type.',
    },
    {
      id: 'welcome-shake',
      icon: 'waves',
      title: 'Shake',
      body: 'Choose how strong and how fast the ground moves, then press play.',
    },
    {
      id: 'welcome-compare',
      icon: 'compare',
      title: 'Compare',
      body: 'Add a second building and see how the sway and the numbers differ.',
    },
  ],
};

export const DEFAULT_FEATURES: FeatureContent = {
  compareEnabled: true,
  maxBuildings: 4,
  maxSideBySide: 2,
  feedbackEnabled: true,
  installPromptEnabled: true,
  savedRunsEnabled: true,
  csvExportEnabled: true,
  welcomeEnabled: true,
  tourEnabled: true,
  defaultCutaway: false,
  defaultCompareView: 'sideBySide',
};
