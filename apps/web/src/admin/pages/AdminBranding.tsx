import React from 'react';
import { useEffect, useState } from 'react';

import { brandingSchema } from '@/content/schema';
import { LOGO_ICONS } from '@/content/types';
import { useAdminContent } from '../AdminContext';
import {
  AdminInput,
  AdminSelect,
  AdminTextarea,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';
import { AdminPageHeader } from '../AdminForms';

export function AdminBranding() {
  const { content, update, errors } = useAdminContent();
  const [draft, setDraft] = useState(content.branding);
  const [localErrors, setLocalErrors] = useState<ReturnType<typeof brandingSchema.safeParse>['error'] extends null ? never : any>([]);

  useEffect(() => setDraft(content.branding), [content.branding]);

  function issue(path: string) {
  <AdminPageHeader title="Branding" description="Admin content management." />
    return (
      localErrors.find((item: any) => item.path === path)?.message ||
      errors.find((item) => item.path === path)?.message
    );
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = brandingSchema.safeParse(draft);
    if (!parsed.success) {
      setLocalErrors(parsed.error.issues.map((item) => ({ path: item.path.join('.'), message: item.message })));
      return;
    }
    setLocalErrors([]);
    update((document) => {
      document.branding = parsed.data;
    });
  }

  return (
    <div>
      
      <form onSubmit={save} className="space-y-4">
        <IssueList issues={[...localErrors, ...errors]} />
        <SectionCard>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="App name" error={issue('appName')}>
              <AdminInput value={draft.appName} onChange={(e) => setDraft({ ...draft, appName: e.target.value })} />
            </Field>
            <Field label="Document title" error={issue('documentTitle')}>
              <AdminInput value={draft.documentTitle} onChange={(e) => setDraft({ ...draft, documentTitle: e.target.value })} />
            </Field>
          </div>
          <Field label="Meta description" error={issue('metaDescription')}>
            <AdminTextarea value={draft.metaDescription} onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })} />
          </Field>
          <Field label="Logo glyph" error={issue('logoIcon')}>
            <AdminSelect value={draft.logoIcon} onChange={(e) => setDraft({ ...draft, logoIcon: e.target.value as any })}>
              {LOGO_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Field label="Short disclaimer" error={issue('disclaimerShort')}>
            <AdminTextarea value={draft.disclaimerShort} onChange={(e) => setDraft({ ...draft, disclaimerShort: e.target.value })} />
          </Field>
          <Field label="Long disclaimer" error={issue('disclaimerLong')}>
            <AdminTextarea value={draft.disclaimerLong} onChange={(e) => setDraft({ ...draft, disclaimerLong: e.target.value })} />
          </Field>
        </SectionCard>
        <SaveButton>Save branding</SaveButton>
      </form>
    </div>
  );
}
