import { useEffect, useState } from 'react';
import { Download, Info, PanelLeftClose, PanelLeftOpen, Save, Sun, Moon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { buildCsv, csvFilename, downloadCsv } from '@/lib/csv';
import { useConfigStore } from '@/store/configStore';
import {
  applyTheme,
  prefersDark,
  readStoredTheme,
  storeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';
import { cn } from '@/lib/utils';
import { DisclaimerBadge } from './DisclaimerBadge';

/* =========================================================================
   Top bar
   -------------------------------------------------------------------------
   Logo · persistent disclaimer · theme toggle.

   Phase 1 ships the theme toggle for real (it works) and shows Save run,
   Export CSV and Assumptions as clearly-marked coming-soon controls, so the
   layout can be reviewed at full width without half the bar missing.
   ========================================================================= */

export function TopBar({
  onTogglePanel,
  panelOpen,
  onOpenSaves,
}: {
  onTogglePanel: () => void;
  panelOpen: boolean;
  onOpenSaves: () => void;
}) {
  const building = useConfigStore((s) => s.building);
  const motion = useConfigStore((s) => s.motion);
  const result = useConfigStore((s) => s.result);
  const [exported, setExported] = useState<string | null>(null);

  // Export writes the SAME result object the charts render, so the file and
  // the screen cannot disagree. See lib/csv.ts.
  const exportCsv = () => {
    if (result.time.length === 0) return;
    const filename = csvFilename(building);
    downloadCsv(filename, buildCsv(building, motion, result));
    setExported(filename);
  };

  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <div
          className="grid size-8 place-items-center rounded-app bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          <BuildingIcon />
        </div>
        <span className="text-lg font-semibold tracking-tight">QuakeStudio</span>
      </div>

      <div className="order-last w-full min-w-0 lg:order-none lg:mx-2 lg:w-auto lg:flex-1">
        <DisclaimerBadge />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSaves}
              disabled={result.time.length === 0}
            >
              <Save aria-hidden="true" />
              <span className="hidden md:inline">Save run</span>
              <span className="md:hidden">Save</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            Saved in this browser. Export from the dialog to move runs elsewhere.
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={result.time.length === 0}
              aria-label="Export this run as a CSV file"
            >
              <Download aria-hidden="true" />
              Export CSV
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            Writes the current run at full precision, in the same units shown on screen.
          </TooltipContent>
        </Tooltip>

        {/* Announces the download to assistive tech without shifting the
            toolbar with a toast. */}
        <span className="sr-only" role="status" aria-live="polite">
          {exported ? `Exported ${exported}` : ''}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden md:block">
              <ComingSoonButton icon={Info} label="Assumptions" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            Every assumption in the model, in the app. Arrives in Phase 5 — see
            <code className="mx-1">docs/assumptions.md</code> meanwhile.
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="hidden h-6 md:block" />

        <ThemeToggle />

        <Button
          variant="ghost"
          size="icon"
          onClick={onTogglePanel}
          aria-label={panelOpen ? 'Hide controls panel' : 'Show controls panel'}
          aria-expanded={panelOpen}
          className="lg:hidden"
        >
          {panelOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------- */

function ComingSoonButton({ icon: Icon, label }: { icon: typeof Download; label: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled
      aria-label={`${label} — not available yet`}
      className="pointer-events-none"
    >
      <Icon aria-hidden="true" />
      {label}
    </Button>
  );
}

/* ------------------------------------------------------------------------- */

function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredTheme());
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark());

  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const resolved: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    applyTheme(resolved);
    storeTheme(preference);
  }, [resolved, preference]);

  const isDark = resolved === 'dark';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPreference(isDark ? 'light' : 'dark')}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          className={cn('transition-colors', isDark && 'text-accent-yellow')}
        >
          {isDark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {preference === 'system' ? 'Following your system setting' : 'Your choice'} — switch to{' '}
        {isDark ? 'light' : 'dark'}
      </TooltipContent>
    </Tooltip>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        d="M4 20V7l5-3v16M9 20V4l5 3v13M14 20v-9l5-3v12M3 20h18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 23c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { DISCLAIMER_SHORT } from '@/config/engineeringAssumptions';
