import { contentDocumentSchema } from './schema';
import { CONTENT_STORAGE_KEY, CONTENT_UPDATED_EVENT, type ContentDocument } from './types';

/* =========================================================================
   Browser storage adapter
   -------------------------------------------------------------------------
   Deliberately tiny and dependency-free. Config modules import this module,
   so it must not import the simulator or the repository. A missing value, a
   blocked storage API or corrupt JSON all produce `null` here; each caller
   then falls back to the values compiled into the app.
   ========================================================================= */

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The saved document, or null when nothing usable is stored.
 *
 * The WHOLE document is validated before any config module sees it. That is
 * deliberate: a half-valid save must not be allowed to change the solver's
 * inputs while another section silently falls back to defaults, because the
 * resulting mix would be impossible to reproduce or explain.
 */
export function readStoredContent(): ContentDocument | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(CONTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const result = contentDocumentSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** A storage read that also reports why a document was rejected. */
export function readStoredContentCheck():
  | { status: 'missing' }
  | { status: 'valid'; content: ContentDocument }
  | { status: 'invalid'; raw: string } {
  const store = storage();
  if (!store) return { status: 'missing' };
  try {
    const raw = store.getItem(CONTENT_STORAGE_KEY);
    if (!raw) return { status: 'missing' };
    const parsed: unknown = JSON.parse(raw);
    const result = contentDocumentSchema.safeParse(parsed);
    return result.success ? { status: 'valid', content: result.data } : { status: 'invalid', raw };
  } catch {
    return { status: 'invalid', raw: '' };
  }
}

export function writeStoredContent(content: ContentDocument): void {
  const store = storage();
  if (!store) throw new Error('This browser is not allowing local storage.');
  store.setItem(CONTENT_STORAGE_KEY, JSON.stringify(content));
  notifyContentChanged();
}

export function removeStoredContent(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(CONTENT_STORAGE_KEY);
  } finally {
    notifyContentChanged();
  }
}

function notifyContentChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONTENT_UPDATED_EVENT));
}

export function hasStoredContent(): boolean {
  return readStoredContent() !== null;
}
