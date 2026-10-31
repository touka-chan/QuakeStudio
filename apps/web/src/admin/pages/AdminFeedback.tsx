import { useState } from 'react';

import { clearFeedback, readFeedback } from '@/feedback/feedbackStorage';
import { downloadCsv } from '@/lib/csv';
import { swalAlert, swalConfirm } from '../adminSwal';
import { showDeleted, showExported } from '../adminToast';
import { SectionCard } from '../AdminForms';

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
      targetScore: 68,
      responses,
    };
    downloadCsv('quakestudio-sus-responses.json', JSON.stringify(payload, null, 2))
      .then(() => showExported(`Exported ${responses.length} response${responses.length === 1 ? '' : 's'}.`))
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

  const average = responses.length
    ? Math.round((responses.reduce((sum, item) => sum + item.score, 0) / responses.length) * 10) / 10
    : 0;

  return (
    <div>
      
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={refresh} className="rounded-app border border-line px-4 py-2 text-sm">
          Refresh
        </button>
        <button
          type="button"
          onClick={exportResponses}
          disabled={responses.length === 0}
          className="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Export responses
        </button>
        <button
          type="button"
          onClick={confirmClear}
          disabled={responses.length === 0}
          className="rounded-app border border-destructive/30 px-4 py-2 text-sm text-destructive disabled:opacity-50"
        >
          Clear all
        </button>
      </div>

      <SectionCard title="Summary">
        <p className="text-sm text-muted-foreground">
          {responses.length} response{responses.length === 1 ? '' : 's'} · average SUS score {average}
        </p>
      </SectionCard>

      <div className="mt-4 space-y-3">
        {responses.map((response, index) => (
          <SectionCard key={`${response.submittedAt}-${index}`} title={`Response ${index + 1}`}>
            <p className="text-sm text-muted-foreground">
              Submitted {response.submittedAt} · SUS {response.score}
            </p>
            {response.participantId ? <p className="mt-1 text-sm">Participant: {response.participantId}</p> : null}
            {response.comments ? <p className="mt-1 text-sm">{response.comments}</p> : null}
          </SectionCard>
        ))}
        {responses.length === 0 ? (
          <SectionCard>
            <p className="text-sm text-muted-foreground">No feedback saved in this browser yet.</p>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
