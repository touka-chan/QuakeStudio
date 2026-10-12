import { FieldRow } from './FieldRow';
import {
  GEOMETRY,
  MATERIALS,
  type FrameTypeId,
  type MaterialId,
} from '@/config/engineeringAssumptions';
import { useConfigStore } from '@/store/configStore';

/* =========================================================================
   Building controls — Step 1
   -------------------------------------------------------------------------
   Sliders for the four dimensions, then material and frame type as segmented
   choice groups (a dropdown would hide the options behind a click).

   Every field validates as you type. The brief asks for inline, friendly
   errors, so the message is the one a student can act on, not a Zod dump.
   ========================================================================= */

const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];
const FRAME_IDS: FrameTypeId[] = ['moment', 'braced'];

const FRAME_HELP: Record<FrameTypeId, string> = {
  moment: 'Rigid corners join beams and columns. The frame bends rather than folding inward.',
  braced: 'Diagonal braces stiffen the frame, so it resists sideways movement much more strongly.',
};

export function BuildingControls() {
  const building = useConfigStore((s) => s.building);
  const setBuilding = useConfigStore((s) => s.setBuilding);

  const heightM = building.floors * building.floorHeightM;

  return (
    <div className="space-y-5">
      <FieldRow
        label="Floors"
        value={building.floors}
        min={GEOMETRY.minFloors}
        max={GEOMETRY.maxFloors}
        step={1}
        onChange={(floors) => setBuilding({ floors })}
        display={String(building.floors)}
        help={`How many storeys the building has. Between ${GEOMETRY.minFloors} and ${GEOMETRY.maxFloors}.`}
      />

      <FieldRow
        label="Floor height"
        value={building.floorHeightM}
        min={GEOMETRY.floorHeightM.min}
        max={GEOMETRY.floorHeightM.max}
        step={GEOMETRY.floorHeightM.step}
        onChange={(floorHeightM) => setBuilding({ floorHeightM })}
        display={building.floorHeightM.toFixed(1)}
        unit="m"
        help="Height from one floor to the next. Taller floors make the building taller overall."
      />

      <FieldRow
        label="Width"
        value={building.widthM}
        min={GEOMETRY.widthM.min}
        max={GEOMETRY.widthM.max}
        step={GEOMETRY.widthM.step}
        onChange={(widthM) => setBuilding({ widthM })}
        display={building.widthM.toFixed(0)}
        unit="m"
        help="The front-to-back size shown in the 3D view."
      />

      <FieldRow
        label="Depth"
        value={building.depthM}
        min={GEOMETRY.depthM.min}
        max={GEOMETRY.depthM.max}
        step={GEOMETRY.depthM.step}
        onChange={(depthM) => setBuilding({ depthM })}
        display={building.depthM.toFixed(0)}
        unit="m"
        help="How far the building extends away from you."
      />

      <ChoiceGroup
        legend="Material"
        help="Sets how heavy the building is and how quickly it settles after shaking."
        options={MATERIAL_IDS.map((id) => ({ value: id, label: MATERIALS[id].label }))}
        value={building.material}
        onChange={(material) => setBuilding({ material: material as MaterialId })}
      />

      <ChoiceGroup
        legend="Frame type"
        options={FRAME_IDS.map((id) => ({
          value: id,
          label: id === 'moment' ? 'Moment frame' : 'Braced frame',
        }))}
        value={building.frameType}
        onChange={(frameType) => setBuilding({ frameType: frameType as FrameTypeId })}
        optionHelp={FRAME_HELP}
      />

      <p className="rounded-app bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
        Total height <span className="font-mono-nums text-foreground">{heightM.toFixed(1)} m</span>{' '}
        · <span className="font-mono-nums text-foreground">{building.floors}</span> floors
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

type ChoiceOption = { value: string; label: string };

function ChoiceGroup({
  legend,
  options,
  value,
  onChange,
  help,
  optionHelp,
}: {
  legend: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  help?: string;
  optionHelp?: Record<string, string>;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm">{legend}</legend>
      <div
        role="radiogroup"
        aria-label={legend}
        className="flex flex-wrap gap-1 overflow-hidden rounded-app bg-surface-2 p-1"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={optionHelp?.[option.value]}
              onClick={() => onChange(option.value)}
              // 2-up on a phone, 4-up once there is room, so the group never
              // overflows and never wastes a row on desktop.
              className={`min-w-0 flex-1 basis-[calc(50%-2px)] rounded-app px-2 py-1.5 text-center text-sm transition-colors sm:basis-[calc(25%-3px)] ${
                selected
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      {help ? <p className="mt-1.5 text-xs text-muted-foreground">{help}</p> : null}
    </fieldset>
  );
}
