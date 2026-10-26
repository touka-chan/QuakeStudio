import type { SusResponse } from './FeedbackDialog';

const STORAGE_KEY = 'quakestudio.feedback';

export function readFeedback(): SusResponse[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SusResponse[]) : [];
  } catch {
    return [];
  }
}

export function appendFeedback(response: SusResponse): void {
  try {
    const current = readFeedback();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, response]));
  } catch {
    // Ignore blocked storage; the response still exists in the dialog session.
  }
}

export function clearFeedback(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore blocked storage.
  }
}
