import { Plus, X } from 'lucide-react';

import { BuildingControls } from '@/components/controls/BuildingControls';
import { EarthquakeControls } from '@/components/controls/EarthquakeControls';
import { TemplatePicker } from '@/components/controls/TemplatePicker';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
   Owns its own scrolling so the viewport and playback bar never move when the
   panel content changes length.

   "Site & ground" is shown collapsed and disabled. Making the Phase 7 scope
   visible but unavailable is more honest than hiding it: students can see
   what is coming without being able to rely on it.
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
    <>
      {/*
        Outside the ScrollArea on purpose.

        The A/B switcher scrolls away with the rest of the panel, and the
        building group heading only says "Building B" while that group is in
        view. A user who scrolls down to the earthquake settings, changes a
        slider, and scrolls back up had no way to tell which building they had
        just edited — and comparison mode exists precisely to compare two
        buildings. Found by the heuristic evaluation
        (docs/heuristic-evaluation.md, H6).
      */}
      {compareEnabled ? (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2"
          // Announces the switch, so a screen-reader user learns that the
          // controls below now target the other building.
          role="status"
          aria-live="polite"
        >
          <span className="text-xs tracking-wide text-muted-foreground uppercase">Editing</span>
          <span
            className="grid size-5 place-items-center rounded text-xs font-semibold text-white"
            style={{ backgroundColor: seriesColor(editing) }}
          >
            {editing}
          </span>
          <span className="min-w-0 truncate text-sm">{editingName}</span>
        </div>
      ) : null}

      {/*
        `min-h-0 flex-1`, not `h-full`.

        Comparison mode puts a `shrink-0` "Editing A/B" header above this, and
        `h-full` is 100% of the whole panel — so the scroll area was one header
        taller than its container and the bottom of the panel (Site & ground,
        and the Phase 7 controls) was pushed out of view and clipped. That only
        showed up once comparison was switched on, which is why it looked like a
        comparison bug rather than a layout one.
      */}
      <ScrollArea className="min-h-0 flex-1">
        {/*
          Two pieces of padding, both for the floating "How to use" button, and
          neither of them decoration.

          `pr-16` on a phone reserves a gutter down the right-hand side. The
          button stands 12px from the edge and is 48px wide, so it covers the
          right 60px of whatever is showing — and on a 360px screen that band
          runs right through the material buttons. Bottom padding alone cannot
          fix this, because the content is not only at the end of the scroll:
          anything in the middle passes under the button too. That is what the
          responsive audit caught when it reported the "Wood" button as
          unclickable even after scrolling it into view.

          `pb-32` stops the last of the content coming to rest underneath it.

          Both are mobile-only: on a desktop layout the panels are far wider
          and the audit finds nothing underneath.
        */}
        <div className="space-y-6 p-4 pr-16 pb-32 lg:pr-4 lg:pb-24">
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
          ) : (
            <TemplatePicker />
          )}

          <Separator />

          <ControlGroup
            step="Step 1"
            title={compareEnabled ? `Building ${editing}` : 'Building'}
            description="Shape and materials of the building."
          >
            <BuildingControls side={compareEnabled ? editing : 'A'} />
          </ControlGroup>

          <Separator />

          <ControlGroup
            step="Step 2"
            title="Earthquake"
            description="How strong the ground shakes, and for how long."
          >
            <EarthquakeControls />
          </ControlGroup>

          <Separator />

          <ControlGroup
            step="Step 3"
            title="Site & ground"
            description="Soil, foundation and distance to the fault change how strongly a building feels the shaking. These need engineering approval before they can be included."
            disabled
          >
            <p className="rounded-app border border-dashed border-line bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
              Soil, foundation and fault distance are planned for a later version. They need to be
              reviewed by the engineering adviser first.
            </p>
          </ControlGroup>
        </div>
      </ScrollArea>
    </>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * The A / B / C / D switch, shown instead of the template picker while
 * comparing.
 *
 * Deliberately plain: one labelled button per building, in the series colour
 * that the chart and the table also use, so a building looks the same
 * everywhere. The letter is on the button as well as in the colour, which is
 * what makes it readable for a colour deficiency and on a bad screen.
 *
 * Adding is a second click, not a dropdown. The client asked for two buildings
 * to appear first and for the rest to be a deliberate act — and with four
 * materials, the default four are the same building in concrete, steel,
 * composite and wood, which is the comparison worth making before anyone has
 * touched anything.
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
    <div>
      {/*
        "Switch", not "Editing". The sticky header above already says
        "Editing B", and two labels reading the same word in one panel is
        noise — worse, it makes the indicator's state ambiguous: a user cannot
        tell which one is the live answer.
      */}
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Switch
      </p>
      <div role="radiogroup" aria-label="Which building to edit" className="flex flex-col gap-1">
        {sides.map((side, i) => {
          const selected = side.id === editing;
          // A is not removable. Going back to a single building is "stop
          // comparing", and that button lives once, in the results panel — two
          // controls with the same label in two panels is not a shortcut, it is
          // a question the user has to answer before they can carry on.
          const removable = i > 0;
          return (
            <div key={side.id} className="flex items-center gap-1">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                // The coloured badge is decorative, so without this a screen
                // reader would announce only the building name and give no clue
                // which building of the comparison is being edited.
                aria-label={`Building ${side.id}: ${side.name}`}
                onClick={() => onChange(side.id)}
                className={`flex flex-1 items-center gap-2 rounded-app border px-2.5 py-2 text-left transition-colors ${
                  selected ? 'border-line bg-surface-2' : 'border-transparent'
                }`}
              >
                <span
                  className="grid size-5 shrink-0 place-items-center rounded text-xs font-semibold text-white"
                  style={{ backgroundColor: side.color }}
                  aria-hidden="true"
                >
                  {side.id}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{side.name}</span>
                </span>
              </button>
              {/*
                A per-building remove, not a second "stop comparing".

                At four buildings the useful move is dropping one of them, and a
                single stop button can only collapse the whole thing back to
                one — losing three buildings' worth of work to remove the one
                you are done with.
              */}
              {removable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(side.id)}
                  aria-label={`Remove building ${side.id}`}
                  className="size-8 shrink-0 p-0 text-muted-foreground"
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {canAdd ? (
        <Button variant="outline" size="sm" onClick={onAdd} className="mt-2 w-full">
          <Plus aria-hidden="true" />
          Add a building
        </Button>
      ) : null}
      {/*
        A sentence rather than a tooltip, because the limit is the sort of thing
        a user finds out by pressing a button that does nothing. Four buildings
        is the number of materials, so it is a real ceiling and worth saying so.
      */}
      {!canAdd ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Four is the limit: there are four materials to compare.
        </p>
      ) : null}
    </div>
  );
}

function ControlGroup({
  step,
  title,
  description,
  children,
  disabled,
}: {
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <section aria-labelledby={`group-${step.replace(/\s/g, '-')}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2
          id={`group-${step.replace(/\s/g, '-')}`}
          className="text-sm font-semibold tracking-wide uppercase"
        >
          {title}
        </h2>
        <span className="font-mono-nums text-xs text-muted-foreground">{step}</span>
      </div>
      <p className="mb-3.5 text-xs text-muted-foreground">{description}</p>
      <div className={disabled ? 'pointer-events-none opacity-60 select-none' : undefined}>
        {children}
      </div>
    </section>
  );
}
