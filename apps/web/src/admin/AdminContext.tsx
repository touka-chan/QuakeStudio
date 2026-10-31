import { createContext, useContext, useState } from 'react';

import { showError, showImported, showReset } from './adminToast';

import { contentRepository } from '@/content/repository';
import { contentIssues, type ContentIssue } from '@/content/schema';
import type { ContentDocument } from '@/content/types';

type AdminContentValue = {
  content: ContentDocument;
  errors: ContentIssue[];
  commit: (next: ContentDocument) => ContentDocument;
  update: (recipe: (draft: ContentDocument) => void) => ContentDocument;
  importJson: (raw: string) => ContentDocument;
  reset: () => void;
};

const AdminContentContext = createContext<AdminContentValue | null>(null);

export function AdminContentProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState(() => contentRepository.getDocument());
  const [errors, setErrors] = useState<ContentIssue[]>([]);

  function commit(next: ContentDocument): ContentDocument {
    try {
      const saved = contentRepository.replaceDocument(next);
      setContent(saved);
      setErrors([]);
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
    setContent(saved);
    setErrors([]);
    showImported();
    return saved;
  }

  function reset(): void {
    contentRepository.reset();
    showReset();
    window.location.reload();
  }

  return (
    <AdminContentContext.Provider
      value={{
        content,
        errors,
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
