import { Monitor } from 'lucide-react';

import { Button } from '@/components/ui/button';

/* =========================================================================
   Desktop notice
   -------------------------------------------------------------------------
   QuakeStudio is desktop-first on purpose. The three-zone workspace, the
   3D cutaway and the floor-load editor need more width than a phone gives
   them; squeezing them into a column produced a layout that was technically
   responsive and practically unreadable.

   So below 1024 px the app says so, in plain language, and offers a way
   through for anyone who needs it. "Continue anyway" is deliberately not
   remembered: the next visit gets the honest answer again, and there is no
   stored flag to explain later.
   ========================================================================= */

export function DesktopNotice({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-app bg-surface-2 text-muted-foreground"
            aria-hidden="true"
          >
            <Monitor className="size-5" />
          </span>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            QuakeStudio
          </p>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          This tool is built for a laptop or desktop.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The 3D building, the floor-load controls and the comparison charts need more room than a
          phone screen gives them. Open this page on a laptop or desktop computer for the full
          workspace.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onContinue}>
            Continue anyway
          </Button>
          <span className="text-xs text-muted-foreground">
            The layout will be narrow and may need sideways scrolling.
          </span>
        </div>
      </div>
    </div>
  );
}
