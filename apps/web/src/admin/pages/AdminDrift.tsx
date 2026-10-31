import { useEffect, useState } from 'react';

import { driftBandsSchema } from '@/content/schema';
import { contentId } from '@/content/types';
import { useAdminContent } from '../AdminContext';
import { swalConfirm } from '../adminSwal';
import { showSaved, showNotice } from '../adminToast';
import {
  AdminInput,
  AdminTextarea,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';

export function AdminDrift() {
  const { content, update } = useAdminContent();
  const [draft, setDraft] = useState(content.driftBands);
  const [editing, setEditing] = useState<any>(null);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);

  useEffect(() => setDraft(content.driftBands), [content.driftBands]);

  function addBand() {
    const bands = [...draft];
    const last = bands[bands.length - 1];
    const previous = bands.length >= 2 ? Number(bands[bands.length - 2].max ?? 0) : 0;
    const upper = last?.max === null ? previous + 0.002 : Number(last?.max ?? previous + 0.002);
    const midpoint = (previous + upper) / 2;
    bands.splice(bands.length - 1, 0, {
      id: contentId('drift'),
      max: midpoint,
      label: 'New band',
      note: '',
      colorLight: '#94a3b8',
      colorDark: '#94a3b8',
    });
    setDraft(bands);
  }

  function saveDraft() {
    const parsed = driftBandsSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
      return;
    }
    try {
      update((document) => {
        document.driftBands = parsed.data;
      });
      setErrors([]);
      showSaved();
    } catch (error) {
      setErrors([{ path: 'driftBands', message: error instanceof Error ? error.message : 'Save failed.' }]);
    }
  }

  function saveBand() {
    if (!editing) return;
    const next = draft.map((band) => (band.id === editing.id ? editing : band));
    setDraft(next);
    setEditing(null);
  }

  return (
    <div>
      
      <IssueList issues={errors} />
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={addBand} className="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Add band
        </button>
        <SaveButton onClick={saveDraft}>Save bands</SaveButton>
      </div>
      <div className="space-y-3">
        {draft.map((band, index) => (
          <SectionCard key={band.id} title={band.label} description={band.note}>
            <p className="text-sm text-muted-foreground">
              Threshold: {band.max === null ? '∞' : band.max} · Colours: {band.colorLight} / {band.colorDark}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setEditing({ ...band })} className="rounded-app border border-line px-3 py-1.5 text-sm">
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  swalConfirm({
                    title: 'Delete drift band',
                    text: `Remove "${band.label}" from the saved document.`,
                    confirmLabel: 'Delete',
                    onConfirm: () => {
                      setDraft(draft.filter((item) => item.id !== band.id));
                      showNotice('Band removed from the draft. Save bands to apply.');
                    },
                  });
                }}
                disabled={index === draft.length - 1 || draft.length <= 2}
                className="rounded-app border border-destructive/30 px-3 py-1.5 text-sm text-destructive disabled:opacity-50"
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
            <h2 className="text-lg font-semibold">Edit drift band</h2>
            <div className="mt-4 space-y-4">
              <Field label="Label">
                <AdminInput value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </Field>
              <Field label="Note">
                <AdminTextarea value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
              </Field>
              {editing.max !== null ? (
                <Field label="Upper threshold (fraction)">
                  <AdminInput type="number" step="0.0001" value={editing.max} onChange={(e) => setEditing({ ...editing, max: Number(e.target.value) })} />
                </Field>
              ) : (
                <p className="text-sm text-muted-foreground">The final band is open-ended.</p>
              )}
              <Field label="Light colour">
                <input type="color" value={editing.colorLight} onChange={(e) => setEditing({ ...editing, colorLight: e.target.value })} className="h-10 w-20 rounded-app border border-line bg-background" />
                <span className="ml-2 font-mono text-xs text-muted-foreground">{editing.colorLight}</span>
              </Field>
              <Field label="Dark colour">
                <input type="color" value={editing.colorDark} onChange={(e) => setEditing({ ...editing, colorDark: e.target.value })} className="h-10 w-20 rounded-app border border-line bg-background" />
                <span className="ml-2 font-mono text-xs text-muted-foreground">{editing.colorDark}</span>
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-app border border-line px-4 py-2 text-sm">
                Cancel
              </button>
              <SaveButton onClick={saveBand}>Save band</SaveButton>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
