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

/**
 * Building controls for one side of the comparison.
 *
 * In single mode `side` is always 'A' and the controls write to building A.
 * In comparison mode the controls write to whichever side the user is editing,
 * so the same sliders drive both buildings without duplicating the UI.
 */
export function BuildingControls({ side = 'A' }: { side?: 'A' | 'B' }) {
  const building = useConfigStore((s) =>
    side === 'B' ? s.displayCompareBuilding : s.displayBuilding,
  );
  const setBuilding = useConfigStore((s) => s.setBuilding);
  const setCompareBuilding = useConfigStore((s) => s.setCompareBuilding);

  const apply = (patch: Partial<typeof building>) =>
    side === 'B' ? setCompareBuilding(patch) : setBuilding(patch);

  const heightM = building.floors * building.floorHeightM;

  return (
    <div className="space-y-5">
      <FieldRow
        label="Floors"
        value={building.floors}
        min={GEOMETRY.minFloors}
        max={GEOMETRY.maxFloors}
        step={1}
        onChange={(floors) => apply({ floors })}
        display={String(building.floors)}
        help={`How many storeys the building has. Between ${GEOMETRY.minFloors} and ${GEOMETRY.maxFloors}.`}
      />

      <FieldRow
        label="Floor height"
        value={building.floorHeightM}
        min={GEOMETRY.floorHeightM.min}
        max={GEOMETRY.floorHeightM.max}
        step={GEOMETRY.floorHeightM.step}
        onChange={(floorHeightM) => apply({ floorHeightM })}
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
        onChange={(widthM) => apply({ widthM })}
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
        onChange={(depthM) => apply({ depthM })}
        display={building.depthM.toFixed(0)}
        unit="m"
        help="How far the building extends away from you."
      />

      <ChoiceGroup
        legend="Material"
        help="Sets how heavy the building is and how quickly it settles after shaking."
        options={MATERIAL_IDS.map((id) => ({ value: id, label: MATERIALS[id].label }))}
        value={building.material}
        onChange={(material) => apply({ material: material as MaterialId })}
      />

      <ChoiceGroup
        legend="Frame type"
        options={FRAME_IDS.map((id) => ({
          value: id,
          label: id === 'moment' ? 'Moment frame' : 'Braced frame',
        }))}
        value={building.frameType}
        onChange={(frameType) => apply({ frameType: frameType as FrameTypeId })}
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
              // Sized to its own label, then given a share of whatever is
              // left over.
              //
              // This used to be `basis-[calc(50%-2px)] sm:basis-[calc(25%-3px)]`,
              // which picks a column count from the VIEWPORT width. That is the
              // wrong question: on the desktop layout this group sits in a fixed
              // 287px sidebar, so `sm:` (a 640px viewport) forced 4 columns of
              // 67px into 287px. "Composite" alone needs 66px of text plus 16px
              // of padding, so it overflowed - and since the group clips with
              // `overflow-hidden`, the last label was cut off at the edge.
              //
              // `grow` with `basis-auto`, NOT `flex-1`: `flex-1` is
              // `flex: 1 1 0%`, a basis of zero, so every button still grows to
              // exactly the same width and the labels still do not fit. With
              // `basis-auto` each button starts at its own label width and
              // `grow` hands out the remainder.
              //
              // The row now fits by construction and wraps only when the labels
              // genuinely cannot - decided by the space available rather than by
              // a breakpoint guess about the viewport.
              // `min-h-11` on a coarse pointer.
              //
              // These measured 31px tall, just under the 40px floor the audit
              // reports. A segmented control is allowed to be chunky, so rather
              // than shrugging at it, the height goes to the 44px standard
              // only where a finger is actually the input. `pointer: coarse`
              // rather than a width breakpoint, because a touchscreen laptop is
              // wide and still touch-driven.
              className={`min-w-0 grow basis-auto rounded-app px-2 py-1.5 text-center text-sm transition-colors pointer-coarse:min-h-11 ${
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
