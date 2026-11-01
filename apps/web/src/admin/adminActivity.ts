import type { ContentDocument } from '@/content/types';

/*
 * A small, local audit trail for the dashboard's activity feed. It is written
 * by the content provider whenever a save succeeds, so the feed reflects what
 * actually happened in this browser rather than an invented history.
 */

export type AdminActivityKind = 'save' | 'publish' | 'import' | 'reset';

export type AdminActivity = {
  id: string;
  at: string;
  kind: AdminActivityKind;
  title: string;
  detail?: string;
};

const STORAGE_KEY = 'quakestudio.admin.activity.v1';
const PUBLISHED_KEY = 'quakestudio.admin.lastPublishedAt.v1';
const MAX_ENTRIES = 20;

const SECTION_LABELS: Record<string, string> = {
  branding: 'branding',
  copy: 'copy',
  engineering: 'engineering assumptions',
  templates: 'templates',
  defaultTemplateId: 'templates',
  glossary: 'glossary',
  tour: 'guided tour',
  welcome: 'welcome screen',
  driftBands: 'drift bands',
  features: 'feature flags',
  assumptionReview: 'assumption review',
};

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isActivity(value: unknown): value is AdminActivity {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<AdminActivity>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.at === 'string' &&
    (entry.kind === 'save' ||
      entry.kind === 'publish' ||
      entry.kind === 'import' ||
      entry.kind === 'reset') &&
    typeof entry.title === 'string'
  );
}

export function readActivity(): AdminActivity[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isActivity).sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}

export function logActivity(input: Omit<AdminActivity, 'id' | 'at'> & { at?: string }): AdminActivity {
  const entry: AdminActivity = {
    id: makeId(),
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    title: input.title,
    detail: input.detail,
  };
  if (typeof window === 'undefined') return entry;
  try {
    const next = [entry, ...readActivity()].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A full or blocked localStorage must not break the save that triggered it.
  }
  return entry;
}

/** Human-readable list of the top-level sections that changed between saves. */
export function describeChangedSections(
  previous: ContentDocument,
  next: ContentDocument,
): string[] {
  const labels = new Set<string>();
  const keys = Object.keys(next) as (keyof ContentDocument)[];
  for (const key of keys) {
    if (key === 'updatedAt' || key === 'schemaVersion') continue;
    if (JSON.stringify(previous[key]) === JSON.stringify(next[key])) continue;
    labels.add(SECTION_LABELS[key] ?? String(key));
  }
  return [...labels];
}

/** When the admin last pressed Publish, or null if that has not happened yet. */
export function readLastPublishedAt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PUBLISHED_KEY);
  } catch {
    return null;
  }
}

/** Reset the "unpublished changes" counter at this timestamp. */
export function markPublished(at = new Date().toISOString()): string {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PUBLISHED_KEY, at);
    } catch {
      // Publishing must not fail just because storage is blocked.
    }
  }
  return at;
}

/** Saves made after the last publish. */
export function countUnpublishedChanges(since: string | null): number {
  if (!since) return readActivity().filter((entry) => entry.kind === 'save').length;
  return readActivity().filter((entry) => entry.kind === 'save' && entry.at > since).length;
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(then));
}
