import { DISCLAIMER_LONG, DISCLAIMER_SHORT } from '@/config/engineeringAssumptions';

/* =========================================================================
   Glossary — plain-language definitions
   -------------------------------------------------------------------------
   The brief is explicit: no jargon without an explanation, and students
   first. Keep every definition to one or two short sentences. If a term needs
   a paragraph, the UI copy is wrong, not the definition.

   Lives apart from the components that render it so that fast refresh keeps
   working for whoever is editing the tooltips.
   ========================================================================= */

export const GLOSSARY: Record<string, string> = {
  displacement: 'How far a floor moves sideways, measured relative to the ground beneath it.',
  drift:
    'How much one floor moves compared with the floor below it. A bigger gap means more strain between the two.',
  'drift ratio':
    'Drift as a percentage of floor height, so tall and short floors can be compared fairly.',
  damping:
    'How quickly the shaking dies away after it stops. More damping means the building settles sooner.',
  period:
    'The time it takes the building to sway back and forth once. Taller buildings have a longer period.',
  'natural period':
    'The building’s own natural rhythm — it always sways at this pace unless something forces it faster.',
  pga: 'Peak Ground Acceleration — how strong the shaking is at its most intense moment.',
  stiffness: 'How hard the building resists being pushed sideways. Stiffer buildings sway less.',
  mass: 'How heavy the building is. Heavier buildings respond more slowly.',
  'moment frame':
    'Rigid corners join the beams and columns, so the frame bends rather than folding inward.',
  'braced frame':
    'Diagonal braces stiffen the frame, so it resists sideways movement much more strongly.',
  resonance:
    'When the shaking rhythm matches the building’s own rhythm, it builds up much more than you would expect.',
  exaggeration:
    'Real movement is tiny, so the 3D view multiplies it so you can see it. The numbers stay true.',
  'ground motion': 'The movement of the ground itself, which the building has to follow.',
  seed: 'A number that makes random shaking repeatable, so the same shake comes back every time.',
};

/** Wording shared by the disclaimer surfaces. Re-exported for convenience. */
export const DISCLAIMERS = {
  short: DISCLAIMER_SHORT,
  long: DISCLAIMER_LONG,
} as const;
