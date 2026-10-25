import {
  Briefcase,
  Car,
  Copy,
  Home,
  Info,
  Package,
  Pencil,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { FieldRow } from './FieldRow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  LOAD_ASSUMPTIONS,
  MATERIALS,
  OCCUPANCY_IDS,
  type Occupancy,
} from '@/config/engineeringAssumptions';
import {
  allOfficeFloorLoads,
  applyOccupancy,
  countedLoadKPa,
  defaultFloorLoad,
  floorAreaM2,
  floorWeightKN,
  normalizeFloorLoads,
  participationFor,
  needsReviewFor,
  withDeadLoad,
  withLiveLoad,
  type FloorLoadValue,
} from '@/config/floorLoads';
import { sideIndex, type CompareSide } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';
import { useUiStore } from '@/store/uiStore';
import type { BuildingConfig } from '@/types';

/* =========================================================================
   Floors & loads — the left panel's second tab
   -------------------------------------------------------------------------
   One row per floor, top floor first. The selected floor expands into an
   editor; the same selection drives the 3D highlight and the pin on the
   displacement chart, so clicking a slab and clicking a row are the same act.

   WHAT THE NUMBERS MEAN
       W_i = (DL_i + ψ·LL_i) × A
   The panel shows that arithmetic rather than only its result, because the
   point of the feature is to see why a storage floor is heavier than an
   office one.

   THE ON/OFF SWITCH
   "Count floor loads" is a per-building switch. ON is the arithmetic above;
   OFF consults none of it — every floor weighs its material's bare structure
   (config/floorLoads.ts), and the load rows collapse to a saved-not-used
   card. OFF exists so the bare/loaded comparison asks the engine, not the
   user, to subtract.

   COMPATIBILITY FLAGS
   A use that is not typical on the building's material (wood + parking or
   storage) is marked with an amber review note. It never blocks an edit or a
   simulation — the weights still count exactly as entered everywhere.

   SIDE-AWARE
   In comparison mode the editor writes to whichever building the switcher
   says is being edited. The store call is the only difference — the same code
   path drives A, B, C and D.
   ========================================================================= */

const OCCUPANCY_ICON: Record<Occupancy, typeof Briefcase> = {
  office: Briefcase,
  residential: Home,
  parking: Car,
  storage: Package,
  custom: Pencil,
};

/** Trim floating-point noise for display without hiding a real decimal. */
function fmt(value: number, decimals = 1): string {
  return String(Number(value.toFixed(decimals)));
}

