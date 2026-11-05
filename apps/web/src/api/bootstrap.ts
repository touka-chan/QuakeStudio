import { contentDocumentSchema } from '@/content/schema';
import { readStoredContent, writeStoredContent } from '@/content/storage';

import { fetchPublishedContent } from './content';
import { apiRequestTimeoutMs, isBackendEnabled } from './config';

/*
 * When an API is enabled, mirror the latest published document into browser
 * storage. Content modules read storage when they are imported, so if the
 * document changed the page reloads once and the simulator starts with the
 * server copy. If the API is not reachable, the existing localStorage or
 * compiled defaults remain in place and the app still opens immediately.
 *
 * Admin pages skip this: their provider loads the draft, and overwriting the
 * browser copy with published content would hide unsaved local work.
 */
export async function syncPublishedContent(): Promise<void> {
  if (!isBackendEnabled()) return;
  if (window.location.pathname.startsWith('/admin')) return;

  try {
    const envelope = await fetchPublishedContent(apiRequestTimeoutMs());
    if (!envelope) return;
    const parsed = contentDocumentSchema.safeParse(envelope.document);
    if (!parsed.success) return;

    const current = readStoredContent();
    if (current && JSON.stringify(current) === JSON.stringify(parsed.data)) return;

    writeStoredContent(parsed.data);
    window.location.reload();
  } catch {
    // A missing API is not an app error. Keep the cached/default content.
  }
}
