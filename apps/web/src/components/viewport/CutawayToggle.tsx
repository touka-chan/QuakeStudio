import { useUiStore } from '@/store/uiStore';

/* =========================================================================
   Solid / Cutaway
   -------------------------------------------------------------------------
   A small segmented control over the 3D view. Solid keeps the building's
   outer shell, which is what most users expect to see. Cutaway drops the
   shell to a thin slab per floor and shows the corner columns and the objects
   on each floor, so a five-storey mixed-use building reads as a stack of
   uses rather than a solid block.

   Shared by the single and comparison viewports, and stored in `uiStore`, so
   switching comparison mode does not silently change the view.
   ========================================================================= */

export function CutawayToggle() {
  const cutaway = useUiStore((s) => s.cutaway);
  const setCutaway = useUiStore((s) => s.setCutaway);

  return (
    <div
      role="radiogroup"
      aria-label="Building display"
      className="flex rounded-app border border-line bg-surface/90 p-0.5 backdrop-blur"
    >
      <button
        type="button"
        role="radio"
        aria-checked={!cutaway}
        onClick={() => setCutaway(false)}
        className={`rounded-app px-2.5 py-1 text-xs transition-colors ${
          !cutaway ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        Solid
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={cutaway}
        onClick={() => setCutaway(true)}
        className={`rounded-app px-2.5 py-1 text-xs transition-colors ${
          cutaway ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        Cutaway
      </button>
    </div>
  );
}
