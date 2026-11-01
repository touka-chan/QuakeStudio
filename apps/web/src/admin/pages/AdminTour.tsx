import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { tourStepSchema, welcomeStepSchema } from '@/content/schema';
import { contentId } from '@/content/types';
import { TOUR_ICONS, TOUR_TARGETS, WELCOME_ICONS } from '@/content/types';
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
  SectionCard,
} from '../AdminForms';
import { AdminBadge, AdminButton, AdminDialog, AdminSwitchRow } from '../AdminUI';

export function AdminTour() {
  const { content, update } = useAdminContent();
  const [tourForm, setTourForm] = useState({
    enabled: content.tour.enabled,
    buttonLabel: content.tour.buttonLabel,
    buttonTooltip: content.tour.buttonTooltip,
  });
  const [welcomeForm, setWelcomeForm] = useState({
    enabled: content.welcome.enabled,
    title: content.welcome.title,
    description: content.welcome.description,
    acknowledgement: content.welcome.acknowledgement,
    assumptionsLabel: content.welcome.assumptionsLabel,
    startLabel: content.welcome.startLabel,
    footer: content.welcome.footer,
  });
  const [editingTourStep, setEditingTourStep] = useState<{
    id: string;
    target: string;
    title: string;
    body: string;
    icon: string;
  } | null>(null);
  const [editingWelcomeStep, setEditingWelcomeStep] = useState<{
    id: string;
    icon: string;
    title: string;
    body: string;
  } | null>(null);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);

  useEffect(() => {
    setTourForm({
      enabled: content.tour.enabled,
      buttonLabel: content.tour.buttonLabel,
      buttonTooltip: content.tour.buttonTooltip,
    });
    setWelcomeForm({
      enabled: content.welcome.enabled,
      title: content.welcome.title,
      description: content.welcome.description,
      acknowledgement: content.welcome.acknowledgement,
      assumptionsLabel: content.welcome.assumptionsLabel,
      startLabel: content.welcome.startLabel,
      footer: content.welcome.footer,
    });
  }, [content.tour, content.welcome]);

  const tourStepExists = editingTourStep
    ? content.tour.steps.some((step) => step.id === editingTourStep.id)
    : false;
  const welcomeStepExists = editingWelcomeStep
    ? content.welcome.steps.some((step) => step.id === editingWelcomeStep.id)
    : false;

  function saveTourMeta(event: React.FormEvent) {
    event.preventDefault();
    try {
      update((document) => {
        document.tour = { ...document.tour, ...tourForm };
      });
      setErrors([]);
      showSaved();
    } catch (error) {
      setErrors([
        { path: 'tour', message: error instanceof Error ? error.message : 'Save failed.' },
      ]);
    }
  }

  function saveWelcomeMeta(event: React.FormEvent) {
    event.preventDefault();
    try {
      update((document) => {
        document.welcome = { ...document.welcome, ...welcomeForm };
      });
      setErrors([]);
      showSaved();
    } catch (error) {
      setErrors([
        { path: 'welcome', message: error instanceof Error ? error.message : 'Save failed.' },
      ]);
    }
  }

  function saveTourStep() {
    if (!editingTourStep) return;
    const parsed = tourStepSchema.safeParse(editingTourStep);
    if (!parsed.success) {
      setErrors(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
      return;
    }
    try {
      if (tourStepExists) {
        update((document) => {
          const index = document.tour.steps.findIndex((step) => step.id === editingTourStep.id);
          document.tour.steps[index] = parsed.data;
        });
      } else {
        update((document) => {
          document.tour.steps.push(parsed.data);
        });
      }
      setEditingTourStep(null);
      setErrors([]);
      showSaved();
    } catch (error) {
      setErrors([
        {
          path: 'tour.steps',
          message: error instanceof Error ? error.message : 'Save failed.',
        },
      ]);
    }
  }

  function saveWelcomeStep() {
    if (!editingWelcomeStep) return;
    const parsed = welcomeStepSchema.safeParse(editingWelcomeStep);
    if (!parsed.success) {
      setErrors(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
      return;
    }
    try {
      if (welcomeStepExists) {
        update((document) => {
          const index = document.welcome.steps.findIndex(
            (step) => step.id === editingWelcomeStep.id,
          );
          document.welcome.steps[index] = parsed.data;
        });
      } else {
        update((document) => {
          document.welcome.steps.push(parsed.data);
        });
      }
      setEditingWelcomeStep(null);
      setErrors([]);
      showSaved();
    } catch (error) {
      setErrors([
        {
          path: 'welcome.steps',
          message: error instanceof Error ? error.message : 'Save failed.',
        },
      ]);
    }
  }

  function deleteTourStep(stepId: string) {
    swalConfirm({
      title: 'Delete tour step',
      text: 'This removes the step from the saved document.',
      confirmLabel: 'Delete',
      onConfirm: () => {
        try {
          update((document) => {
            document.tour.steps = document.tour.steps.filter((step) => step.id !== stepId);
          });
          showDeleted('Tour step');
        } catch (error) {
          setErrors([
            {
              path: 'tour.steps',
              message: error instanceof Error ? error.message : 'Delete failed.',
            },
          ]);
        }
      },
    });
  }

  function deleteWelcomeStep(stepId: string) {
    swalConfirm({
      title: 'Delete welcome step',
      text: 'This removes the step from the saved document.',
      confirmLabel: 'Delete',
      onConfirm: () => {
        try {
          update((document) => {
            document.welcome.steps = document.welcome.steps.filter((step) => step.id !== stepId);
          });
          showDeleted('Welcome step');
        } catch (error) {
          setErrors([
            {
              path: 'welcome.steps',
              message: error instanceof Error ? error.message : 'Delete failed.',
            },
          ]);
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      <IssueList issues={errors} />

      <SectionCard
        title="Guided tour"
        description="The walkthrough students can open from the simulator."
        actions={<AdminBadge>{content.tour.steps.length} steps</AdminBadge>}
      >
        <form onSubmit={saveTourMeta} className="space-y-4">
          <AdminSwitchRow
            label="Enable guided tour"
            description="Show the tour launcher in the simulator."
            checked={tourForm.enabled}
            onCheckedChange={(checked) => setTourForm({ ...tourForm, enabled: checked })}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Button label">
              <AdminInput
                value={tourForm.buttonLabel}
                onChange={(event) =>
                  setTourForm({ ...tourForm, buttonLabel: event.target.value })
                }
              />
            </Field>
            <Field label="Button tooltip">
              <AdminInput
                value={tourForm.buttonTooltip}
                onChange={(event) =>
                  setTourForm({ ...tourForm, buttonTooltip: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <SaveButton>Save tour settings</SaveButton>
          </div>
        </form>

        <div className="mt-6 border-t border-line pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Tour steps</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shown in this order when the tour starts.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {content.tour.steps.map((step, index) => (
              <div
                key={step.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-app border border-line bg-background/40 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{step.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {step.target} · {step.icon}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <AdminButton
                    size="sm"
                    icon={Pencil}
                    onClick={() => {
                      setEditingTourStep({ ...step });
                      setErrors([]);
                    }}
                  >
                    Edit
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    variant="danger"
                    icon={Trash2}
                    onClick={() => deleteTourStep(step.id)}
                  >
                    Delete
                  </AdminButton>
                </div>
              </div>
            ))}
            <AdminButton
              variant="secondary"
              icon={Plus}
              className="w-full border-dashed"
              onClick={() => {
                setEditingTourStep({
                  id: contentId('tour'),
                  target: 'controls',
                  title: '',
                  body: '',
                  icon: 'building',
                });
                setErrors([]);
              }}
            >
              Add tour step
            </AdminButton>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Welcome gate"
        description="The first screen students see before entering the simulator."
        actions={<AdminBadge>{content.welcome.steps.length} steps</AdminBadge>}
      >
        <form onSubmit={saveWelcomeMeta} className="space-y-4">
          <AdminSwitchRow
            label="Enable welcome gate"
            description="Show the welcome screen on first load."
            checked={welcomeForm.enabled}
            onCheckedChange={(checked) => setWelcomeForm({ ...welcomeForm, enabled: checked })}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <AdminInput
                value={welcomeForm.title}
                onChange={(event) =>
                  setWelcomeForm({ ...welcomeForm, title: event.target.value })
                }
              />
            </Field>
            <Field label="Start label">
              <AdminInput
                value={welcomeForm.startLabel}
                onChange={(event) =>
                  setWelcomeForm({ ...welcomeForm, startLabel: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Description">
            <AdminTextarea
              value={welcomeForm.description}
              onChange={(event) =>
                setWelcomeForm({ ...welcomeForm, description: event.target.value })
              }
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Acknowledgement">
              <AdminInput
                value={welcomeForm.acknowledgement}
                onChange={(event) =>
                  setWelcomeForm({ ...welcomeForm, acknowledgement: event.target.value })
                }
              />
            </Field>
            <Field label="Assumptions label">
              <AdminInput
                value={welcomeForm.assumptionsLabel}
                onChange={(event) =>
                  setWelcomeForm({ ...welcomeForm, assumptionsLabel: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Footer">
            <AdminTextarea
              value={welcomeForm.footer}
              onChange={(event) =>
                setWelcomeForm({ ...welcomeForm, footer: event.target.value })
              }
              className="min-h-20"
            />
          </Field>
          <div className="flex justify-end">
            <SaveButton>Save welcome settings</SaveButton>
          </div>
        </form>

        <div className="mt-6 border-t border-line pt-4">
          <div className="mb-3">
            <h3 className="text-sm font-medium">Welcome steps</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Short highlights shown on the welcome screen.
            </p>
          </div>
          <div className="space-y-2">
            {content.welcome.steps.map((step, index) => (
              <div
                key={step.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-app border border-line bg-background/40 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{step.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.icon}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <AdminButton
                    size="sm"
                    icon={Pencil}
                    onClick={() => {
                      setEditingWelcomeStep({ ...step });
                      setErrors([]);
                    }}
                  >
                    Edit
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    variant="danger"
                    icon={Trash2}
                    onClick={() => deleteWelcomeStep(step.id)}
                  >
                    Delete
                  </AdminButton>
                </div>
              </div>
            ))}
            <AdminButton
              variant="secondary"
              icon={Plus}
              className="w-full border-dashed"
              onClick={() => {
                setEditingWelcomeStep({
                  id: contentId('welcome'),
                  icon: 'play',
                  title: '',
                  body: '',
                });
                setErrors([]);
              }}
            >
              Add welcome step
            </AdminButton>
          </div>
        </div>
      </SectionCard>

      <AdminDialog
        open={Boolean(editingTourStep)}
        onOpenChange={(open) => {
          if (!open) setEditingTourStep(null);
        }}
        title={tourStepExists ? 'Edit tour step' : 'New tour step'}
        description="Point the step at a part of the simulator and describe what to notice."
        footer={
          <>
            <AdminButton onClick={() => setEditingTourStep(null)}>Cancel</AdminButton>
            <SaveButton onClick={saveTourStep}>Save step</SaveButton>
          </>
        }
      >
        {editingTourStep ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target">
                <AdminSelect
                  value={editingTourStep.target}
                  onChange={(event) =>
                    setEditingTourStep({ ...editingTourStep, target: event.target.value })
                  }
                >
                  {TOUR_TARGETS.map((target) => (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  ))}
                </AdminSelect>
              </Field>
              <Field label="Icon">
                <AdminSelect
                  value={editingTourStep.icon}
                  onChange={(event) =>
                    setEditingTourStep({ ...editingTourStep, icon: event.target.value })
                  }
                >
                  {TOUR_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </AdminSelect>
              </Field>
            </div>
            <Field label="Title">
              <AdminInput
                value={editingTourStep.title}
                onChange={(event) =>
                  setEditingTourStep({ ...editingTourStep, title: event.target.value })
                }
                autoFocus
              />
            </Field>
            <Field label="Body">
              <AdminTextarea
                value={editingTourStep.body}
                onChange={(event) =>
                  setEditingTourStep({ ...editingTourStep, body: event.target.value })
                }
              />
            </Field>
            <IssueList issues={errors} />
          </div>
        ) : null}
      </AdminDialog>

      <AdminDialog
        open={Boolean(editingWelcomeStep)}
        onOpenChange={(open) => {
          if (!open) setEditingWelcomeStep(null);
        }}
        title={welcomeStepExists ? 'Edit welcome step' : 'New welcome step'}
        description="Keep each highlight short enough to scan on a phone."
        footer={
          <>
            <AdminButton onClick={() => setEditingWelcomeStep(null)}>Cancel</AdminButton>
            <SaveButton onClick={saveWelcomeStep}>Save step</SaveButton>
          </>
        }
      >
        {editingWelcomeStep ? (
          <div className="space-y-4">
            <Field label="Icon">
              <AdminSelect
                value={editingWelcomeStep.icon}
                onChange={(event) =>
                  setEditingWelcomeStep({ ...editingWelcomeStep, icon: event.target.value })
                }
              >
                {WELCOME_ICONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </AdminSelect>
            </Field>
            <Field label="Title">
              <AdminInput
                value={editingWelcomeStep.title}
                onChange={(event) =>
                  setEditingWelcomeStep({ ...editingWelcomeStep, title: event.target.value })
                }
                autoFocus
              />
            </Field>
            <Field label="Body">
              <AdminTextarea
                value={editingWelcomeStep.body}
                onChange={(event) =>
                  setEditingWelcomeStep({ ...editingWelcomeStep, body: event.target.value })
                }
              />
            </Field>
            <IssueList issues={errors} />
          </div>
        ) : null}
      </AdminDialog>
    </div>
  );
}
