import { Plus, X } from 'lucide-react';

import { BuildingControls } from '@/components/controls/BuildingControls';
import { EarthquakeControls } from '@/components/controls/EarthquakeControls';
import { FloorLoadsControls } from '@/components/controls/FloorLoadsControls';
import { TemplatePicker } from '@/components/controls/TemplatePicker';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  defaultCompareBuilding,
  MAX_BUILDINGS,
  seriesColor,
  sideAt,
  sideIndex,
  useCompareStore,
  type CompareSide,
} from '@/store/compareStore';
import { resolveNow, useConfigStore } from '@/store/configStore';
import type { BuildingConfig } from '@/types';
import { describeBuilding } from '@/lib/describeBuilding';

/* =========================================================================
   Controls panel — the left zone.
   -------------------------------------------------------------------------
   Three tabs, because the panel now has three jobs:

     Building        shape, material and frame
     Floors & loads  what each floor is used for, and how heavy that makes it
     Earthquake      the shake and the disabled Phase 7 site factors

   The tabs replaced a single long scroll. Adding floor loads to that scroll
   put the earthquake controls two screens below the building they apply to,
   and the extra length is exactly what made the old panel hard to scan.

   "Site & ground" stays visible but disabled: showing what is planned is more
   honest than hiding it, as long as it cannot be relied on.
   ========================================================================= */

