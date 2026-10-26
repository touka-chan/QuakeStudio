import { useEffect, useState } from 'react';

import { z } from 'zod';
import { templateContentSchema } from '@/content/schema';
import { contentId } from '@/content/types';
import { MATERIAL_IDS, FRAME_TYPE_IDS } from '@/content/types';
import { useAdminContent } from '../AdminContext';
import {
  AdminInput,
  AdminSelect,
  AdminTextarea,
  ConfirmDialog,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';

const EMPTY_TEMPLATE = {
  id: '',
  label: '',
  description: '',
  building: {
    floors: 5,
    floorHeightM: 3,
    widthM: 14,
    depthM: 10,
    material: 'concrete' as const,
    frameType: 'moment' as const,
  },
};

type TemplateDraft = z.infer<typeof templateContentSchema>;

export function AdminTemplates() {
  const { content, update } = useAdminContent();
  const [editing, setEditing] = useState<TemplateDraft | null>(null);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    // Keep the draft in sync only when opening; edits should not be clobbered.
  }, [editing]);

  const geometry = content.engineering.geometry;

  function validate(draft: TemplateDraft) {
    const parsed = templateContentSchema.safeParse(draft);
    if (!parsed.success) {
      return parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    }
    const issues: { path: string; message: string }[] = [];
    if (draft.building.floors < geometry.minFloors || draft.building.floors > geometry.maxFloors) {
      issues.push({ path: 'building.floors', message: `Must be ${geometry.minFloors}–${geometry.maxFloors}.` });
    }
    for (const field of ['floorHeightM', 'widthM', 'depthM'] as const) {
      const range = geometry[field];
      const value = draft.building[field];
      if (value < range.min || value > range.max) {
        issues.push({ path: `building.${field}`, message: `Must be ${range.min}–${range.max}.` });
      }
    }
    return issues;
  }

  function saveTemplate() {
    if (!editing) return;
    const issues = validate(editing);
    if (issues.length) {
      setErrors(issues);
      return;
    }
    const draft = { ...editing };
    const existing = content.templates.find((item) => item.id === draft.id);
    try {
      if (existing) {
        update((document) => {
          const index = document.templates.findIndex((item) => item.id === draft.id);
          document.templates[index] = draft;
        });
      } else {
        update((document) => {
          document.templates.push(draft);
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
        document.templates = document.templates.filter((item) => item.id !== deleteId);
      });
      setDeleteId(null);
    } catch (error) {
      setErrors([{ path: 'document', message: error instanceof Error ? error.message : 'Delete failed.' }]);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <button
          type="button"
          onClick={() => {
            setEditing({ ...EMPTY_TEMPLATE, id: contentId('tpl') });
            setErrors([]);
          }}
          className="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add template
        </button>
      </div>

      <IssueList issues={errors} />

      <div className="mb-4 rounded-app border border-line bg-surface p-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Startup template</span>
          <AdminSelect
            value={content.defaultTemplateId}
            onChange={(event) => {
              try {
                update((document) => {
                  document.defaultTemplateId = event.target.value;
                });
              } catch (error) {
                setErrors([{ path: 'defaultTemplateId', message: error instanceof Error ? error.message : 'Update failed.' }]);
              }
            }}
          >
            {content.templates
              .filter((item) => item.id !== 'custom')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
          </AdminSelect>
        </label>
      </div>

      <div className="space-y-3">
        {content.templates.map((template) => (
          <SectionCard key={template.id} title={template.label} description={template.description}>
            <p className="text-sm text-muted-foreground">
              {template.building.floors} floors · {template.building.widthM}×{template.building.depthM} m · {template.building.material} · {template.building.frameType}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing({ ...template });
                  setErrors([]);
                }}
                className="rounded-app border border-line px-3 py-1.5 text-sm"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setDeleteId(template.id)}
                className="rounded-app border border-destructive/30 px-3 py-1.5 text-sm text-destructive"
                disabled={template.id === 'custom' || template.id === content.defaultTemplateId}
              >
                Delete
              </button>
            </div>
          </SectionCard>
        ))}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-card border border-line bg-surface p-5 shadow-lg">
            <h2 className="text-lg font-semibold">{content.templates.some((item) => item.id === editing.id) ? 'Edit template' : 'Add template'}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Label" error={errors.find((e) => e.path === 'label')?.message}>
                <AdminInput value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </Field>
              <Field label="Description" error={errors.find((e) => e.path === 'description')?.message}>
                <AdminTextarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </Field>
              <Field label="Floors" error={errors.find((e) => e.path === 'building.floors')?.message}>
                <AdminInput type="number" value={editing.building.floors} onChange={(e) => setEditing({ ...editing, building: { ...editing.building, floors: Number(e.target.value) } })} />
              </Field>
              <Field label="Floor height (m)" error={errors.find((e) => e.path === 'building.floorHeightM')?.message}>
                <AdminInput type="number" step="0.1" value={editing.building.floorHeightM} onChange={(e) => setEditing({ ...editing, building: { ...editing.building, floorHeightM: Number(e.target.value) } })} />
              </Field>
              <Field label="Width (m)" error={errors.find((e) => e.path === 'building.widthM')?.message}>
                <AdminInput type="number" step="0.5" value={editing.building.widthM} onChange={(e) => setEditing({ ...editing, building: { ...editing.building, widthM: Number(e.target.value) } })} />
              </Field>
              <Field label="Depth (m)" error={errors.find((e) => e.path === 'building.depthM')?.message}>
                <AdminInput type="number" step="0.5" value={editing.building.depthM} onChange={(e) => setEditing({ ...editing, building: { ...editing.building, depthM: Number(e.target.value) } })} />
              </Field>
              <Field label="Material" error={errors.find((e) => e.path === 'building.material')?.message}>
                <AdminSelect value={editing.building.material} onChange={(e) => setEditing({ ...editing, building: { ...editing.building, material: e.target.value as any } })}>
                  {MATERIAL_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </AdminSelect>
              </Field>
              <Field label="Frame type" error={errors.find((e) => e.path === 'building.frameType')?.message}>
                <AdminSelect value={editing.building.frameType} onChange={(e) => setEditing({ ...editing, building: { ...editing.building, frameType: e.target.value as any } })}>
                  {FRAME_TYPE_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </AdminSelect>
              </Field>
            </div>
            <IssueList issues={errors} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-app border border-line px-4 py-2 text-sm">
                Cancel
              </button>
              <SaveButton onClick={saveTemplate}>Save template</SaveButton>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete template"
        description="This removes the template from the saved document."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
