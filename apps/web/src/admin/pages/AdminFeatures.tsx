import React from 'react';
import { useEffect, useState } from 'react';

import { featuresSchema } from '@/content/schema';
import { useAdminContent } from '../AdminContext';
import {
  AdminInput,
  AdminSelect,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';

export function AdminFeatures() {
  const { content, update, errors } = useAdminContent();
  const [draft, setDraft] = useState(content.features);
  const [localErrors, setLocalErrors] = useState<{ path: string; message: string }[]>([]);

  useEffect(() => setDraft(content.features), [content.features]);

  function issue(path: string) {
    return localErrors.find((item) => item.path === path)?.message || errors.find((item) => item.path === path)?.message;
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = featuresSchema.safeParse(draft);
    if (!parsed.success) {
      setLocalErrors(parsed.error.issues.map((item) => ({ path: item.path.join('.'), message: item.message })));
      return;
    }
    setLocalErrors([]);
    update((document) => {
      document.features = parsed.data;
    });
  }

  function toggle(key: keyof typeof draft) {
    setDraft({ ...draft, [key]: !draft[key] } as any);
  }

  return (
    <div>
      
      <form onSubmit={save} className="space-y-4">
        <IssueList issues={[...localErrors, ...errors]} />
        <SectionCard title="Capabilities">
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ['compareEnabled', 'Comparison mode'],
                ['feedbackEnabled', 'Usability feedback'],
                ['installPromptEnabled', 'Install prompt'],
                ['savedRunsEnabled', 'Saved runs'],
                ['csvExportEnabled', 'CSV export'],
                ['welcomeEnabled', 'Welcome gate'],
                ['tourEnabled', 'Guided tour'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(draft[key])} onChange={() => toggle(key)} />
                {label}
              </label>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Limits">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Max buildings" error={issue('maxBuildings')}>
              <AdminInput type="number" value={draft.maxBuildings} onChange={(e) => setDraft({ ...draft, maxBuildings: Number(e.target.value) })} />
            </Field>
            <Field label="Max side by side" error={issue('maxSideBySide')}>
              <AdminInput type="number" value={draft.maxSideBySide} onChange={(e) => setDraft({ ...draft, maxSideBySide: Number(e.target.value) })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.defaultCutaway} onChange={() => setDraft({ ...draft, defaultCutaway: !draft.defaultCutaway })} />
              Default cutaway view
            </label>
            <Field label="Default compare view" error={issue('defaultCompareView')}>
              <AdminSelect value={draft.defaultCompareView} onChange={(e) => setDraft({ ...draft, defaultCompareView: e.target.value as any })}>
                <option value="sideBySide">Side by side</option>
                <option value="ghost">Ghost</option>
              </AdminSelect>
            </Field>
          </div>
        </SectionCard>
        <SaveButton>Save features</SaveButton>
      </form>
    </div>
  );
}
