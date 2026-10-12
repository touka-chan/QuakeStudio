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
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
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
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Editing
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
