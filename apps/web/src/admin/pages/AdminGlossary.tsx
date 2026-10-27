import { useState } from 'react';

import { glossaryEntrySchema } from '@/content/schema';
import { contentId, slugify } from '@/content/types';
import { useAdminContent } from '../AdminContext';
import {
  AdminInput,
  AdminTextarea,
  ConfirmDialog,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';
import { AdminPageHeader } from '../AdminForms';

export function AdminGlossary() {
  const { content, update } = useAdminContent();
  const [editing, setEditing] = useState<{ id: string; term: string; definition: string } | null>(null);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = content.glossary.filter((entry) =>
    `${entry.term} ${entry.definition}`.toLowerCase().includes(search.toLowerCase()),
  );

  function save() {
    if (!editing) return;
    const existing = content.glossary.some((entry) => entry.id === editing.id);
    const next = { ...editing, id: existing ? editing.id : slugify(editing.term) || editing.id };
    const parsed = glossaryEntrySchema.safeParse(next);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
      return;
    }
    const duplicate = content.glossary.some(
      (entry) => entry.id !== editing.id && entry.term.trim().toLowerCase() === editing.term.trim().toLowerCase(),
    );
    if (duplicate) {
      setErrors([{ path: 'term', message: 'This term already exists.' }]);
      return;
    }
    try {
      const existing = content.glossary.some((entry) => entry.id === editing.id);
      if (existing) {
        update((document) => {
          const index = document.glossary.findIndex((entry) => entry.id === editing.id);
          document.glossary[index] = parsed.data;
        });
      } else {
        update((document) => {
          document.glossary.push(parsed.data);
        });
      }
      setEditing(null);
      setErrors([]);
    } catch (error) {
      setErrors([{ path: 'document', message: error instanceof Error ? error.message : 'Save failed.' }]);
    }
  }

  function confirmDelete() {
    if (!deleteId) return;
    try {
      update((document) => {
        document.glossary = document.glossary.filter((entry) => entry.id !== deleteId);
      });
      setDeleteId(null);
    } catch (error) {
      setErrors([{ path: 'document', message: error instanceof Error ? error.message : 'Delete failed.' }]);
    }
  }

  <AdminPageHeader title="Glossary" description="Admin content management." />
  return (
    <div>
      <div className="mb-4">
        <button
          type="button"
          onClick={() => {
            setEditing({ id: contentId('glossary'), term: '', definition: '' });
            setErrors([]);
          }}
          className="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add entry
        </button>
      </div>

      <AdminInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search glossary" className="mb-4" />
      <IssueList issues={errors} />
      <div className="space-y-3">
        {filtered.map((entry) => (
          <SectionCard key={entry.id} title={entry.term}>
            <p className="text-sm text-muted-foreground">{entry.definition}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => { setEditing({ ...entry }); setErrors([]); }} className="rounded-app border border-line px-3 py-1.5 text-sm">
                Edit
              </button>
              <button type="button" onClick={() => setDeleteId(entry.id)} className="rounded-app border border-destructive/30 px-3 py-1.5 text-sm text-destructive">
                Delete
              </button>
            </div>
          </SectionCard>
        ))}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-card border border-line bg-surface p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Edit glossary entry</h2>
            <div className="mt-4 space-y-4">
              <Field label="Term" error={errors.find((e) => e.path === 'term')?.message}>
                <AdminInput value={editing.term} onChange={(e) => setEditing({ ...editing, term: e.target.value })} />
              </Field>
              <Field label="Definition" error={errors.find((e) => e.path === 'definition')?.message}>
                <AdminTextarea value={editing.definition} onChange={(e) => setEditing({ ...editing, definition: e.target.value })} />
              </Field>
            </div>
            <IssueList issues={errors} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-app border border-line px-4 py-2 text-sm">
                Cancel
              </button>
              <SaveButton onClick={save}>Save entry</SaveButton>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog open={Boolean(deleteId)} title="Delete glossary entry" description="This removes the term from the saved document." onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
