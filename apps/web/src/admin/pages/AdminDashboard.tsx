import {
  Activity,
  ArrowRight,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Download,
  ExternalLink,
  Flag,
  GraduationCap,
  HardDrive,
  LayoutTemplate,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { BASE_ASSUMPTIONS } from '@/config/assumptionCatalogue';
import { readFeedback } from '@/feedback/feedbackStorage';
import { contentRepository } from '@/content/repository';
import {
  formatRelativeTime,
  readActivity,
  type AdminActivity,
} from '../adminActivity';
import { useAdminContent } from '../AdminContext';
import { swalConfirm } from '../adminSwal';
import { showError, showExported } from '../adminToast';
import { SectionCard } from '../AdminForms';
import {
  ActivityItem,
  adminButtonClass,
  AdminBadge,
  AdminButton,
  AdminStatCard,
  formatAdminDate,
  StatusBadge,
} from '../AdminUI';

export function AdminDashboard({ onNavigate }: { onNavigate: (to: string) => void }) {
  const { content, importJson, reset } = useAdminContent();
  const feedbackCount = readFeedback().length;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const totalAssumptions = BASE_ASSUMPTIONS.length;
  const pendingAssumptions = BASE_ASSUMPTIONS.filter(
    (row) => content.assumptionReview.placeholder[row.id] ?? row.placeholder,
  ).length;
  const reviewedAssumptions = totalAssumptions - pendingAssumptions;
  const reviewedPercent = totalAssumptions
    ? Math.round((reviewedAssumptions / totalAssumptions) * 100)
    : 0;

  const stats = [
    {
      id: 'templates',
      label: 'Templates',
      hint: 'Building starting points',
      value: content.templates.length,
      icon: LayoutTemplate,
    },
    {
      id: 'glossary',
      label: 'Glossary',
      hint: 'Definitions for students',
      value: content.glossary.length,
      icon: BookOpen,
    },
    {
      id: 'tour',
      label: 'Tour steps',
      hint: 'Guided walkthrough',
      value: content.tour.steps.length,
      icon: GraduationCap,
    },
    {
      id: 'tour',
      label: 'Welcome steps',
      hint: 'Opening screen',
      value: content.welcome.steps.length,
      icon: Sparkles,
    },
    {
      id: 'drift',
      label: 'Drift bands',
      hint: 'Visual thresholds',
      value: content.driftBands.length,
      icon: Activity,
    },
    {
      id: 'feedback',
      label: 'Feedback',
      hint: 'Saved SUS responses',
      value: feedbackCount,
      icon: ClipboardCheck,
    },
  ];

  const quickActions = [
    {
      id: 'branding',
      label: 'Edit branding',
      hint: 'Name, title, logo, and disclaimers',
      icon: Palette,
    },
    {
      id: 'templates',
      label: 'Manage templates',
      hint: 'Building presets and startup defaults',
      icon: LayoutTemplate,
    },
    {
      id: 'features',
      label: 'Check feature flags',
      hint: 'Capabilities and simulator limits',
      icon: Flag,
    },
    {
      id: 'review',
      label: 'Review assumptions',
      hint: 'Track values awaiting engineering sign-off',
      icon: ClipboardCheck,
    },
  ];

  const storedActivity = readActivity();
  const fallbackActivity: AdminActivity = {
    id: 'content-ready',
    at: content.updatedAt,
    kind: 'save',
    title: 'Content is ready in this browser',
    detail: 'Changes you save will appear here',
  };
  const activity = (storedActivity.length > 0 ? storedActivity : [fallbackActivity]).slice(0, 5);

  const storageBytes = new Blob([contentRepository.exportJson()]).size;
  const storageSize =
    storageBytes < 1024
      ? `${storageBytes} B`
      : `${(storageBytes / 1024).toFixed(storageBytes < 10240 ? 1 : 0)} KB`;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  function exportBackup() {
    const blob = new Blob([contentRepository.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quakestudio-content-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showExported('Backup downloaded.');
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const raw = await file.text();
      swalConfirm({
        title: 'Replace saved content?',
        text: `Importing “${file.name}” replaces everything saved in this browser. Export a backup first if you are unsure.`,
        confirmLabel: 'Import backup',
        tone: 'primary',
        onConfirm: () => {
          try {
            importJson(raw);
          } catch (error) {
            showError(error instanceof Error ? error.message : 'That backup could not be imported.');
          }
        },
      });
    } catch {
      showError('That file could not be read.');
    } finally {
      setImporting(false);
    }
  }

  function confirmReset() {
    swalConfirm({
      title: 'Reset all content?',
      text: 'Every change saved in this browser is removed and the original defaults are restored. This cannot be undone.',
      confirmLabel: 'Reset content',
      tone: 'danger',
      onConfirm: reset,
    });
  }

  return (
    <div className="space-y-4">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-card border border-line bg-surface p-5 shadow-sm">
        <div
          className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-primary/10 blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-accent-yellow/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Admin workspace
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{greeting}, Administrator.</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
              Everything students see is edited from here. You have{' '}
              <strong className="font-semibold text-foreground">
                {pendingAssumptions} assumption{pendingAssumptions === 1 ? '' : 's'}
              </strong>{' '}
              waiting for adviser review and{' '}
              <strong className="font-semibold text-foreground">
                {feedbackCount} feedback response{feedbackCount === 1 ? '' : 's'}
              </strong>{' '}
              saved in this browser.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <AdminButton variant="primary" size="sm" onClick={() => onNavigate('review')} icon={ArrowRight}>
                Review assumptions
              </AdminButton>
              <a href="/" className={adminButtonClass('secondary', 'sm')}>
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Open simulator
              </a>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4 self-start rounded-card border border-line bg-background/60 px-4 py-3 md:self-center">
            <div className="relative grid size-20 place-items-center">
              <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden="true">
                <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border)" strokeWidth="7" />
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 32}
                  strokeDashoffset={2 * Math.PI * 32 * (1 - reviewedPercent / 100)}
                />
              </svg>
              <span className="absolute text-lg font-semibold tabular">{reviewedPercent}%</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Review status</p>
              <p className="mt-0.5 text-sm font-semibold">
                {reviewedAssumptions} of {totalAssumptions} reviewed
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pendingAssumptions} still need sign-off
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Counts */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <AdminStatCard
            key={`${stat.id}-${stat.label}`}
            label={stat.label}
            hint={stat.hint}
            value={stat.value}
            icon={stat.icon}
            onClick={() => onNavigate(stat.id)}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <SectionCard
            title="Review status"
            description="How much of the engineering catalogue has been signed off."
            actions={
              <AdminBadge tone={pendingAssumptions ? 'warning' : 'success'}>
                {pendingAssumptions ? `${pendingAssumptions} need review` : 'All reviewed'}
              </AdminBadge>
            }
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-3xl font-semibold tracking-tight tabular">
                  {reviewedAssumptions}
                  <span className="ml-1 text-sm font-medium text-muted-foreground">
                    / {totalAssumptions}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  values reviewed. The rest are still placeholders.
                </p>
              </div>
              <p className="text-sm font-medium tabular text-muted-foreground">{reviewedPercent}%</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${reviewedPercent}%` }}
              />
            </div>
            <div className="mt-4">
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => onNavigate('review')}
                icon={ArrowRight}
              >
                Open assumptions review
              </AdminButton>
            </div>
          </SectionCard>

          <SectionCard
            title="Quick actions"
            description="Jump to the areas you change most often."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => onNavigate(action.id)}
                    className="group flex items-center gap-3 rounded-app border border-line bg-background/50 p-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-app bg-surface-2 text-muted-foreground group-hover:text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{action.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {action.hint}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          className="lg:col-span-2"
          title="Recent activity"
          description="Saves made from this browser."
          actions={<StatusBadge tone="live">Live</StatusBadge>}
        >
          <div className="-mx-3 divide-y divide-line">
            {activity.map((entry) => (
              <ActivityItem
                key={entry.id}
                avatar={entry.id === 'content-ready' ? 'QS' : 'AD'}
                name={entry.id === 'content-ready' ? 'System' : 'Administrator'}
                action={entry.title}
                meta={entry.detail}
                time={formatRelativeTime(entry.at)}
              />
            ))}
          </div>
          <p className="mt-2 border-t border-line pt-3 text-xs leading-5 text-muted-foreground">
            This feed is stored in this browser only. Export a backup before clearing site data.
          </p>
        </SectionCard>
      </div>

      {/* Storage & backup */}
      <SectionCard
        title="Storage & backup"
        description="Content is saved in this browser, not on a server."
        className="bg-surface/80"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-app border border-line bg-background/50 p-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
              <p className="text-sm font-medium">Saved locally</p>
              <StatusBadge tone="neutral" className="ml-auto">
                {storageSize}
              </StatusBadge>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Last saved
            </p>
            <p className="mt-1 text-sm font-medium">{formatAdminDate(content.updatedAt)}</p>
            <div className="mt-3 flex gap-2.5 rounded-app bg-surface-2 p-3 text-xs leading-5 text-muted-foreground">
              <HardDrive className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                A backup is a single JSON file. Keep one outside this browser before importing or
                resetting content.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={exportBackup}
              className="group flex items-center gap-3 rounded-app border border-line bg-background/50 p-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-app bg-surface-2 text-muted-foreground group-hover:text-primary">
                <Download className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Export backup</span>
                <span className="block text-xs text-muted-foreground">
                  Download every template, glossary entry and setting as JSON
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="group flex items-center gap-3 rounded-app border border-line bg-background/50 p-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-app bg-surface-2 text-muted-foreground group-hover:text-primary">
                <Upload className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Import backup</span>
                <span className="block text-xs text-muted-foreground">
                  Replace saved content from a JSON backup file
                </span>
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose a content backup"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void handleFile(file);
              }}
            />

            <button
              type="button"
              onClick={confirmReset}
              className="group flex items-center gap-3 rounded-app border border-danger/25 bg-danger/5 p-3 text-left transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-app bg-danger/10 text-danger">
                <RotateCcw className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-danger">Reset to defaults</span>
                <span className="block text-xs text-muted-foreground">
                  Remove every change saved in this browser
                </span>
              </span>
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2.5 border-t border-line pt-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>
            Imported files are validated before they replace anything. If one value is invalid, the
            whole import is refused and the current content stays untouched.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
