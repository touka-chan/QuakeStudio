import { FRAME_TYPES, MATERIALS } from '@/config/engineeringAssumptions';
import type { BuildingConfig } from '@/types';

/* =========================================================================
   Describing a building
   -------------------------------------------------------------------------
   One function, used everywhere a building is named in the UI.

   This exists because of a real failure: the comparison switcher and results
   table were showing `building.name`, which is the *template* label. Turning on
   comparison builds a genuinely different B, but the label still read "5-story
   concrete frame (variant)" while B was actually 10 storeys of steel. A label
   that disagrees with the thing it labels is worse than no label.

   Deriving the text from the fields means it cannot drift: edit the floors and
   the description follows, whatever else happens.

   `name` still exists on BuildingConfig — it is the saved-run label, which
   should record what the user started from.
   ========================================================================= */

/**
 * e.g. "10-story steel · braced frame".
 *
 * The frame labels already read "Moment frame" / "Braced frame", so they are
 * used as-is — appending another "frame" would give "braced frame frame".
 */
export function describeBuilding(building: BuildingConfig): string {
  const material = MATERIALS[building.material].label.toLowerCase();
  const frame = FRAME_TYPES[building.frameType].label.toLowerCase();
  return `${building.floors}-story ${material} · ${frame}`;
}
