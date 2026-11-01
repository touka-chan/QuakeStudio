import React from 'react';
import { useEffect, useState } from 'react';

import { brandingSchema } from '@/content/schema';
import { LOGO_ICONS } from '@/content/types';
import { useAdminContent } from '../AdminContext';
import { showSaved } from '../adminToast';
import {
  AdminInput,
  AdminSelect,
  AdminTextarea,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';

export function AdminBranding() {
  const { content, update, errors } = useAdminContent();
  const [draft, setDraft] = useState(content.branding);
  const [localErrors, setLocalErrors] = useState<{ path: string; message: string }[]>([]);

  useEffect(() => setDraft(content.branding), [content.branding]);

  function issue(path: string) {
    return (
      localErrors.find((item) => item.path === path)?.message ||
      errors.find((item) => item.path === path)?.message
    );
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = brandingSchema.safeParse(draft);
    if (!parsed.success) {
      setLocalErrors(
        parsed.error.issues.map((item) => ({
          path: item.path.join('.'),
          message: item.message,
        })),
      );
      return;
    }
    setLocalErrors([]);
    update((document) => {
      document.branding = parsed.data;
    });
    showSaved();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <IssueList issues={[...localErrors, ...errors]} />

      <SectionCard
        title="Identity"
        description="The name and icon students see across the app."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="App name" error={issue('appName')}>
            <AdminInput
              value={draft.appName}
              onChange={(event) => setDraft({ ...draft, appName: event.target.value })}
            />
          </Field>
          <Field label="Document title" error={issue('documentTitle')}>
            <AdminInput
              value={draft.documentTitle}
              onChange={(event) => setDraft({ ...draft, documentTitle: event.target.value })}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            label="Logo glyph"
            error={issue('logoIcon')}
            hint="Used in the app mark and install icon."
          >
            <AdminSelect
              value={draft.logoIcon}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  logoIcon: event.target.value as typeof draft.logoIcon,
                })
              }
            >
              {LOGO_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Field label="Meta description" error={issue('metaDescription')}>
            <AdminInput
              value={draft.metaDescription}
              onChange={(event) => setDraft({ ...draft, metaDescription: event.target.value })}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Disclaimers"
        description="Keep the educational-only message clear wherever it appears."
      >
        <div className="space-y-4">
          <Field label="Short disclaimer" error={issue('disclaimerShort')}>
            <AdminTextarea
              value={draft.disclaimerShort}
              onChange={(event) =>
                setDraft({ ...draft, disclaimerShort: event.target.value })
              }
              className="min-h-20"
            />
          </Field>
          <Field label="Long disclaimer" error={issue('disclaimerLong')}>
            <AdminTextarea
              value={draft.disclaimerLong}
              onChange={(event) =>
                setDraft({ ...draft, disclaimerLong: event.target.value })
              }
              className="min-h-32"
            />
          </Field>
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 shadow-sm">
        <p className="text-xs text-muted-foreground">
          Branding changes apply after the simulator reloads.
        </p>
        <SaveButton>Save branding</SaveButton>
      </div>
    </form>
  );
}