export function ControlsPanel() {
  const count = useCompareStore((s) => s.count);
  const editing = useCompareStore((s) => s.editing);
  const setEditing = useCompareStore((s) => s.setEditing);
  const addSide = useCompareStore((s) => s.addSide);
  const building = useConfigStore((s) => s.building);
  const compareBuildings = useConfigStore((s) => s.compareBuildings);

  const compareEnabled = count > 1;
  const editingIndex = sideIndex(editing);
  const editingName = describeBuilding(
    editingIndex === 0 ? building : (compareBuildings[editingIndex - 1] ?? building),
  );

  /**
   * Add one more building to the comparison.
   *
   * The building is added before the count goes up. `extras()` in the config
   * store slices the list to the compare count, so a building added after the
   * count rose would be there — but a count raised before the building landed
   * would solve one fewer than it is showing.
   */
  function addAnother() {
    const extras = useConfigStore.getState().displayCompareBuildings;
    const a = useConfigStore.getState().displayBuilding;
    useConfigStore
      .getState()
      .setCompareBuildings([...extras, defaultCompareBuilding(extras.length, a)]);
    addSide();
    resolveNow();
  }

  /**
   * Drop one building from the comparison.
   *
   * The buildings after it go too, because the slots are positional: dropping C
   * out of [B, C, D] leaves D in third place, and "Building C" on screen
   * showing D's measurements is precisely the kind of quiet mismatch this app
   * is supposed to be free of.
   */
  function removeAnother(side: CompareSide) {
    const index = sideIndex(side);
    if (index < 1) return;
    const { compareBuildings: extras } = useConfigStore.getState();
    useConfigStore.getState().setCompareBuildings(extras.slice(0, index - 1));
    useCompareStore.getState().removeSide(side);
    resolveNow();
  }

  return (
    <Tabs defaultValue="building" className="min-h-0 flex-1 gap-0">
      <div className="shrink-0 space-y-2 border-b border-line px-4 py-2">
        {compareEnabled ? (
          <div
            className="flex items-center gap-2"
            // Announces the switch, so a screen-reader user learns that the
            // controls below now target the other building. The switcher itself
            // stays OUT of this live region: announcing a click on it would
            // read back the whole group every time.
            role="status"
            aria-live="polite"
          >
            <span className="flex items-center gap-1.5 text-xs tracking-wide text-muted-foreground uppercase">
              Editing
              <span
                className="grid size-5 place-items-center rounded text-xs font-semibold text-white"
                style={{ backgroundColor: seriesColor(editing) }}
                aria-hidden="true"
              >
                {editing}
              </span>
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">{editingName}</span>
            {!compareEnabled ? null : count < MAX_BUILDINGS ? null : (
              <span className="text-[11px] text-muted-foreground">Four is the limit</span>
            )}
          </div>
        ) : null}

        {compareEnabled ? (
          <CompareSwitcher
            count={count}
            editing={editing}
            onChange={setEditing}
            onAdd={addAnother}
            onRemove={removeAnother}
            canAdd={count < MAX_BUILDINGS}
            buildings={[building, ...compareBuildings]}
          />
        ) : null}

        <TabsList className="w-full">
          <TabsTrigger value="building">Building</TabsTrigger>
          <TabsTrigger value="loads" data-tour="loads">
            Floors &amp; loads
          </TabsTrigger>
          <TabsTrigger value="earthquake">Earthquake</TabsTrigger>
        </TabsList>
      </div>

      {/* ---- Building ------------------------------------------------------ */}
      <TabsContent value="building" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="space-y-5 p-4 pb-24">
            {!compareEnabled ? <TemplatePicker /> : null}
            <p className="text-xs text-muted-foreground">
              Shape and materials of the building. Every floor is the same size.
            </p>
            <BuildingControls side={compareEnabled ? editing : 'A'} />
          </div>
        </ScrollArea>
      </TabsContent>

      {/* ---- Floors & loads ------------------------------------------------ */}
      <TabsContent value="loads" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="p-4 pb-24">
            <FloorLoadsControls side={compareEnabled ? editing : 'A'} />
          </div>
        </ScrollArea>
      </TabsContent>

      {/* ---- Earthquake ---------------------------------------------------- */}
      <TabsContent value="earthquake" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="space-y-5 p-4 pb-24">
            <p className="text-xs text-muted-foreground">
              How strong the ground shakes, and for how long. The record is shared by every building
              in the comparison.
            </p>
            <EarthquakeControls />

            <Separator />

            <section aria-labelledby="site-ground-heading" className="opacity-60">
              <h2
                id="site-ground-heading"
                className="text-sm font-semibold tracking-wide uppercase"
              >
                Site &amp; ground
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Soil, foundation and distance to the fault change how strongly a building feels the
                shaking. These need engineering approval before they can be included.
              </p>
              <p className="mt-3 rounded-app border border-dashed border-line bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
                Soil, foundation and fault distance are planned for a later version. They need to be
                reviewed by the engineering adviser first.
              </p>
            </section>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * The A / B / C / D switch.
 *
 * Compact enough to live above the tabs, because switching buildings has to
 * be possible while editing floor loads — not only from the Building tab.
 *
 * One button per building, in the series colour the chart and the table also
 * use, so a building looks the same everywhere. The letter is on the button as
 * well as in the colour, which is what makes it readable for a colour
 * deficiency and on a bad screen.
 */
function CompareSwitcher({
  count,
  editing,
  onChange,
  onAdd,
  onRemove,
  canAdd,
  buildings,
}: {
  count: number;
  editing: CompareSide;
  onChange: (side: CompareSide) => void;
  onAdd: () => void;
  onRemove: (side: CompareSide) => void;
  canAdd: boolean;
  buildings: BuildingConfig[];
}) {
  const sides = buildings.slice(0, count).map((b, i) => ({
    id: sideAt(i),
    name: describeBuilding(b),
    color: seriesColor(sideAt(i)),
  }));

  return (
    <div
      role="radiogroup"
      aria-label="Which building to edit"
      className="flex w-full flex-col gap-1"
    >
      {sides.map((side, i) => {
        const selected = side.id === editing;
        // A is not removable. Going back to a single building is "stop
        // comparing", and that button lives once, in the results panel.
        const removable = i > 0;
        return (
          <div key={side.id} className="flex items-center gap-1">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Building ${side.id}: ${side.name}`}
              onClick={() => onChange(side.id)}
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-app border px-1.5 py-1 text-left text-xs transition-colors ${
                selected ? 'border-line bg-surface-2' : 'border-transparent'
              }`}
            >
              <span
                className="grid size-4 shrink-0 place-items-center rounded text-[10px] font-semibold text-white"
                style={{ backgroundColor: side.color }}
                aria-hidden="true"
              >
                {side.id}
              </span>
              <span className="min-w-0 truncate">{side.name}</span>
            </button>
            {removable ? (
              <button
                type="button"
                onClick={() => onRemove(side.id)}
                aria-label={`Remove building ${side.id}`}
                className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}
      {canAdd ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onAdd}
          aria-label="Add a building"
          className="ml-auto size-7 p-0 text-muted-foreground"
        >
          <Plus aria-hidden="true" className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
