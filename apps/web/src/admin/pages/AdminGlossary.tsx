import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { glossaryEntrySchema } from '@/content/schema';
import { contentId, slugify } from '@/content/types';
import { useAdminContent } from '../AdminContext';
import { swalConfirm } from '../adminSwal';
import { showSaved, showDeleted } from '../adminToast';
import {
  AdminInput,
  AdminTextarea,
  Field,
  IssueList,
  SaveButton,
} from '../AdminForms';
import {
  AdminButton,
  AdminEditPanel,
  AdminEmptyState,
  AdminSearchInput,
} from '../AdminUI';

export function AdminGlossary() {
  const { content, update } = useAdminContent();
  const [editing, setEditing] = useState<{ id: string; term: string; definition: string } | null>(
    null,
  );
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = content.glossary.filter((entry) =>
    `${entry.term} ${entry.definition}`.toLowerCase().includes(query),
  );
  const editingExisting = editing
    ? content.glossary.some((entry) => entry.id === editing.id)
    : false;

  function openNew() {
    setEditing({ id: contentId('glossary'), term: '', definition: '' });
    setErrors([]);
  }

  function closeEditor() {
    setEditing(null);
    setErrors([]);
  }

  function save() {
    if (!editing) return;
    const existing = content.glossary.some((entry) => entry.id === editing.id);
    const next = { ...editing, id: existing ? editing.id : slugify(editing.term) || editing.id };
    const parsed = glossaryEntrySchema.safeParse(next);
    if (!parsed.success) {
      setErrors(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
      return;
    }
    const duplicate = content.glossary.some(
      (entry) =>
        entry.id !== editing.id &&
        entry.term.trim().toLowerCase() === editing.term.trim().toLowerCase(),
    );
    if (duplicate) {
      setErrors([{ path: 'term', message: 'This term already exists.' }]);
      return;
    }
    try {
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
      closeEditor();
      showSaved();
    } catch (error) {
      setErrors([
        { path: 'document', message: error instanceof Error ? error.message : 'Save failed.' },
      ]);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <AdminSearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder="Search terms and definitions"
          ariaLabel="Search glossary"
          className="w-full sm:max-w-sm"
        />
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {content.glossary.length} entries
          </p>
          <AdminButton variant="primary" icon={Plus} onClick={openNew}>
            New entry
          </AdminButton>
        </div>
      </div>

      <IssueList issues={errors} />

      {filtered.length === 0 ? (
        query ? (
          <AdminEmptyState
            icon={BookOpen}
            title="No matching entries"
            description={`Nothing matches “${search.trim()}”. Try another word or clear the search.`}
            action={
              <AdminButton onClick={() => setSearch('')} variant="secondary">
                Clear search
              </AdminButton>
            }
          />
        ) : (
          <AdminEmptyState
            icon={BookOpen}
            title="No glossary entries yet"
            description="Add the terms students will see in the glossary panel."
            action={
              <AdminButton variant="primary" icon={Plus} onClick={openNew}>
                Add the first entry
              </AdminButton>
            }
          />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <article
              key={entry.id}
              className="group flex flex-col rounded-card border border-line bg-surface p-4 shadow-sm transition-colors hover:border-primary/30"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-app bg-primary/10 text-sm font-semibold uppercase text-primary"
                  aria-hidden="true"
                >
                  {entry.term.charAt(0)}
                </span>
                <h2 className="mt-1 min-w-0 text-sm font-semibold leading-5 tracking-tight">
                  {entry.term}
                </h2>
              </div>
              <p className="mt-2.5 line-clamp-4 text-sm leading-6 text-muted-foreground">
                {entry.definition}
              </p>
              <div className="mt-auto flex items-center gap-1 pt-4">
                <AdminButton
                  size="sm"
                  variant="ghost"
                  icon={Pencil}
                  className="text-muted-foreground"
                  onClick={() => {
                    setEditing({ ...entry });
                    setErrors([]);
                  }}
                >
                  Edit
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  className="ml-auto text-danger hover:bg-danger/10 hover:text-danger"
                  onClick={() => {
                    swalConfirm({
                      title: 'Delete glossary entry',
                      text: `Remove "${entry.term}" from the saved document.`,
                      confirmLabel: 'Delete',
                      onConfirm: () => {
                        try {
                          update((document) => {
                            document.glossary = document.glossary.filter(
                              (item) => item.id !== entry.id,
                            );
                          });
                          showDeleted('Glossary entry');
                        } catch (error) {
                          setErrors([
                            {
                              path: 'document',
                              message: error instanceof Error ? error.message : 'Delete failed.',
                            },
                          ]);
                        }
                      },
                    });
                  }}
                >
                  Delete
                </AdminButton>
              </div>
            </article>
          ))}
        </div>
      )}

      <AdminEditPanel
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        title={editingExisting ? 'Edit glossary entry' : 'New glossary entry'}
        subtitle="Use plain language that a high school student would understand."
        footer={
          <>
            <AdminButton onClick={closeEditor}>Cancel</AdminButton>
            <SaveButton onClick={save}>Save entry</SaveButton>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4 pt-3">
            <Field label="Term" error={errors.find((error) => error.path === 'term')?.message}>
              <AdminInput
                value={editing.term}
                onChange={(event) => setEditing({ ...editing, term: event.target.value })}
                autoFocus
              />
            </Field>
            <Field
              label="Definition"
              error={errors.find((error) => error.path === 'definition')?.message}
            >
              <AdminTextarea
                value={editing.definition}
                onChange={(event) => setEditing({ ...editing, definition: event.target.value })}
                className="min-h-40"
              />
            </Field>
            <IssueList issues={errors.filter((error) => error.path === 'document')} />
          </div>
        ) : null}
      </AdminEditPanel>
    </div>
  );
}
