import { apiFetch } from './client';

export type ApiFeedback = {
  id: string;
  submittedAt: string;
  answers: Record<string, number>;
  score: number;
  comments: string | null;
  participantId: string | null;
  appVersion: string | null;
  contentVersion: number | null;
};

export type ApiSusSummary = {
  participants: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
  confidence95: number;
  interpretation: 'Excellent' | 'Good' | 'OK' | 'Poor' | 'Awful';
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  meetsTarget: boolean;
};

export type ApiFeedbackList = {
  items: ApiFeedback[];
  total: number;
  summary: ApiSusSummary | null;
};

export type SubmitFeedbackInput = {
  answers: Record<string, number>;
  comments?: string;
  participantId?: string;
  appVersion: string;
  contentVersion?: number;
};

export async function submitFeedbackToApi(input: SubmitFeedbackInput): Promise<ApiFeedback> {
  return apiFetch<ApiFeedback>('/feedback', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchAdminFeedback(): Promise<ApiFeedbackList> {
  return apiFetch<ApiFeedbackList>('/admin/feedback?limit=500');
}

export async function deleteFeedbackFromApi(id: string): Promise<void> {
  await apiFetch<void>(`/admin/feedback/${id}`, { method: 'DELETE' });
}

export async function clearFeedbackFromApi(): Promise<number> {
  const result = await apiFetch<{ deleted: number }>('/admin/feedback', { method: 'DELETE' });
  return result.deleted;
}

export async function exportFeedbackFromApi(): Promise<unknown> {
  return apiFetch<unknown>('/admin/feedback/export');
}
