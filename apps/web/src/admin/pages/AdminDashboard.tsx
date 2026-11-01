import {
  Activity,
  BookOpen,
  ChevronRight,
  Download,
  Flag,
  GraduationCap,
  HardDrive,
  LayoutTemplate,
  Palette,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

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
import { showExported } from '../adminToast';
import { SectionCard } from '../AdminForms';
import {
  ActivityItem,
  AdminButton,
  AdminStatCard,
  DraftBanner,
  StatusBadge,
} from '../AdminUI';

export function AdminDashboard({
  onNavigate,
  draftCount,
}: {
  onNavigate: (to: string) => void;
  draftCount: number;
}) {
  const { content, reset } = useAdminContent();
  const feedbackCount = readFeedback().length;

  const pendingAssumptions = BASE_ASSUMPTIONS.filter(
    (row) => content.assumptionReview.placeholder[row.id] ?? row.placeholder,
  ).length;

  const stats = [
    {
      id: 'live',
      label: 'Live site',
      value: 'Published',
      hint: 'Last published today, 12:56 AM',
      tone: 'live' as const,
    },
    {
      id: 'draft',
      label: 'Unpublished changes',
      value: String(draftCount > 0 ? draftCount : 0),
      hint: 'Engineering, Drift bands, Templates',
      tone: 'draft' as const,
    },
    {
      id: 'review',
      label: 'Needs adviser review',
      value: String(pendingAssumptions),
      hint: '0 approved so far',
      tone: 'needs-review' as const,
    },
    {
      id: 'feedback',
      label: 'New feedback',
      value: String(feedbackCount),
      hint: 'From simulator users',
      tone: 'neutral' as const,
    },
  ];

  const contentCards = [
    {
      id: 'floor-loads',
      label: 'Floor-load presets',
      hint: '4 uses · Office, Residential, Parking, Storage',
      updated: 'Edited just now',
      icon: Flag,
      navigateTo: 'engineering',
    },
    {
      id: 'templates',
      label: 'Templates',
      hint: '7 building templates',
      updated: 'Edited 2 hours ago',
      icon: LayoutTemplate,
      navigateTo: 'templates',
    },
    {
      id: 'drift',
      label: 'Drift bands',
      hint: '5 color bands',
      updated: 'Edited 2 hours ago',
      icon: Activity,
      navigateTo: 'drift',
    },
    {
      id: 'glossary',
      label: 'Glossary',
      hint: '15 terms',
      updated: 'Edited 3 days ago',
      icon: BookOpen,
      navigateTo: 'glossary',
    },
    {
      id: 'tour',
      label: 'Tour steps',
      hint: '5 steps in the how-to-use tour',
      updated: 'Edited 3 days ago',
      icon: GraduationCap,
      navigateTo: 'tour',
    },
    {
      id: 'welcome',
      label: 'Welcome steps',
      hint: '3 steps in the first-run dialog',
      updated: 'Edited 3 days ago',
      icon: Sparkles,
      navigateTo: 'tour',
    },
    {
      id: 'interface',
      label: 'Interface text',
      hint: '53 labels and messages',
      updated: 'Edited 5 days ago',
      icon: Palette,
      navigateTo: 'branding',
    },
    {
      id: 'backup',
      label: 'Backup & restore',
      hint: 'Save everything as one file, or load an earlier one.',
      updated: '',
      icon: HardDrive,
      navigateTo: undefined,
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
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm leading-5 text-muted-foreground">
          What is live, what is waiting, and what needs a decision.
        </p>
      </div>

      {/* Draft / needs-review banner */}
      {pendingAssumptions > 0 ? (
        <DraftBanner
          title={`${pendingAssumptions} assumptions are waiting for adviser review`}
          detail={
            'Floor-load values, the 25% live-load rule, the dead-load start value, and the code base. Publishing is allowed, but they stay marked “Needs review”.'
          }
          action={
            <AdminButton variant="primary" size="sm" onClick={() => onNavigate('review')}>
              Review now
            </AdminButton>
          }
        />
      ) : null}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <AdminStatCard
            key={stat.id}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            tone={stat.tone}
          />
        ))}
      </div>

      {/* Content & settings grid */}
      <SectionCard
        title="Content & settings"
        description="Click a card to edit"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {contentCards.map((card) => (
            <article
              key={card.id}
              className="group rounded-card border border-line bg-surface/50 p-4 hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => {
                if (card.navigateTo) onNavigate(card.navigateTo);
              }}
            >
              <div className="flex items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-app bg-surface-2 text-muted-foreground group-hover:text-primary">
                  {card.icon ? <card.icon className="size-4" aria-hidden="true" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{card.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
              {card.updated && (
                <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {card.updated}
                </p>
              )}
            </article>
          ))}
        </div>
      </SectionCard>

      {/* Recent activity + Storage & backup side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
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

        <SectionCard
          title="Storage & backup"
          description="Content is saved in this browser, not on a server."
        >
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
            <p className="text-sm font-medium">Saved in this browser only</p>
          </div>
          <p className="mt-3 text-sm leading-5 text-muted-foreground">
            Last saved today, 12:56 AM. Changes reach the simulator after it is reloaded. Clearing
            this browser's data erases them, so export a backup first.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={exportBackup}
              className="flex-1 group flex items-center gap-2 rounded-app border border-line bg-background/50 px-3 py-2 text-sm text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Download className="size-3.5" aria-hidden="true" />
              Export backup
            </button>
            <button
              type="button"
              onClick={confirmReset}
              className="flex-1 group flex items-center gap-2 rounded-app border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-left transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset to defaults
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
