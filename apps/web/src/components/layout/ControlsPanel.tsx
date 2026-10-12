import { BuildingControls } from '@/components/controls/BuildingControls';
import { EarthquakeControls } from '@/components/controls/EarthquakeControls';
import { TemplatePicker } from '@/components/controls/TemplatePicker';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

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
  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <TemplatePicker />

        <Separator />

        <ControlGroup
          step="Step 1"
          title="Building"
          description="Shape and materials of the building."
        >
          <BuildingControls />
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
