import {
  ClipboardCheck,
  Download,
  ExternalLink,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { clearFeedback, readFeedback } from '@/feedback/feedbackStorage';
import { gradeSus, interpretSus, SUS_TARGET_SCORE } from '@/feedback/susScore';
import { downloadCsv } from '@/lib/csv';
import { swalAlert, swalConfirm } from '../adminSwal';
import { showDeleted, showExported } from '../adminToast';
import { SectionCard } from '../AdminForms';
import {
  adminButtonClass,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  formatAdminDate,
} from '../AdminUI';

function scoreTone(score: number) {
  if (score >= SUS_TARGET_SCORE) return 'success' as const;
  if (score >= 51.7) return 'warning' as const;
  return 'danger' as const;
}

function scoreCircleClass(score: number) {
  if (score >= SUS_TARGET_SCORE) return 'bg-primary/10 text-primary ring-primary/20';
  if (score >= 51.7) return 'bg-warning-bg text-warning-text ring-warning/25';
  return 'bg-danger/10 text-danger ring-danger/25';
}

export function AdminFeedback() {
  const [responses, setResponses] = useState(() => readFeedback());

  function refresh() {
    setResponses(readFeedback());
  }

  function exportResponses() {
    const payload = {
      format: 'quakestudio-sus',
      version: 1,
      exportedAt: new Date().toISOString(),
      targetScore: SUS_TARGET_SCORE,
      responses,
    };
    downloadCsv('quakestudio-sus-responses.json', JSON.stringify(payload, null, 2))
      .then(() =>
        showExported(`Exported ${responses.length} response${responses.length === 1 ? '' : 's'}.`),
      )
      .catch((error: unknown) => {
        swalAlert({
          title: 'Export failed',
          text: error instanceof Error ? error.message : 'The responses could not be exported.',
          icon: 'error',
        });
      });
  }

  function confirmClear() {
    swalConfirm({
      title: 'Clear feedback',
      text: 'This removes all saved SUS responses from this browser.',
      confirmLabel: 'Clear all',
      onConfirm: () => {
        clearFeedback();
        setResponses([]);
        showDeleted('Feedback responses');
      },
    });
  }

  const sorted = [...responses].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const average = responses.length
    ? Math.round((responses.reduce((sum, item) => sum + item.score, 0) / responses.length) * 10) / 10
    : null;
  const meetsTarget = average !== null && average >= SUS_TARGET_SCORE;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Saved responses</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {responses.length} response{responses.length === 1 ? '' : 's'} stored in this browser.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton icon={RefreshCw} onClick={refresh}>
            Refresh
          </AdminButton>
          <AdminButton
            variant="primary"
            icon={Download}
            onClick={exportResponses}
            disabled={responses.length === 0}
          >
            Export JSON
          </AdminButton>
          <AdminButton
            variant="danger"
            icon={Trash2}
            onClick={confirmClear}
            disabled={responses.length === 0}
          >
            Clear all
          </AdminButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Responses</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{responses.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Saved on this device</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Average SUS</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {average === null ? '—' : average}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {average === null ? 'No scores yet' : interpretSus(average)}
          </p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Target score</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-2xl font-semibold tracking-tight">{SUS_TARGET_SCORE}</p>
            <AdminBadge tone={average === null ? 'neutral' : meetsTarget ? 'success' : 'warning'}>
              {average === null ? 'No data' : meetsTarget ? 'Met' : 'Below'}
            </AdminBadge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Classroom benchmark</p>
        </div>
      </div>

      <SectionCard
        className="mt-4"
        title="Response log"
        description="Newest responses appear first. Scores are calculated when a response is submitted."
      >
        {sorted.length === 0 ? (
          <AdminEmptyState
            icon={ClipboardCheck}
            title="No feedback yet"
            description="Open the simulator, submit a SUS response, then refresh this page."
            action={
              <a href="/" className={adminButtonClass('secondary', 'md')}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Open simulator
              </a>
            }
          />
        ) : (
          <div className="space-y-3">
            {sorted.map((response, index) => (
              <div
                key={`${response.submittedAt}-${index}`}
                className="rounded-app border border-line bg-background/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ring-1 ${scoreCircleClass(response.score)}`}
                    >
                      {Math.round(response.score)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        Response {sorted.length - index}
                        {response.participantId ? (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · {response.participantId}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatAdminDate(response.submittedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AdminBadge tone={scoreTone(response.score)}>
                      {interpretSus(response.score)}
                    </AdminBadge>
                    <AdminBadge>{gradeSus(response.score)}</AdminBadge>
                  </div>
                </div>
                {response.comments ? (
                  <p className="mt-3 rounded-app bg-surface-2 p-3 text-sm leading-6 text-foreground">
                    “{response.comments}”
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
