import { useEffect, useState } from 'react';
import { ClipboardList, Download, Info, Save, Sun, Moon } from 'lucide-react';

import { BrandMark } from '@/components/brand/BrandMark';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { BRANDING, FEATURES } from '@/content/branding';
import { t } from '@/content/copy';
import { LazyFeedback } from '@/feedback/LazyFeedback';
import { InstallButton } from '@/pwa/InstallButton';
import { AssumptionsDialog } from './AssumptionsDialog';
import { SaveLoadDialog } from './SaveLoadDialog';

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
   Logo · persistent disclaimer · save, export, assumptions · theme toggle.
   ========================================================================= */

export function TopBar({
  assumptionsOpen,
  onAssumptionsOpenChange,
}: {
  /**
   * The About & Assumptions dialog is owned by the shell rather than here,
   * because the first-run dialog also opens it. The TRIGGER stays in this
   * component — Radix needs it inside the `<Dialog>` to restore focus on
   * close.
   */
  assumptionsOpen: boolean;
  onAssumptionsOpenChange: (open: boolean) => void;
}) {
  /*
   * The dialogs live HERE, beside their trigger buttons, rather than in the
   * shell.
   *
   * Radix restores focus to its `DialogTrigger` when a dialog closes. A dialog
   * opened by external state — with no trigger registered — has nothing to
   * restore to, so Escape drops focus onto `<body>` and a keyboard user has to
   * tab from the top of the document all over again. Owning the trigger fixes
   * that, and it keeps the button and the dialog that it opens together.
   */
  const [saveOpen, setSaveOpen] = useState(false);
  // The feedback dialog is owned here for the same reason as the others: its
  // trigger has to sit inside its <Dialog> or Radix cannot restore focus.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const building = useConfigStore((s) => s.building);
  const motion = useConfigStore((s) => s.motion);
  const result = useConfigStore((s) => s.result);
  const [exported, setExported] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Export writes the SAME result object the charts render, so the file and
  // the screen cannot disagree. See lib/csv.ts.
  //
  // It can now FAIL — on a phone the native write is not guaranteed — and a
  // silent failure here is precisely the bug this button used to have. If it
  // does not work, the user is told, in the live region, in words.
  const exportCsv = async () => {
    if (result.time.length === 0) return;
    setExportError(null);

    try {
      const filename = csvFilename(building);
      await downloadCsv(filename, buildCsv(building, motion, result));
      setExported(filename);
    } catch (error) {
      setExported(null);
      setExportError(error instanceof Error ? error.message : 'The CSV could not be exported.');
    }
  };

  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <BrandMark />
        <span className="text-lg font-semibold tracking-tight">{BRANDING.appName}</span>
      </div>

      <div className="order-last w-full min-w-0 lg:order-none lg:mx-2 lg:w-auto lg:flex-1">
        <DisclaimerBadge />
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {FEATURES.savedRunsEnabled ? (
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={result.time.length === 0}>
                    <Save aria-hidden="true" />
                    <span className="hidden md:inline">{t('topbar.saveRun', undefined, 'Save run')}</span>
                    <span className="md:hidden">{t('topbar.saveShort', undefined, 'Save')}</span>
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {t('topbar.saveTooltip')}
              </TooltipContent>
            </Tooltip>

            <SaveLoadDialog open={saveOpen} onOpenChange={setSaveOpen} />
          </Dialog>
        ) : null}

        {FEATURES.csvExportEnabled ? (
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
                {/*
                 * Same responsive shortening as Save and Assumptions.
                 *
                 * "Export CSV" is the widest label in the bar and was the
                 * single biggest reason a 360px phone could not fit the row.
                 */}
                <span className="hidden md:inline">
                  {t('topbar.exportCsv', undefined, 'Export CSV')}
                </span>
                <span className="md:hidden">{t('topbar.exportShort', undefined, 'Export')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {t('topbar.exportTooltip')}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {/* Announces the result to assistive tech without shifting the toolbar
            with a toast. A FAILURE is announced too — a silent export is the
            bug this whole path exists to fix. */}
        <span className="sr-only" role="status" aria-live="polite">
          {exportError ? `Export failed. ${exportError}` : exported ? `Exported ${exported}` : ''}
        </span>

        {/* Visible to everyone, not just screen readers. The share sheet is a
            system UI that may never appear, and on a failure the user needs to
            know in ordinary sight. */}
        {exportError ? (
          <p
            role="alert"
            className="w-full rounded-app border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:w-auto"
          >
            {exportError}
          </p>
        ) : null}

        <Dialog open={assumptionsOpen} onOpenChange={onAssumptionsOpenChange}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Info aria-hidden="true" />
                  <span className="hidden md:inline">
                    {t('topbar.assumptions', undefined, 'Assumptions')}
                  </span>
                  <span className="md:hidden">{t('topbar.assumptionsShort', undefined, 'About')}</span>
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {t('topbar.assumptionsTooltip')}
            </TooltipContent>
          </Tooltip>

          <AssumptionsDialog />
        </Dialog>

        {/* Same shape as the Assumptions dialog above: the trigger is a
            sibling of the content, inside the <Dialog>, so Radix restores
            focus here on close. Driven by an onClick alone it did not, and a
            keyboard user dismissing the questionnaire was dropped onto <body>.
            See FeedbackDialog.tsx. */}
        {FEATURES.feedbackEnabled ? (
          <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('topbar.feedbackAria', undefined, 'Usability feedback')}
                  >
                    <ClipboardList aria-hidden="true" />
                    {/*
                      The visible label is hidden below `lg` and this button has
                      no short fallback, so without the aria-label it has NO
                      accessible name on a phone or a tablet - a screen reader
                      announces a bare "button" next to three others.

                      Found by the responsive audit timing out trying to click it:
                      Playwright locates by accessible name, so a control with
                      none of them is one this tool cannot even see.
                    */}
                    <span className="hidden lg:inline">{t('topbar.feedback', undefined, 'Feedback')}</span>
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {t('topbar.feedbackTooltip')}
              </TooltipContent>
            </Tooltip>

            <LazyFeedback />
          </Dialog>
        ) : null}

        {FEATURES.installPromptEnabled ? <InstallButton /> : null}

        <Separator orientation="vertical" className="hidden h-6 md:block" />

        <ThemeToggle />

        {/*
          A "show controls panel" toggle used to sit here.

          It was removed rather than repositioned, because it could not do
          anything. It set `panelOpen`, and nothing in the layout ever read
          that state — AppShell shows one zone at a time on a phone and
          switches between them with the tab bar at the bottom. The button was
          also invisible in practice: it is `lg:hidden`, so it rendered below
          `lg`, and the audit measured it at x=395..431 on a 360px screen —
          entirely off the right edge, unreachable and inert.

          If a collapsible controls panel on a phone is wanted, that is a
          feature to build against AppShell's layout, not a button to un-hide.
        */}
      </div>
    </header>
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


