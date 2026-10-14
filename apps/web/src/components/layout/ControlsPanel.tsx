import { BuildingControls } from '@/components/controls/BuildingControls';
import { EarthquakeControls } from '@/components/controls/EarthquakeControls';
import { TemplatePicker } from '@/components/controls/TemplatePicker';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useCompareStore } from '@/store/compareStore';
import { useConfigStore } from '@/store/configStore';
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
  const compareEnabled = useCompareStore((s) => s.enabled);
  const editing = useCompareStore((s) => s.editing);
  const setEditing = useCompareStore((s) => s.setEditing);
  const building = useConfigStore((s) => s.building);
  const compareBuilding = useConfigStore((s) => s.compareBuilding);

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
            style={{ backgroundColor: editing === 'A' ? 'var(--series-a)' : 'var(--series-b)' }}
          >
            {editing}
          </span>
          <span className="min-w-0 truncate text-sm">
            {editing === 'A' ? describeBuilding(building) : describeBuilding(compareBuilding)}
          </span>
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
              editing={editing}
              onChange={setEditing}
              nameA={describeBuilding(building)}
              nameB={describeBuilding(compareBuilding)}
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
 * A / B switch, shown instead of the template picker while comparing.
 *
 * Deliberately plain: two labelled buttons in the series colours that the
 * chart and table also use, so "A" always looks the same everywhere.
 */
function CompareSwitcher({
  editing,
  onChange,
  nameA,
  nameB,
}: {
  editing: 'A' | 'B';
  onChange: (side: 'A' | 'B') => void;
  nameA: string;
  nameB: string;
}) {
  const sides = [
    { id: 'A' as const, name: nameA, color: 'var(--series-a)' },
    { id: 'B' as const, name: nameB, color: 'var(--series-b)' },
  ];

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
      <div role="radiogroup" aria-label="Which building to edit" className="flex gap-1">
        {sides.map((side) => {
          const selected = side.id === editing;
          return (
            <button
              key={side.id}
              type="button"
              role="radio"
              aria-checked={selected}
              // The coloured A/B badge is decorative, so without this a screen
              // reader would announce only the building name and give no clue
              // which side of the comparison is being edited.
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
          );
        })}
      </div>
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
