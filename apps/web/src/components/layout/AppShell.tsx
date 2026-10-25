import { useState } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { ControlsPanel } from './ControlsPanel';
import { DesktopNotice } from './DesktopNotice';
import { WelcomeGate } from './WelcomeGate';
import { PlaybackBar } from './PlaybackBar';
import { PlaybackClock } from './PlaybackClock';
import { ResultsPanel } from './ResultsPanel';
import { TopBar } from './TopBar';
import { LazyViewport } from '@/components/viewport/LazyViewport';
import { Tour } from '@/components/tutorial/Tour';
import { TourButton } from '@/components/tutorial/TourButton';
import { useTourStore } from '@/store/tourStore';
import { useUiStore } from '@/store/uiStore';

/* =========================================================================
   App shell — the three-zone workspace.
   -------------------------------------------------------------------------
   Desktop (>=1024px): [ controls | viewport + playback | results ]

   Below 1024px the app shows a straight notice instead of inventing a
   column layout for a screen it was not designed for. "Continue anyway"
   renders the same three zones with sideways scrolling. There is no tab bar
   and no separate mobile layout: the desktop workspace is the product.

   `forceDesktopLayout` exists for component tests: jsdom reports every
   media query as "no match", so without it a test would only ever see the
   notice.
   ========================================================================= */

export function AppShell({ forceDesktopLayout }: { forceDesktopLayout?: boolean } = {}) {
  const [continuedAnyway, setContinuedAnyway] = useState(false);
  const assumptionsOpen = useUiStore((s) => s.assumptionsOpen);
  const setAssumptionsOpen = useUiStore((s) => s.setAssumptionsOpen);
  const isDesktop = useIsDesktop(forceDesktopLayout);
  /* True once the tour is out of the way — see Tour.tsx. */
  const tourSettled = useTourStore((s) => s.settled);

  /*
   * The notice comes before the tour and the welcome gate, so a phone user
   * gets one honest screen rather than three overlays stacked on a layout
   * that cannot fit. Choosing to continue mounts the real workspace and the
   * usual first-run sequence behind it.
   */
  if (!isDesktop && !continuedAnyway) {
    return <DesktopNotice onContinue={() => setContinuedAnyway(true)} />;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <TopBar assumptionsOpen={assumptionsOpen} onAssumptionsOpenChange={setAssumptionsOpen} />

        {/*
          The three zones, always side by side.

          `min-w-[960px]` + `overflow-x-auto` is the "Continue anyway" path:
          the workspace keeps its real proportions and a narrow screen scrolls
          sideways, rather than compressing three panels into slivers. At
          >=960px, which includes every real desktop, the minimum does nothing.
        */}
        <div className="min-h-0 flex-1 overflow-x-auto">
          <div className="flex h-full min-w-[960px] flex-row">
            {/* ---- Left: controls ---- */}
            <aside
              className="flex min-h-0 w-72 shrink-0 flex-col border-r border-line bg-surface xl:w-80"
              aria-label="Building and earthquake controls"
              data-tour="controls"
            >
              <ControlsPanel />
            </aside>

            {/* ---- Centre: viewport + playback ---- */}
            <main className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Simulation viewport">
              <div className="min-h-0 flex-1">
                <LazyViewport />
              </div>
              <PlaybackBar />
            </main>

            {/* ---- Right: results ---- */}
            <aside
              className="flex min-h-0 w-80 shrink-0 flex-col border-l border-line bg-surface xl:w-96"
              aria-label="Simulation results"
              data-tour="results"
            >
              <ResultsPanel />
            </aside>
          </div>
        </div>

        {/* The single playback clock. Mounted once, above everything that
            reads time, so it keeps ticking whichever zone is in view. */}
        <PlaybackClock />

        {/* The guided tour. Mounted above the gate on purpose: the tour is
            skippable, the gate is not, so the tour gets the first beat and
            releases the gate when it is done. */}
        <Tour forceDesktopLayout={forceDesktopLayout} />

        {/*
          Re-entry for the tour, floating at the bottom of the screen rather
          than in the top bar. Hidden while the tour itself is up — the card
          already offers a way out.
        */}
        <TourButton />

        {/*
          The gate stays blocking. `blocked` is true only while the tour is
          still going to appear this session — so a returning user who has
          already seen the tour gets the gate immediately, and a new user sees
          one overlay at a time rather than two fighting over focus.
        */}
        <WelcomeGate onOpenAssumptions={() => setAssumptionsOpen(true)} blocked={!tourSettled} />
      </div>
    </TooltipProvider>
  );
}
