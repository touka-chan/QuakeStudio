import { contentDocumentSchema } from '@/content/schema';
import type { ContentDocument } from '@/content/types';

import { ApiError, apiFetch } from './client';

export type ApiContentStatus = 'draft' | 'published';

export type ApiContentEnvelope = {
  id: string;
  version: number;
  status: ApiContentStatus;
  document: ContentDocument;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string | null;
};

export type ApiContentState = {
  published: ApiContentEnvelope | null;
  draft: ApiContentEnvelope | null;
};

export type ApiContentVersionSummary = Omit<ApiContentEnvelope, 'document'>;

type RawEnvelope = Omit<ApiContentEnvelope, 'document'> & { document: unknown };
type RawState = { published: RawEnvelope | null; draft: RawEnvelope | null };

function parseEnvelope(raw: RawEnvelope): ApiContentEnvelope {
  const parsed = contentDocumentSchema.safeParse(raw.document);
  if (!parsed.success) {
    throw new ApiError(0, 'The local API returned content this build cannot read.');
  }
  return { ...raw, document: parsed.data };
}

function parseEnvelopeOrNull(raw: RawEnvelope | null): ApiContentEnvelope | null {
  return raw ? parseEnvelope(raw) : null;
}

export async function fetchPublishedContent(timeoutMs = 2_500): Promise<ApiContentEnvelope | null> {
  try {
    const raw = await apiFetch<RawEnvelope>('/content/published', { timeoutMs });
    return parseEnvelope(raw);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchAdminContentState(): Promise<ApiContentState> {
  const raw = await apiFetch<RawState>('/admin/content');
  return {
    published: parseEnvelopeOrNull(raw.published),
    draft: parseEnvelopeOrNull(raw.draft),
  };
}

/*
 * Draft writes are serialised. Without this, two quick saves can arrive out of
 * order and the older document wins. Publish waits for the queue, then sends
 * the document the admin is looking at, so an in-flight save cannot resurrect
 * a draft immediately after publishing.
 */
let draftQueue: Promise<unknown> = Promise.resolve();

function enqueueDraftSave(document: ContentDocument): Promise<ApiContentEnvelope> {
  const task = draftQueue.then(async () => {
    const raw = await apiFetch<RawEnvelope>('/admin/content/draft', {
      method: 'PUT',
      body: JSON.stringify({ document }),
    });
    return parseEnvelope(raw);
  });
  draftQueue = task.catch(() => undefined);
  return task;
}

export function saveDraftContent(document: ContentDocument): Promise<ApiContentEnvelope> {
  return enqueueDraftSave(document);
}

export async function publishContent(document: ContentDocument): Promise<ApiContentEnvelope> {
  await draftQueue;
  const raw = await apiFetch<RawEnvelope>('/admin/content/publish', {
    method: 'POST',
    body: JSON.stringify({ document }),
  });
  return parseEnvelope(raw);
}

export async function discardDraftContent(): Promise<void> {
  await draftQueue;
  await apiFetch<void>('/admin/content/draft', { method: 'DELETE' });
}

export async function restoreContentVersion(
  version: number,
  note?: string,
): Promise<ApiContentEnvelope> {
  await draftQueue;
  const raw = await apiFetch<RawEnvelope>(`/admin/content/versions/${version}/restore`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  });
  return parseEnvelope(raw);
}

export async function fetchContentVersions(
  limit = 50,
): Promise<{ items: ApiContentVersionSummary[]; total: number }> {
  return apiFetch<{ items: ApiContentVersionSummary[]; total: number }>(
    `/admin/content/versions?limit=${limit}`,
  );
}
