import { useEffect, useState } from 'react';

import { tourStepSchema, welcomeStepSchema } from '@/content/schema';
import { contentId } from '@/content/types';
import { TOUR_ICONS, TOUR_TARGETS, WELCOME_ICONS } from '@/content/types';
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
  const [editingTourStep, setEditingTourStep] = useState<any>(null);
  const [editingWelcomeStep, setEditingWelcomeStep] = useState<any>(null);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const [deleteTourStep, setDeleteTourStep] = useState<string | null>(null);
  const [deleteWelcomeStep, setDeleteWelcomeStep] = useState<string | null>(null);

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

  function saveTourMeta(event: React.FormEvent) {
    event.preventDefault();
    try {
      update((document) => {
        document.tour = { ...document.tour, ...tourForm };
      });
      setErrors([]);
    } catch (error) {
      setErrors([{ path: 'tour', message: error instanceof Error ? error.message : 'Save failed.' }]);
    }
  }

  function saveWelcomeMeta(event: React.FormEvent) {
    event.preventDefault();
    try {
      update((document) => {
        document.welcome = { ...document.welcome, ...welcomeForm };
      });
      setErrors([]);
    } catch (error) {
      setErrors([{ path: 'welcome', message: error instanceof Error ? error.message : 'Save failed.' }]);
    }
  }

  function saveTourStep() {
    if (!editingTourStep) return;
    const parsed = tourStepSchema.safeParse(editingTourStep);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
      return;
    }
    try {
      const existing = content.tour.steps.some((step) => step.id === editingTourStep.id);
      if (existing) {
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
    } catch (error) {
      setErrors([{ path: 'tour.steps', message: error instanceof Error ? error.message : 'Save failed.' }]);
    }
  }

  function saveWelcomeStep() {
    if (!editingWelcomeStep) return;
    const parsed = welcomeStepSchema.safeParse(editingWelcomeStep);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
      return;
    }
    try {
      const existing = content.welcome.steps.some((step) => step.id === editingWelcomeStep.id);
      if (existing) {
        update((document) => {
          const index = document.welcome.steps.findIndex((step) => step.id === editingWelcomeStep.id);
          document.welcome.steps[index] = parsed.data;
        });
      } else {
        update((document) => {
          document.welcome.steps.push(parsed.data);
        });
      }
      setEditingWelcomeStep(null);
      setErrors([]);
    } catch (error) {
      setErrors([{ path: 'welcome.steps', message: error instanceof Error ? error.message : 'Save failed.' }]);
    }
  }

  function confirmDeleteTourStep() {
    if (!deleteTourStep) return;
    try {
      update((document) => {
        document.tour.steps = document.tour.steps.filter((step) => step.id !== deleteTourStep);
      });
      setDeleteTourStep(null);
    } catch (error) {
      setErrors([{ path: 'tour.steps', message: error instanceof Error ? error.message : 'Delete failed.' }]);
    }
  }

  function confirmDeleteWelcomeStep() {
    if (!deleteWelcomeStep) return;
    try {
      update((document) => {
        document.welcome.steps = document.welcome.steps.filter((step) => step.id !== deleteWelcomeStep);
      });
      setDeleteWelcomeStep(null);
    } catch (error) {
      setErrors([{ path: 'welcome.steps', message: error instanceof Error ? error.message : 'Delete failed.' }]);
    }
  }

  return (
    <div className="space-y-6">
      
      <IssueList issues={errors} />

      <SectionCard title="Guided tour">
        <form onSubmit={saveTourMeta} className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tourForm.enabled} onChange={(e) => setTourForm({ ...tourForm, enabled: e.target.checked })} />
            Enabled
          </label>
          <Field label="Button label">
            <AdminInput value={tourForm.buttonLabel} onChange={(e) => setTourForm({ ...tourForm, buttonLabel: e.target.value })} />
          </Field>
          <Field label="Button tooltip">
            <AdminTextarea value={tourForm.buttonTooltip} onChange={(e) => setTourForm({ ...tourForm, buttonTooltip: e.target.value })} />
          </Field>
          <SaveButton>Save tour settings</SaveButton>
        </form>
        <div className="mt-4 space-y-2">
          {content.tour.steps.map((step) => (
            <div key={step.id} className="flex items-center justify-between rounded-app border border-line p-3">
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.target} · {step.icon}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditingTourStep({ ...step }); setErrors([]); }} className="rounded-app border border-line px-3 py-1.5 text-sm">
                  Edit
                </button>
                <button type="button" onClick={() => setDeleteTourStep(step.id)} className="rounded-app border border-destructive/30 px-3 py-1.5 text-sm text-destructive">
                  Delete
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setEditingTourStep({ id: contentId('tour'), target: 'controls', title: '', body: '', icon: 'building' });
              setErrors([]);
            }}
            className="rounded-app border border-dashed border-line px-4 py-2 text-sm"
          >
            Add tour step
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Welcome gate">
        <form onSubmit={saveWelcomeMeta} className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={welcomeForm.enabled} onChange={(e) => setWelcomeForm({ ...welcomeForm, enabled: e.target.checked })} />
            Enabled
          </label>
          <Field label="Title">
            <AdminInput value={welcomeForm.title} onChange={(e) => setWelcomeForm({ ...welcomeForm, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <AdminTextarea value={welcomeForm.description} onChange={(e) => setWelcomeForm({ ...welcomeForm, description: e.target.value })} />
          </Field>
          <Field label="Acknowledgement">
            <AdminInput value={welcomeForm.acknowledgement} onChange={(e) => setWelcomeForm({ ...welcomeForm, acknowledgement: e.target.value })} />
          </Field>
          <Field label="Assumptions label">
            <AdminInput value={welcomeForm.assumptionsLabel} onChange={(e) => setWelcomeForm({ ...welcomeForm, assumptionsLabel: e.target.value })} />
          </Field>
          <Field label="Start label">
            <AdminInput value={welcomeForm.startLabel} onChange={(e) => setWelcomeForm({ ...welcomeForm, startLabel: e.target.value })} />
          </Field>
          <Field label="Footer">
            <AdminTextarea value={welcomeForm.footer} onChange={(e) => setWelcomeForm({ ...welcomeForm, footer: e.target.value })} />
          </Field>
          <SaveButton>Save welcome settings</SaveButton>
        </form>
        <div className="mt-4 space-y-2">
          {content.welcome.steps.map((step) => (
            <div key={step.id} className="flex items-center justify-between rounded-app border border-line p-3">
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.icon}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditingWelcomeStep({ ...step }); setErrors([]); }} className="rounded-app border border-line px-3 py-1.5 text-sm">
                  Edit
                </button>
                <button type="button" onClick={() => setDeleteWelcomeStep(step.id)} className="rounded-app border border-destructive/30 px-3 py-1.5 text-sm text-destructive">
                  Delete
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setEditingWelcomeStep({ id: contentId('welcome'), icon: 'play', title: '', body: '' });
              setErrors([]);
            }}
            className="rounded-app border border-dashed border-line px-4 py-2 text-sm"
          >
            Add welcome step
          </button>
        </div>
      </SectionCard>

      {editingTourStep ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-card border border-line bg-surface p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Edit tour step</h2>
            <div className="mt-4 space-y-4">
              <Field label="Target">
                <AdminSelect value={editingTourStep.target} onChange={(e) => setEditingTourStep({ ...editingTourStep, target: e.target.value })}>
                  {TOUR_TARGETS.map((target) => (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  ))}
                </AdminSelect>
              </Field>
              <Field label="Title">
                <AdminInput value={editingTourStep.title} onChange={(e) => setEditingTourStep({ ...editingTourStep, title: e.target.value })} />
              </Field>
              <Field label="Body">
                <AdminTextarea value={editingTourStep.body} onChange={(e) => setEditingTourStep({ ...editingTourStep, body: e.target.value })} />
              </Field>
              <Field label="Icon">
                <AdminSelect value={editingTourStep.icon} onChange={(e) => setEditingTourStep({ ...editingTourStep, icon: e.target.value })}>
                  {TOUR_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </AdminSelect>
              </Field>
            </div>
            <IssueList issues={errors} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingTourStep(null)} className="rounded-app border border-line px-4 py-2 text-sm">
                Cancel
              </button>
              <SaveButton onClick={saveTourStep}>Save step</SaveButton>
            </div>
          </div>
        </div>
      ) : null}

      {editingWelcomeStep ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-card border border-line bg-surface p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Edit welcome step</h2>
            <div className="mt-4 space-y-4">
              <Field label="Icon">
                <AdminSelect value={editingWelcomeStep.icon} onChange={(e) => setEditingWelcomeStep({ ...editingWelcomeStep, icon: e.target.value })}>
                  {WELCOME_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </AdminSelect>
              </Field>
              <Field label="Title">
                <AdminInput value={editingWelcomeStep.title} onChange={(e) => setEditingWelcomeStep({ ...editingWelcomeStep, title: e.target.value })} />
              </Field>
              <Field label="Body">
                <AdminTextarea value={editingWelcomeStep.body} onChange={(e) => setEditingWelcomeStep({ ...editingWelcomeStep, body: e.target.value })} />
              </Field>
            </div>
            <IssueList issues={errors} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingWelcomeStep(null)} className="rounded-app border border-line px-4 py-2 text-sm">
                Cancel
              </button>
              <SaveButton onClick={saveWelcomeStep}>Save step</SaveButton>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog open={Boolean(deleteTourStep)} title="Delete tour step" description="This removes the step from the saved document." onConfirm={confirmDeleteTourStep} onCancel={() => setDeleteTourStep(null)} />
      <ConfirmDialog open={Boolean(deleteWelcomeStep)} title="Delete welcome step" description="This removes the step from the saved document." onConfirm={confirmDeleteWelcomeStep} onCancel={() => setDeleteWelcomeStep(null)} />
    </div>
  );
}
