import { SUS_ITEMS, SUS_SCALE } from '@/feedback/susItems';
import { gradeSus, interpretSus, SUS_TARGET_SCORE } from '@/feedback/susScore';

import type { XlsxCell, XlsxSheet } from './xlsx';

/* =========================================================================
   SUS responses → Excel workbook
   -------------------------------------------------------------------------
   One sheet of responses and one legend sheet for the 1–5 scale. Answers are
   written as numbers, not as their labels: the file is for analysis, and a
   column of "Strongly agree" cannot be averaged, sorted or charted.

   The response sheet is the same data the admin review dialog shows, so the
   download and the screen cannot disagree about a score.
   ========================================================================= */

export type FeedbackExportResponse = {
  submittedAt: string;
  answers: Readonly<Record<string, number | undefined>>;
  score: number;
  comments?: string | null;
  participantId?: string | null;
  appVersion?: string | null;
  contentVersion?: number | null;
};

export type FeedbackExportPayload = {
  exportedAt?: string;
  targetScore?: number;
  responses: FeedbackExportResponse[];
};

function answerValue(answers: FeedbackExportResponse['answers'], item: number): number | null {
  const value = answers[String(item)];
  return typeof value === 'number' && value >= 1 && value <= 5 ? value : null;
}

export function buildFeedbackSheets(payload: FeedbackExportPayload): XlsxSheet[] {
  const responseRows: XlsxCell[][] = [
    [
      'Submitted at',
      'Participant ID',
      'SUS score',
      'Interpretation',
      'Grade',
      'Comments',
      'App version',
      'Content version',
      ...SUS_ITEMS.map((item) => `Q${item.number}`),
    ],
    ...payload.responses.map((response) => [
      response.submittedAt,
      response.participantId ?? '',
      response.score,
      interpretSus(response.score),
      gradeSus(response.score),
      response.comments ?? '',
      response.appVersion ?? '',
      response.contentVersion ?? '',
      ...SUS_ITEMS.map((item) => answerValue(response.answers, item.number)),
    ]),
  ];

  const summaryRows: XlsxCell[][] = [
    ['QuakeStudio usability responses'],
    ['Instrument', 'System Usability Scale — Bangor, Kortum & Miller (2008)'],
    ['Exported at', payload.exportedAt ?? new Date().toISOString()],
    ['Target score', payload.targetScore ?? SUS_TARGET_SCORE],
    ['Responses', payload.responses.length],
  ];

  const scaleRows: XlsxCell[][] = [
    ['Value', 'Label'],
    ...SUS_SCALE.map((label, index) => [index + 1, label]),
  ];

  return [
    { name: 'Summary', rows: summaryRows },
    { name: 'Responses', rows: responseRows },
    { name: 'Scale', rows: scaleRows },
  ];
}

export function feedbackExportFilename(): string {
  return 'quakestudio-sus-responses.xlsx';
}
