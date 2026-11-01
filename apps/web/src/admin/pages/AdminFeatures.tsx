import React from 'react';
import { useEffect, useState } from 'react';

import { featuresSchema } from '@/content/schema';
import { useAdminContent } from '../AdminContext';
import { showSaved } from '../adminToast';
import {
  AdminInput,
  AdminSelect,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';
import { AdminSwitchRow } from '../AdminUI';

const CAPABILITIES = [
  {
    key: 'compareEnabled',
    label: 'Comparison mode',
    description: 'Let students compare buildings side by side.',
  },
  {
    key: 'feedbackEnabled',
    label: 'Usability feedback',
    description: 'Show the SUS feedback dialog in the simulator.',
  },
  {
    key: 'installPromptEnabled',
    label: 'Install prompt',
    description: 'Offer the installable web app prompt.',
  },
  {
    key: 'savedRunsEnabled',
    label: 'Saved runs',
    description: 'Keep previous runs in local storage.',
  },
  {
    key: 'csvExportEnabled',
    label: 'CSV export',
    description: 'Allow students to download results as a CSV file.',
  },
  {
    key: 'welcomeEnabled',
    label: 'Welcome gate',
    description: 'Show the welcome screen before the simulator opens.',
  },
  {
    key: 'tourEnabled',
    label: 'Guided tour',
    description: 'Show the tour launcher and walkthrough.',
  },
] as const;

export function AdminFeatures() {
  const { content, update, errors } = useAdminContent();
  const [draft, setDraft] = useState(content.features);
  const [localErrors, setLocalErrors] = useState<{ path: string; message: string }[]>([]);

  useEffect(() => setDraft(content.features), [content.features]);

  function issue(path: string) {
    return (
      localErrors.find((item) => item.path === path)?.message ||
      errors.find((item) => item.path === path)?.message
    );
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = featuresSchema.safeParse(draft);
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
      document.features = parsed.data;
    });
    showSaved();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="rounded-app border border-line bg-surface-2 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
        These switches apply the next time the simulator loads.
      </div>

      <IssueList issues={[...localErrors, ...errors]} />

      <SectionCard
        title="Capabilities"
        description="Choose which parts of the simulator students can use."
      >
        <div className="grid gap-2 md:grid-cols-2">
          {CAPABILITIES.map((capability) => (
            <AdminSwitchRow
              key={capability.key}
              label={capability.label}
              description={capability.description}
              checked={Boolean(draft[capability.key])}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, [capability.key]: checked })
              }
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Limits and defaults" description="Guardrails for comparison and saved work.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Max buildings" error={issue('maxBuildings')}>
            <AdminInput
              type="number"
              value={draft.maxBuildings}
              onChange={(event) =>
                setDraft({ ...draft, maxBuildings: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="Max side by side" error={issue('maxSideBySide')}>
            <AdminInput
              type="number"
              value={draft.maxSideBySide}
              onChange={(event) =>
                setDraft({ ...draft, maxSideBySide: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="Default compare view" error={issue('defaultCompareView')}>
            <AdminSelect
              value={draft.defaultCompareView}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  defaultCompareView: event.target.value as typeof draft.defaultCompareView,
                })
              }
            >
              <option value="sideBySide">Side by side</option>
              <option value="ghost">Ghost</option>
            </AdminSelect>
          </Field>
          <AdminSwitchRow
            label="Default cutaway view"
            description="Start new buildings with the cutaway view enabled."
            checked={draft.defaultCutaway}
            onCheckedChange={(checked) => setDraft({ ...draft, defaultCutaway: checked })}
          />
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton>Save features</SaveButton>
      </div>
    </form>
  );
}
