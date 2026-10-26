import { BRANDING } from '@/content/branding';
import { glossaryEntrySchema } from '@/content/schema';
import { readStoredContent } from '@/content/storage';
import { slugify, type GlossaryEntryContent } from '@/content/types';

/* =========================================================================
   Glossary — plain-language definitions
   -------------------------------------------------------------------------
   The brief is explicit: no jargon without an explanation, and students
   first. Keep every definition to one or two short sentences. If a term needs
   a paragraph, the UI copy is wrong, not the definition.

   Entries are seeded below and can be added, renamed and removed in the admin.
   The simulator renders them after a reload, so the definitions it shows are
   the ones the administrator saved.
   ========================================================================= */

function entry(term: string, definition: string): GlossaryEntryContent {
  return { id: slugify(term), term, definition };
}

const BASELINE_GLOSSARY: readonly GlossaryEntryContent[] = [
  entry(
    'displacement',
    'How far a floor moves sideways, measured relative to the ground beneath it.',
  ),
  entry(
    'drift',
    'How much one floor moves compared with the floor below it. A bigger gap means more strain between the two.',
  ),
  entry(
    'drift ratio',
    'Drift as a percentage of floor height, so tall and short floors can be compared fairly.',
  ),
  entry(
    'damping',
    'How quickly the shaking dies away after it stops. More damping means the building settles sooner.',
  ),
  entry(
    'period',
    'The time it takes the building to sway back and forth once. Taller buildings have a longer period.',
  ),
  entry(
    'natural period',
    'The building’s own natural rhythm — it always sways at this pace unless something forces it faster.',
  ),
  entry('pga', 'Peak Ground Acceleration — how strong the shaking is at its most intense moment.'),
  entry('stiffness', 'How hard the building resists being pushed sideways. Stiffer buildings sway less.'),
  entry('mass', 'How heavy the building is. Heavier buildings respond more slowly.'),
  entry(
    'moment frame',
    'Rigid corners join the beams and columns, so the frame bends rather than folding inward.',
  ),
  entry(
    'braced frame',
    'Diagonal braces stiffen the frame, so it resists sideways movement much more strongly.',
  ),
  entry(
    'resonance',
    'When the shaking rhythm matches the building’s own rhythm, it builds up much more than you would expect.',
  ),
  entry(
    'exaggeration',
    'Real movement is tiny, so the 3D view multiplies it so you can see it. The numbers stay true.',
  ),
  entry('ground motion', 'The movement of the ground itself, which the building has to follow.'),
  entry(
    'seed',
    'A number that makes random shaking repeatable, so the same shake comes back every time.',
  ),
];

const saved = readStoredContent()?.glossary;
const parsed = glossaryEntrySchema.array().max(200).safeParse(saved);

export const GLOSSARY_ENTRIES: readonly GlossaryEntryContent[] =
  parsed.success && parsed.data.length > 0 ? parsed.data : BASELINE_GLOSSARY;

export const GLOSSARY: Record<string, string> = Object.fromEntries(
  GLOSSARY_ENTRIES.map((item) => [item.term, item.definition]),
);

/** Wording shared by the disclaimer surfaces. Re-exported for convenience. */
export const DISCLAIMERS = {
  short: BRANDING.disclaimerShort,
  long: BRANDING.disclaimerLong,
} as const;
