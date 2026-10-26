/* =========================================================================
   Default interface copy
   -------------------------------------------------------------------------
   These are the strings the simulator renders when the admin has not changed
   them. Keys are grouped with a dotted prefix so the copy screen can group and
   search them without a separate metadata file.
   ========================================================================= */

export const DEFAULT_COPY = {
  'topbar.saveRun': 'Save run',
  'topbar.saveShort': 'Save',
  'topbar.saveTooltip': 'Saved in this browser. Export from the dialog to move runs elsewhere.',
  'topbar.exportCsv': 'Export CSV',
  'topbar.exportShort': 'Export',
  'topbar.exportTooltip':
    'Writes the current run at full precision, in the same units shown on screen.',
  'topbar.assumptions': 'Assumptions',
  'topbar.assumptionsShort': 'About',
  'topbar.assumptionsTooltip': 'What the model assumes, and what its results do not tell you.',
  'topbar.feedback': 'Feedback',
  'topbar.feedbackAria': 'Usability feedback',
  'topbar.feedbackTooltip':
    'Ten usability questions. Answers stay in this browser until you export them.',

  'results.heading': 'Results',
  'results.updating': 'Updating…',
  'results.updatingBuilding': 'Updating building {side}',
  'results.owner': 'Building {side}',
  'results.summary': 'Summary',
  'results.response': 'Response',
  'results.peakDisplacement': 'Peak displacement',
  'results.peakDisplacementDetail': 'Floor {floor}, relative to ground',
  'results.peakDisplacementHelp':
    'The furthest any floor moved sideways, measured from the ground beneath it.',
  'results.maxStoryDrift': 'Max story drift',
  'results.maxStoryDriftDetail': 'Story {story}',
  'results.maxStoryDriftHelp':
    'The biggest gap between one floor and the floor below it, as a percentage of floor height.',
  'results.naturalPeriod': 'Natural period',
  'results.naturalPeriodDetail': '1st mode',
  'results.naturalPeriodHelp':
    'How long the building takes to sway back and forth once, at its natural rhythm.',
  'results.compare': 'Compare with another building',
  'results.stopCompare': 'Stop comparing',
  'results.compareHelpOn':
    '{count} buildings felt the same earthquake. Pick one on the left to edit it.',
  'results.compareHelpOff':
    'Adds a second, third or fourth configuration and runs them all under one earthquake.',
  'results.dimensionsHeading': 'Dimensions and formulas',
  'results.height': 'Height',
  'results.floorArea': 'Floor area',
  'results.floorWeight': 'Floor weight',
  'results.displacementNote':
    'is sideways movement from the ground, in millimetres. Each line is one floor.',
  'results.driftNote':
    'is the difference between one floor’s peak and the floor below’s, as a percentage of floor height. The difference is taken between the peaks, not instant by instant.',
  'results.periodNote':
    'is the time for one full sway at the building’s natural rhythm. A longer period is not by itself better or worse.',

  'playback.goToStart': 'Go to start',
  'playback.play': 'Play',
  'playback.pause': 'Pause',
  'playback.simulationTime': 'Simulation time',
  'playback.speed': 'Speed',
  'playback.playbackSpeed': 'Playback speed',
  'playback.motion': 'Motion',
  'playback.motionAria': 'Motion exaggeration factor',
  'playback.loop': 'Loop',
  'playback.note':
    'Motion is drawn {exaggeration}× larger so millimetres are visible. The numbers themselves are not exaggerated — but they are still the model’s output, not a validated result.',
  'playback.reducedMotion': ' Reduced-motion is on, so playback starts paused at half speed.',

  'desktop.heading': 'QuakeStudio is built for a laptop or desktop',
  'desktop.body':
    'The workspace needs three columns side by side. On a smaller screen the panels would be too narrow to read.',
  'desktop.continue': 'Continue anyway',

  'templates.label': 'Start from a template',
} as const satisfies Record<string, string>;

export type CopyKey = keyof typeof DEFAULT_COPY;

export const COPY_KEYS = Object.keys(DEFAULT_COPY) as CopyKey[];

/** Group a copy key by its dotted prefix. */
export function copyGroup(key: string): string {
  const prefix = key.split('.')[0] ?? 'other';
  const labels: Record<string, string> = {
    topbar: 'Top bar',
    results: 'Results panel',
    playback: 'Playback bar',
    desktop: 'Desktop notice',
    templates: 'Template picker',
    other: 'Other',
  };
  return labels[prefix] ?? 'Other';
}
