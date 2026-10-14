import { useEffect, useState } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { BACK_REQUESTED } from '@/pwa/backButton';
import { ControlsPanel } from './ControlsPanel';
import { FirstRunDialog } from './FirstRunDialog';
import { MobileTabBar, type MobileTab } from './MobileTabBar';
import { PlaybackBar } from './PlaybackBar';
import { PlaybackClock } from './PlaybackClock';
import { ResultsPanel } from './ResultsPanel';
import { TopBar } from './TopBar';
import { LazyViewport } from '@/components/viewport/LazyViewport';

/* =========================================================================
   App shell — the three-zone workspace.
   -------------------------------------------------------------------------
   Desktop (>=1024px):  [ controls | viewport + playback | results ]
   Below that:          one zone at a time, chosen by the bottom tab bar.

   The viewport is never unmounted when switching tabs on mobile — only
   hidden. Remounting a WebGL context on every tab change is slow and janky,
   and losing the user's orbit camera would be worse.

   `forceDesktopLayout` exists for component tests: jsdom reports every
   media query as "no match", so without it a test would exercise the mobile
   layout and never see the three-zone workspace.
   ========================================================================= */

export function AppShell({ forceDesktopLayout }: { forceDesktopLayout?: boolean } = {}) {
  const [tab, setTab] = useState<MobileTab>('build');

  /*
   * Android's back button, when there is no dialog to dismiss.
   *
   * The listener lives in pwa/backButton.ts; this only reacts to its event.
   * Returning to Build rather than closing the app matches what the button
   * means everywhere else on Android.
   */
  useEffect(() => {
    function onBack(event: Event) {
      setTab((event as CustomEvent<{ tab: MobileTab }>).detail.tab);
    }
    document.addEventListener(BACK_REQUESTED, onBack);
    return () => document.removeEventListener(BACK_REQUESTED, onBack);
  }, []);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const isDesktop = useIsDesktop(forceDesktopLayout);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <TopBar assumptionsOpen={assumptionsOpen} onAssumptionsOpenChange={setAssumptionsOpen} />

        {/* Desktop: three zones side by side.
            Mobile: stacked, with exactly ONE zone visible at a time. They
            must not share a row on a phone — that squeezed the controls and
            the playback bar into unreadable columns side by side. */}
        <div className={cn('min-h-0 flex-1', isDesktop ? 'flex flex-row' : 'flex flex-col')}>
          {/* ---- Left: controls ---- */}
          {(isDesktop || tab === 'build') && (
            <aside
              className={
                isDesktop
                  ? 'flex min-h-0 w-80 shrink-0 flex-col border-r border-line bg-surface'
                  : 'flex min-h-0 min-w-0 flex-1 flex-col bg-surface'
              }
              aria-label="Building and earthquake controls"
            >
              <ControlsPanel />
            </aside>
          )}

          {/* ---- Centre: viewport + playback ---- */}
          {(isDesktop || tab === 'simulate') && (
            <main className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Simulation viewport">
              <div className="min-h-0 flex-1">
                <LazyViewport />
              </div>
              <PlaybackBar />
            </main>
          )}

          {/* ---- Right: results ---- */}
          {(isDesktop || tab === 'results') && (
            <aside
              className={
                isDesktop
                  ? 'flex min-h-0 w-96 shrink-0 flex-col border-l border-line bg-surface'
                  : 'flex min-h-0 min-w-0 flex-1 flex-col bg-surface'
              }
              aria-label="Simulation results"
            >
              <ResultsPanel />
            </aside>
          )}
        </div>

        {!isDesktop ? <MobileTabBar value={tab} onChange={setTab} /> : null}

        {/* The single playback clock. Mounted once, above everything that
            reads time, so it keeps ticking whichever tab is visible. */}
        <PlaybackClock />

        <FirstRunDialog onOpenAssumptions={() => setAssumptionsOpen(true)} />
      </div>
    </TooltipProvider>
  );
}
