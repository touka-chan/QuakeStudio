import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { describeChangedSections, logActivity } from './adminActivity';
import { showError, showImported, showReset } from './adminToast';

import { fetchAdminFeedback } from '@/api/feedback';
import { fetchAdminContentState, discardDraftContent, saveDraftContent } from '@/api/content';
import { buildDefaultContent } from '@/content/defaults';
import { contentRepository } from '@/content/repository';
import { contentIssues, type ContentIssue } from '@/content/schema';
import { writeStoredContent } from '@/content/storage';
import type { ContentDocument } from '@/content/types';
import { readFeedback } from '@/feedback/feedbackStorage';

type AdminContentValue = {
  content: ContentDocument;
  errors: ContentIssue[];
  backendEnabled: boolean;
  feedbackCount: number;
  refreshFeedback: () => Promise<void>;
  commit: (next: ContentDocument) => ContentDocument;
  update: (recipe: (draft: ContentDocument) => void) => ContentDocument;
  importJson: (raw: string) => ContentDocument;
  reset: () => Promise<void>;
};

const AdminContentContext = createContext<AdminContentValue | null>(null);

export function AdminContentProvider({
  children,
  backendEnabled,
}: {
  children: React.ReactNode;
  backendEnabled: boolean;
}) {
  const [content, setContent] = useState(() => contentRepository.getDocument());
  const [errors, setErrors] = useState<ContentIssue[]>([]);
  const [feedbackCount, setFeedbackCount] = useState(() => readFeedback().length);

  const refreshFeedback = useCallback(async () => {
    if (!backendEnabled) {
      setFeedbackCount(readFeedback().length);
      return;
    }
    try {
      const result = await fetchAdminFeedback();
      setFeedbackCount(result.total);
    } catch {
      // Keep the local mirrored count if the API is momentarily unavailable.
    }
  }, [backendEnabled]);

  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchAdminFeedback();
        if (!cancelled) setFeedbackCount(result.total);
      } catch {
        // Keep the local mirrored count if the API is momentarily unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backendEnabled]);

  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;

    void (async () => {
      try {
        const state = await fetchAdminContentState();
        if (cancelled) return;
        const source = state.draft ?? state.published;
        if (!source) return;
        writeStoredContent(source.document);
        setContent(source.document);
      } catch (error) {
        if (cancelled) return;
        showError(
          error instanceof Error
            ? `Could not load server content: ${error.message}`
            : 'Could not load content from the local API. Using this browser copy.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backendEnabled]);

  function syncDraft(saved: ContentDocument): void {
    if (!backendEnabled) return;
    void saveDraftContent(saved).catch((error: unknown) => {
      showError(
        error instanceof Error
          ? `Saved in this browser, but the local API rejected it: ${error.message}`
          : 'Saved in this browser, but the local API did not accept it.',
      );
    });
  }

  function commit(next: ContentDocument): ContentDocument {
    try {
      const saved = contentRepository.replaceDocument(next);
      const changed = describeChangedSections(content, saved);
      logActivity({
        kind: 'save',
        title: changed.length > 0 ? `Updated ${changed.join(', ')}` : 'Saved content',
        detail: backendEnabled ? 'Saved to the local draft' : 'Saved in this browser',
        at: saved.updatedAt,
      });
      setContent(saved);
      setErrors([]);
      syncDraft(saved);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed.';
      if (error instanceof Error && 'issues' in error) {
        setErrors((error as { issues: ContentIssue[] }).issues);
      } else {
        setErrors([{ path: 'document', message }]);
      }
      showError(message);
      throw error;
    }
  }

  function update(recipe: (draft: ContentDocument) => void): ContentDocument {
    const draft = structuredClone(content);
    recipe(draft);
    return commit(draft);
  }

  function importJson(raw: string): ContentDocument {
    const saved = contentRepository.importJson(raw);
    logActivity({
      kind: 'import',
      title: 'Imported a content backup',
      detail: backendEnabled
        ? 'Replaced the local draft and queued it for the API'
        : 'Replaced the content saved in this browser',
      at: saved.updatedAt,
    });
    setContent(saved);
    setErrors([]);
    syncDraft(saved);
    showImported();
    return saved;
  }

  async function reset(): Promise<void> {
    // Do the remote work first. If it fails, the browser copy and the admin
    // screen still describe the same content; resetting locally first would
    // leave the UI showing old values after an error.
    if (backendEnabled) {
      try {
        await discardDraftContent();
        await saveDraftContent(buildDefaultContent());
      } catch (error) {
        showError(
          error instanceof Error
            ? `The local API could not reset the draft: ${error.message}`
            : 'The local API could not reset the draft.',
        );
        return;
      }
    }

    contentRepository.reset();
    logActivity({ kind: 'reset', title: 'Reset content to defaults' });
    showReset();
    window.location.reload();
  }

  return (
    <AdminContentContext.Provider
      value={{
        content,
        errors,
        backendEnabled,
        feedbackCount,
        refreshFeedback,
        commit,
        update,
        importJson,
        reset,
      }}
    >
      {children}
    </AdminContentContext.Provider>
  );
}

export function useAdminContent(): AdminContentValue {
  const value = useContext(AdminContentContext);
  if (!value) throw new Error('useAdminContent must be used inside AdminContentProvider.');
  return value;
}

export { contentIssues };
