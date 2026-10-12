import { useId } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldRow } from './FieldRow';
import { GROUND_MOTION, GROUND_MOTION_PRESETS, SOLVER } from '@/config/engineeringAssumptions';
import { useConfigStore } from '@/store/configStore';
import type { GroundMotionPresetId } from '@/config/engineeringAssumptions';

/* =========================================================================
   Earthquake controls — Step 2
   -------------------------------------------------------------------------
   Only the fields that apply to the chosen preset are shown. Asking about
   "shaking frequency" while a single impulse is selected is a question the
   user cannot act on, so it is not asked.
   ========================================================================= */

const PRESET_IDS = Object.keys(GROUND_MOTION_PRESETS) as GroundMotionPresetId[];

/** Which controls make sense for each preset. */
const RELEVANT_FIELDS: Record<GroundMotionPresetId, Array<'frequency' | 'seed'>> = {
  harmonic: ['frequency'],
  random: ['frequency', 'seed'],
  impulse: [],
};

export function EarthquakeControls() {
  const motion = useConfigStore((s) => s.motion);
  const setMotion = useConfigStore((s) => s.setMotion);
  const id = useId();

  const fields = RELEVANT_FIELDS[motion.preset];

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Ground motion
        </label>
        <Select
          value={motion.preset}
          onValueChange={(preset) => setMotion({ preset: preset as GroundMotionPresetId })}
        >
          <SelectTrigger id={id} aria-label="Ground motion type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESET_IDS.map((presetId) => (
              <SelectItem key={presetId} value={presetId}>
                <span className="font-medium">{GROUND_MOTION_PRESETS[presetId].label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {GROUND_MOTION_PRESETS[motion.preset].description}
        </p>
      </div>

      <FieldRow
        label="Strength"
        value={motion.pgaG}
        min={GROUND_MOTION.pgaG.min}
        max={GROUND_MOTION.pgaG.max}
        step={GROUND_MOTION.pgaG.step}
        onChange={(pgaG) => setMotion({ pgaG })}
        display={motion.pgaG.toFixed(2)}
        unit="g"
        glossary="pga"
        help="How hard the ground shakes at its most intense moment. 0.3 g is a strong shake."
      />

      {fields.includes('frequency') ? (
        <FieldRow
          label="Shaking frequency"
          value={motion.frequencyHz ?? GROUND_MOTION.frequencyHz.default}
          min={GROUND_MOTION.frequencyHz.min}
          max={GROUND_MOTION.frequencyHz.max}
          step={GROUND_MOTION.frequencyHz.step}
          onChange={(frequencyHz) => setMotion({ frequencyHz })}
          display={(motion.frequencyHz ?? GROUND_MOTION.frequencyHz.default).toFixed(1)}
          unit="Hz"
          glossary="resonance"
          help="How fast the ground shakes back and forth. Try matching it to the building's natural period to see resonance."
        />
      ) : null}

      {fields.includes('seed') ? (
        <FieldRow
          label="Random seed"
          value={motion.seed ?? GROUND_MOTION.defaultSeed}
          min={1}
          max={99999}
          step={1}
          onChange={(seed) => setMotion({ seed })}
          glossary="seed"
          help="Change the number to get a different random shake. The same number always gives the same shake back."
        />
      ) : null}

      <FieldRow
        label="Duration"
        value={motion.durationS}
        min={SOLVER.minDurationS}
        max={SOLVER.maxDurationS}
        step={1}
        onChange={(durationS) => setMotion({ durationS })}
        display={String(motion.durationS)}
        unit="s"
        help="How long the shaking lasts. Watch how the building keeps moving briefly after the ground stops."
      />
    </div>
  );
}
