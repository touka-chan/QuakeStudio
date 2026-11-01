import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { z } from 'zod';
import { templateContentSchema } from '@/content/schema';
import { contentId } from '@/content/types';
import { MATERIAL_IDS, FRAME_TYPE_IDS } from '@/content/types';
import { useAdminContent } from '../AdminContext';
import { swalConfirm } from '../adminSwal';
import { showSaved, showDeleted } from '../adminToast';
import {
  AdminInput,
  AdminSelect,
  AdminTextarea,
  Field,
  IssueList,
  SaveButton,
} from '../AdminForms';
import { AdminBadge, AdminButton, AdminEditPanel } from '../AdminUI';

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

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function TemplateThumbnail({ floors }: { floors: number }) {
  const shown = Math.min(Math.max(floors, 1), 9);
  const width = 42 + Math.min(floors, 20) * 2;

  return (
    <div
      className="relative flex h-24 items-end justify-center overflow-hidden rounded-app border border-line bg-surface-2/70 px-3 pb-3"
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute inset-x-6 bottom-2 h-16 rounded-full bg-primary/10 blur-xl"
      />
      <div className="relative flex flex-col-reverse gap-[3px]" style={{ width: `${width}%` }}>
        {Array.from({ length: shown }).map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-[2px] border ${
              index === shown - 1
                ? 'border-primary/35 bg-primary/20'
                : 'border-primary/20 bg-primary/10'
            }`}
          />
        ))}
      </div>
      <div className="absolute inset-x-4 bottom-2 h-px bg-line" />
    </div>
  );
}

export function AdminTemplates() {
  const { content, update } = useAdminContent();
  const [editing, setEditing] = useState<TemplateDraft | null>(null);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);

  const geometry = content.engineering.geometry;
  const editingExisting = editing
    ? content.templates.some((item) => item.id === editing.id)
    : false;

  function openNew() {
    setEditing({ ...EMPTY_TEMPLATE, id: contentId('tpl') });
    setErrors([]);
  }

  function closeEditor() {
    setEditing(null);
    setErrors([]);
  }

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
      closeEditor();
      showSaved();
    } catch (error) {
      setErrors([{ path: 'document', message: error instanceof Error ? error.message : 'Save failed.' }]);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Startup template
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The building students see when they open the simulator.
          </p>
          <div className="mt-3 max-w-sm">
            <AdminSelect
              value={content.defaultTemplateId}
              aria-label="Default template"
              onChange={(event) => {
                try {
                  update((document) => {
                    document.defaultTemplateId = event.target.value;
                  });
                  showSaved();
                } catch (error) {
                  setErrors([
                    {
                      path: 'defaultTemplateId',
                      message: error instanceof Error ? error.message : 'Update failed.',
                    },
                  ]);
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
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
          <p className="text-xs text-muted-foreground">
            {content.templates.length} starting point{content.templates.length === 1 ? '' : 's'}
          </p>
          <AdminButton variant="primary" icon={Plus} onClick={openNew}>
            New template
          </AdminButton>
        </div>
      </div>

      <IssueList issues={errors} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {content.templates.map((template) => {
          const isDefault = template.id === content.defaultTemplateId;
          const isBuiltIn = template.id === 'custom';
          const isProtected = isBuiltIn || isDefault;
          return (
            <article
              key={template.id}
              className="group flex flex-col rounded-card border border-line bg-surface p-4 shadow-sm transition-colors hover:border-primary/30"
            >
              <div className="relative">
                <TemplateThumbnail floors={template.building.floors} />
                <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
                  {isDefault ? <AdminBadge tone="primary">Startup</AdminBadge> : null}
                  {isBuiltIn ? <AdminBadge>Built-in</AdminBadge> : null}
                </div>
              </div>

              <div className="mt-3 min-w-0">
                <h2 className="truncate text-base font-semibold tracking-tight">
                  {template.label}
                </h2>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                  {template.description}
                </p>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-line pt-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Floors</dt>
                  <dd className="mt-0.5 font-medium tabular">{template.building.floors}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Footprint</dt>
                  <dd className="mt-0.5 font-medium tabular">
                    {template.building.widthM} × {template.building.depthM} m
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Material</dt>
                  <dd className="mt-0.5 font-medium">{titleCase(template.building.material)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Frame</dt>
                  <dd className="mt-0.5 font-medium">{titleCase(template.building.frameType)}</dd>
                </div>
              </dl>

              <div className="mt-auto border-t border-line pt-3">
                <div className="mt-3 flex items-center gap-1">
                <AdminButton
                  size="sm"
                  icon={Pencil}
                  onClick={() => {
                    setEditing({ ...template });
                    setErrors([]);
                  }}
                >
                  Edit
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  className={`ml-auto hover:bg-danger/10 hover:text-danger ${isProtected ? 'text-muted-foreground' : 'text-danger'}`}
                  disabled={isProtected}
                  title={
                    isDefault
                      ? 'Choose another startup template before deleting this one.'
                      : isBuiltIn
                        ? 'The custom template is built in and cannot be deleted.'
                        : undefined
                  }
                  onClick={() => {
                    const target = content.templates.find((item) => item.id === template.id);
                    swalConfirm({
                      title: 'Delete template',
                      text: target
                        ? `Remove "${target.label}" from the saved document.`
                        : 'This removes the template from the saved document.',
                      confirmLabel: 'Delete',
                      onConfirm: () => {
                        try {
                          update((document) => {
                            document.templates = document.templates.filter(
                              (item) => item.id !== template.id,
                            );
                          });
                          showDeleted('Template');
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
              </div>
            </article>
          );
        })}
      </div>

      <AdminEditPanel
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        title={editingExisting ? 'Edit template' : 'New template'}
        subtitle="Dimensions are checked against the ranges in Engineering."
        footer={
          <>
            <AdminButton onClick={closeEditor}>Cancel</AdminButton>
            <SaveButton onClick={saveTemplate}>Save template</SaveButton>
          </>
        }
      >
        {editing ? (
          <div className="space-y-5 pt-3">
            <div className="grid gap-4">
              <Field label="Label" error={errors.find((error) => error.path === 'label')?.message}>
                <AdminInput
                  value={editing.label}
                  onChange={(event) => setEditing({ ...editing, label: event.target.value })}
                  autoFocus
                />
              </Field>
              <Field
                label="Description"
                error={errors.find((error) => error.path === 'description')?.message}
              >
                <AdminTextarea
                  value={editing.description}
                  onChange={(event) =>
                    setEditing({ ...editing, description: event.target.value })
                  }
                />
              </Field>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Building
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Floors"
                  error={errors.find((error) => error.path === 'building.floors')?.message}
                >
                  <AdminInput
                    type="number"
                    value={editing.building.floors}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        building: { ...editing.building, floors: Number(event.target.value) },
                      })
                    }
                  />
                </Field>
                <Field
                  label="Floor height (m)"
                  error={errors.find((error) => error.path === 'building.floorHeightM')?.message}
                >
                  <AdminInput
                    type="number"
                    step="0.1"
                    value={editing.building.floorHeightM}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        building: {
                          ...editing.building,
                          floorHeightM: Number(event.target.value),
                        },
                      })
                    }
                  />
                </Field>
                <Field
                  label="Width (m)"
                  error={errors.find((error) => error.path === 'building.widthM')?.message}
                >
                  <AdminInput
                    type="number"
                    step="0.5"
                    value={editing.building.widthM}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        building: { ...editing.building, widthM: Number(event.target.value) },
                      })
                    }
                  />
                </Field>
                <Field
                  label="Depth (m)"
                  error={errors.find((error) => error.path === 'building.depthM')?.message}
                >
                  <AdminInput
                    type="number"
                    step="0.5"
                    value={editing.building.depthM}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        building: { ...editing.building, depthM: Number(event.target.value) },
                      })
                    }
                  />
                </Field>
                <Field
                  label="Material"
                  error={errors.find((error) => error.path === 'building.material')?.message}
                >
                  <AdminSelect
                    value={editing.building.material}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        building: {
                          ...editing.building,
                          material: event.target.value as TemplateDraft['building']['material'],
                        },
                      })
                    }
                  >
                    {MATERIAL_IDS.map((id) => (
                      <option key={id} value={id}>
                        {titleCase(id)}
                      </option>
                    ))}
                  </AdminSelect>
                </Field>
                <Field
                  label="Frame type"
                  error={errors.find((error) => error.path === 'building.frameType')?.message}
                >
                  <AdminSelect
                    value={editing.building.frameType}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        building: {
                          ...editing.building,
                          frameType: event.target.value as TemplateDraft['building']['frameType'],
                        },
                      })
                    }
                  >
                    {FRAME_TYPE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {titleCase(id)}
                      </option>
                    ))}
                  </AdminSelect>
                </Field>
              </div>
            </div>

            <IssueList issues={errors.filter((error) => error.path === 'document')} />
          </div>
        ) : null}
      </AdminEditPanel>
    </div>
  );
}
