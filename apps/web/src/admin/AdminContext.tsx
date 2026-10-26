import { createContext, useContext, useState } from 'react';

import { contentRepository } from '@/content/repository';
import { contentIssues, type ContentIssue } from '@/content/schema';
import type { ContentDocument } from '@/content/types';

type AdminContentValue = {
  content: ContentDocument;
  notice: string | null;
  errors: ContentIssue[];
  commit: (next: ContentDocument) => ContentDocument;
  update: (recipe: (draft: ContentDocument) => void) => ContentDocument;
  importJson: (raw: string) => ContentDocument;
  reset: () => void;
  clearNotice: () => void;
};

const AdminContentContext = createContext<AdminContentValue | null>(null);

export function AdminContentProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState(() => contentRepository.getDocument());
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<ContentIssue[]>([]);

  function commit(next: ContentDocument): ContentDocument {
    try {
      const saved = contentRepository.replaceDocument(next);
      setContent(saved);
      setErrors([]);
      setNotice(`Saved at ${new Date().toLocaleTimeString()}. Reload the simulator to see the changes.`);
      return saved;
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        setErrors((error as { issues: ContentIssue[] }).issues);
      } else {
        setErrors([{ path: 'document', message: error instanceof Error ? error.message : 'Save failed.' }]);
      }
      setNotice(null);
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
    setNotice('Imported and saved. Reload the simulator to see the changes.');
    return saved;
  }

  function reset(): void {
    contentRepository.reset();
    window.location.reload();
  }

  return (
    <AdminContentContext.Provider
      value={{
        content,
        notice,
        errors,
        commit,
        update,
        importJson,
        reset,
        clearNotice: () => setNotice(null),
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