export function FloorLoadsControls({ side = 'A' }: { side?: CompareSide }) {
  const index = sideIndex(side);
  const building = useConfigStore((s) =>
    index === 0 ? s.displayBuilding : (s.displayCompareBuildings[index - 1] ?? s.displayBuilding),
  );
  const setBuilding = useConfigStore((s) => s.setBuilding);
  const setCompareBuilding = useConfigStore((s) => s.setCompareBuilding);
  const activeFloor = useConfigStore((s) => s.activeFloor);
  const setActiveFloor = useConfigStore((s) => s.setActiveFloor);
  const openAssumptions = useUiStore((s) => s.openAssumptions);

  const floors = building.floors;
  const loads = normalizeFloorLoads(floors, building.floorLoads);
  const participation = participationFor(building);
  const areaM2 = floorAreaM2(building.widthM, building.depthM);
  const loadsOn = building.loadsEnabled !== false;

  // Floors whose use is flagged against this building's material (wood carrying
  // parking or storage, the one pair in INCOMPATIBLE_USES). A review flag, never
  // a block: the loads still count exactly as entered.
  const reviewFloors = loadsOn
    ? loads.filter((load) => needsReviewFor(load.occupancy, building.material))
    : [];
  const countLoadsId = useId();

  // The panel always has a floor open, even when the 3D has no pinned floor.
  const selected = Math.min(Math.max(activeFloor ?? floors, 1), floors);
  const selectedLoad = loads[selected - 1] ?? defaultFloorLoad(selected);

  const apply = (patch: Partial<BuildingConfig>) =>
    index === 0 ? setBuilding(patch) : setCompareBuilding(index - 1, patch);

  const updateFloor = (next: FloorLoadValue) => {
    const updated = loads.map((load, i) =>
      i === selected - 1 ? { ...next, floor: selected } : load,
    );
    apply({ floorLoads: updated });
  };

  function applyToEveryFloor() {
    apply({
      floorLoads: loads.map((load) => ({ ...selectedLoad, floor: load.floor })),
    });
  }

  function resetAllLoads() {
    apply({
      floorLoads: allOfficeFloorLoads(floors),
      liveLoadParticipation: LOAD_ASSUMPTIONS.liveLoadParticipation,
    });
  }

  return (
    <div className="space-y-4">
      {/* Count floor loads — a per-building switch; “on” is what every run
          before it did, so loading an old saved run never changes this. */}
      <div className="rounded-app border border-line p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor={countLoadsId} className="text-xs font-semibold">
              Count floor loads
            </label>
            <p
              id={`${countLoadsId}-desc`}
              className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground"
            >
              {loadsOn
                ? 'Every floor keeps its own use and dead/live loads, and they set its weight.'
                : 'No use is counted. Every floor weighs its material’s bare structure instead.'}
            </p>
          </div>
          <Switch
            id={countLoadsId}
            checked={loadsOn}
            onCheckedChange={(on) => apply({ loadsEnabled: on })}
            aria-describedby={`${countLoadsId}-desc`}
          />
        </div>
      </div>

      <div className="flex gap-2 rounded-app border border-line bg-surface-2 p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
        <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
          <p>
            {loadsOn
              ? 'These loads decide how heavy each floor is. Only part of the live load is counted as earthquake weight.'
              : 'Floor loads are off: the uses below are kept but not counted, and every floor weighs its bare structure.'}
          </p>
          <button
            type="button"
            onClick={() => openAssumptions('loads')}
            className="mt-1 font-medium text-primary underline-offset-2 hover:underline"
          >
            How we count load
          </button>
        </div>
      </div>

      {loadsOn ? (
        <div className="rounded-app border border-line p-3">
          <FieldRow
            label="Live load counted"
            value={Math.round(participation * 100)}
            min={0}
            max={100}
            step={5}
            onChange={(percent) => apply({ liveLoadParticipation: percent / 100 })}
            display={`${Math.round(participation * 100)}%`}
            help="Only this share of each floor's live load is treated as earthquake weight. Dead load always counts in full."
          />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {participation === 0
              ? 'Only dead load counts at 0%. Live load still describes the floor, but adds no earthquake weight.'
              : participation === 1
                ? 'The full live load counts at 100%. This is an upper bound, not the code assumption.'
                : `Counted live load is ${Math.round(participation * 100)}% of the live load on every floor.`}
          </p>
        </div>
      ) : (
        <div className="rounded-app border border-dashed border-line bg-surface-2/50 p-3">
          <p className="text-xs font-semibold">What the building weighs instead</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            No use is counted. Each floor weighs its material&apos;s bare mass, times its plan area
            ({fmt(areaM2, 2)} m²):
          </p>
          <ul className="mt-1.5 space-y-0.5 text-[11px]">
            {Object.entries(MATERIALS).map(([key, assumption]) => (
              <li key={key} className="flex justify-between gap-3">
                <span className="font-mono-nums">
                  {assumption.label}
                  <span className="text-muted-foreground"> · bare floor</span>
                </span>
                <span className="font-mono-nums">{assumption.bareMassPerAreaKgM2} kg/m²</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            These figures are placeholders pending engineering review. The load rows are saved, not
            reset — switch counting back on to edit and count them again.
          </p>
        </div>
      )}

      {loadsOn ? (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Floor loads
          </h3>
          {reviewFloors.length > 0 ? (
            <p className="mb-1.5 flex items-start gap-1.5 rounded-app border border-warning/40 bg-warning-bg px-2.5 py-2 text-[11px] leading-relaxed text-warning-text">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Review needed: {reviewFloors.length}{' '}
                {reviewFloors.length === 1 ? 'floor' : 'floors'} pair a use with a material this use
                is not typically built on. The weights still count the loads as entered.
              </span>
            </p>
          ) : null}
          <ul className="space-y-1" aria-label="Floors, highest first">
            {[...loads].reverse().map((load) => {
              const isSelected = load.floor === selected;
              const counted = countedLoadKPa(load.deadLoadKPa, load.liveLoadKPa, participation);
              const Icon = OCCUPANCY_ICON[load.occupancy];
              return (
                <li key={load.floor}>
                  <button
                    type="button"
                    onClick={() => setActiveFloor(load.floor)}
                    aria-expanded={isSelected}
                    aria-controls={isSelected ? 'floor-load-editor' : undefined}
                    className={`flex w-full items-center gap-2 rounded-app border px-2.5 py-2 text-left transition-colors ${
                      isSelected
                        ? 'border-primary/50 bg-surface-2'
                        : 'border-transparent hover:border-line hover:bg-surface-2/60'
                    }`}
                  >
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded text-foreground"
                      style={{ backgroundColor: `var(--load-${load.occupancy})` }}
                      aria-hidden="true"
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        Floor {load.floor}
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          · {LOAD_ASSUMPTIONS.occupancies[load.occupancy].label}
                        </span>
                      </span>
                    </span>
                    {needsReviewFor(load.occupancy, building.material) ? (
                      <TriangleAlert
                        className="size-3.5 shrink-0 text-warning-text"
                        role="img"
                        aria-label="Needs an engineering review on this building's material"
                      />
                    ) : null}
                    <span className="font-mono-nums shrink-0 text-xs text-muted-foreground">
                      {fmt(counted)} kPa
                    </span>
                  </button>

                  {isSelected ? (
                    <FloorEditor
                      key={load.floor}
                      floor={load.floor}
                      load={selectedLoad}
                      participation={participation}
                      areaM2={areaM2}
                      material={building.material}
                      onChange={updateFloor}
                      onApplyToAll={applyToEveryFloor}
                      onCopy={apply}
                      onResetAll={resetAllLoads}
                      allFloors={loads}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function FloorEditor({
  floor,
  load,
  participation,
  areaM2,
  material,
  onChange,
  onApplyToAll,
  onCopy,
  onResetAll,
  allFloors,
}: {
  floor: number;
  load: FloorLoadValue;
  participation: number;
  areaM2: number;
  material: BuildingConfig['material'];
  onChange: (load: FloorLoadValue) => void;
  onApplyToAll: () => void;
  onCopy: (patch: Partial<BuildingConfig>) => void;
  onResetAll: () => void;
  allFloors: FloorLoadValue[];
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [targets, setTargets] = useState<number[]>([]);

  const weight = floorWeightKN(areaM2, load.deadLoadKPa, load.liveLoadKPa, participation);
  const counted = countedLoadKPa(load.deadLoadKPa, load.liveLoadKPa, participation);
  const psiPercent = Math.round(participation * 100);
  // A review flag, not a rule: the governing check lives with the engineer,
  // not in this editor. See INCOMPATIBLE_USES for what is flagged and why.
  const needsReview = needsReviewFor(load.occupancy, material);

  function copyToTargets() {
    const updated = allFloors.map((entry) =>
      targets.includes(entry.floor) ? { ...load, floor: entry.floor } : entry,
    );
    onCopy({ floorLoads: updated });
    setCopyOpen(false);
    setTargets([]);
  }

  return (
    <div
      id="floor-load-editor"
      className="mt-1 mb-2 space-y-3 rounded-app border border-line bg-surface-2/50 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Floor {floor}</p>
        {load.liveOverridden ? (
          <Badge variant="secondary" className="text-[10px]">
            Custom
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {LOAD_ASSUMPTIONS.occupancies[load.occupancy].description}
          </span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label={`Use of floor ${floor}`}
        className="grid grid-cols-2 gap-1.5"
      >
        {OCCUPANCY_IDS.map((occupancy) => {
          const checked = load.occupancy === occupancy;
          const Icon = OCCUPANCY_ICON[occupancy];
          return (
            <button
              key={occupancy}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(applyOccupancy(load, occupancy))}
              className={`flex items-center gap-1.5 rounded-app border px-2 py-1.5 text-left text-xs transition-colors ${
                checked
                  ? 'border-primary bg-surface font-medium'
                  : 'border-line bg-surface hover:border-primary/40'
              }`}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{LOAD_ASSUMPTIONS.occupancies[occupancy].label}</span>
            </button>
          );
        })}
      </div>

      {needsReview ? (
        <p className="rounded-app border border-warning/40 bg-warning-bg px-2.5 py-2 text-[11px] leading-relaxed text-warning-text">
          {LOAD_ASSUMPTIONS.occupancies[load.occupancy].label} on{' '}
          {MATERIALS[material].label.toLowerCase()} is a pair an engineer should review — this use
          on this material is not typical construction. The weight below is still counted exactly as
          entered.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Dead load"
          value={load.deadLoadKPa}
          min={LOAD_ASSUMPTIONS.minDeadLoadKPa}
          max={LOAD_ASSUMPTIONS.maxDeadLoadKPa}
          onChange={(value) => onChange(withDeadLoad(load, value))}
        />
        <NumberField
          label="Live load"
          value={load.liveLoadKPa}
          min={LOAD_ASSUMPTIONS.minLiveLoadKPa}
          max={LOAD_ASSUMPTIONS.maxLiveLoadKPa}
          onChange={(value) => onChange(withLiveLoad(load, value))}
        />
      </div>

      <div className="rounded-app bg-surface px-2.5 py-2 font-mono text-[11px] leading-relaxed">
        <p className="text-muted-foreground">W = (dead + {psiPercent}% × live) × area</p>
        <p>
          = ({fmt(load.deadLoadKPa)} + {psiPercent}% × {fmt(load.liveLoadKPa)}) × {fmt(areaM2, 2)}{' '}
          m²
        </p>
        <p className="font-semibold text-foreground">
          = {fmt(weight)} kN{' '}
          <span className="font-normal text-muted-foreground">({fmt(counted)} kPa counted)</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={onApplyToAll}>
          Apply to all floors
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setTargets([]);
            setCopyOpen(true);
          }}
        >
          <Copy aria-hidden="true" />
          Copy floor to…
        </Button>
      </div>

      <button
        type="button"
        onClick={onResetAll}
        title={`Sets every floor to Office and counted live load to ${Math.round(
          LOAD_ASSUMPTIONS.liveLoadParticipation * 100,
        )}%.`}
        className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <RotateCcw className="size-3" aria-hidden="true" />
        Reset every floor to Office
      </button>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Copy floor {floor}</DialogTitle>
            <DialogDescription>
              Copy this floor&apos;s use and loads to the floors you choose. The floor you are
              copying from is left as it is.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto py-1">
            {allFloors
              .filter((entry) => entry.floor !== floor)
              .map((entry) => {
                const checked = targets.includes(entry.floor);
                return (
                  <label
                    key={entry.floor}
                    className="flex items-center gap-2 rounded-app px-1 py-1 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        setTargets((current) =>
                          value === true
                            ? [...current, entry.floor]
                            : current.filter((n) => n !== entry.floor),
                        )
                      }
                    />
                    Floor {entry.floor}
                  </label>
                );
              })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() =>
                setTargets(
                  targets.length === allFloors.length - 1
                    ? []
                    : allFloors.filter((e) => e.floor !== floor).map((e) => e.floor),
                )
              }
            >
              {targets.length === allFloors.length - 1 ? 'Clear' : 'Select all'}
            </button>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setCopyOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={copyToTargets} disabled={targets.length === 0}>
                Copy to {targets.length || '…'} {targets.length === 1 ? 'floor' : 'floors'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * A kPa field that previews while you type.
 *
 * The store is updated only when the text parses inside the documented range,
 * so a half-typed "4." never reaches the model. On blur an invalid value
 * snaps back to the last valid one instead of leaving the field lying.
 */
function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(fmt(value));
  const [touched, setTouched] = useState(false);

  // Keep the displayed text in sync when the controlled value changes from
  // outside (e.g. another floor is selected). The text input is locally
  // editable, but the parent owns the canonical value — this sync is safe
  // because re-rendering does not change `value`, so there is no cascade.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(fmt(value));
  }, [value]);

  const parsed = Number(text);
  const invalid = text.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={0.1}
          value={text}
          aria-invalid={invalid && touched ? true : undefined}
          aria-describedby={invalid && touched ? `${id}-error` : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            setTouched(true);
            const number = Number(next);
            if (next.trim() !== '' && Number.isFinite(number) && number >= min && number <= max) {
              onChange(number);
            }
          }}
          onBlur={() => {
            setTouched(true);
            if (invalid) setText(fmt(value));
          }}
          className="pr-10"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-[11px] text-muted-foreground">
          kPa
        </span>
      </div>
      {invalid && touched ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[11px] text-danger">
          Use {min}–{max} kPa.
        </p>
      ) : null}
    </div>
  );
}
