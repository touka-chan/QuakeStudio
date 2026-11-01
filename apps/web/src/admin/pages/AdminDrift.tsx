import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { driftBandsSchema } from '@/content/schema';
import { contentId } from '@/content/types';
import { useAdminContent } from '../AdminContext';
import { swalConfirm } from '../adminSwal';
import { showNotice, showSaved } from '../adminToast';
import {
  AdminInput,
  AdminTextarea,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';
import { AdminBadge, AdminButton, AdminDialog } from '../AdminUI';

type DriftBand = {
  id: string;
  max: number | null;
  label: string;
  note: string;
  colorLight: string;
  colorDark: string;
};

function thresholdLabel(max: number | null) {
  return max === null ? 'Open-ended' : `≤ ${max}`;
}

export function AdminDrift() {
  const { content, update } = useAdminContent();
  const [draft, setDraft] = useState<DriftBand[]>(content.driftBands);
  const [editing, setEditing] = useState<DriftBand | null>(null);
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
      setErrors(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
      return;
    }
    try {
      update((document) => {
        document.driftBands = parsed.data;
      });
      setErrors([]);
      showSaved();
    } catch (error) {
      setErrors([
        { path: 'driftBands', message: error instanceof Error ? error.message : 'Save failed.' },
      ]);
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 shadow-sm">
        <div>
          <p className="text-sm font-medium">{draft.length} drift bands</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Thresholds, labels, and colours used by the simulator readout.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton icon={Plus} onClick={addBand}>
            Add band
          </AdminButton>
          <SaveButton onClick={saveDraft}>Save bands</SaveButton>
        </div>
      </div>

      <IssueList issues={errors} />

      <div className="grid gap-3 xl:grid-cols-2">
        {draft.map((band, index) => (
          <SectionCard
            key={band.id}
            title={band.label}
            description={band.note || 'No note added.'}
            actions={<AdminBadge>{thresholdLabel(band.max)}</AdminBadge>}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-3 flex-1 rounded-full border border-line"
                style={{
                  background: `linear-gradient(90deg, ${band.colorLight}, ${band.colorDark})`,
                }}
                aria-hidden="true"
              />
              <span className="font-mono-nums text-xs text-muted-foreground">
                {band.max === null ? '∞' : band.max}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ['Light', band.colorLight],
                ['Dark', band.colorDark],
              ].map(([label, colour]) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-app border border-line bg-background/40 px-2.5 py-2"
                >
                  <span
                    className="size-4 shrink-0 rounded-full border border-line"
                    style={{ backgroundColor: colour }}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="ml-auto font-mono-nums text-[11px] text-muted-foreground">
                    {colour}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
              <AdminButton size="sm" icon={Pencil} onClick={() => setEditing({ ...band })}>
                Edit
              </AdminButton>
              <AdminButton
                size="sm"
                variant="danger"
                icon={Trash2}
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
                title={
                  index === draft.length - 1
                    ? 'The final band must stay open-ended.'
                    : draft.length <= 2
                      ? 'At least two bands are required.'
                      : undefined
                }
              >
                Delete
              </AdminButton>
            </div>
          </SectionCard>
        ))}
      </div>

      <AdminDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="Edit drift band"
        description="Set the threshold, label, note, and the two theme colours."
        footer={
          <>
            <AdminButton onClick={() => setEditing(null)}>Cancel</AdminButton>
            <SaveButton onClick={saveBand}>Save band</SaveButton>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <Field label="Label">
              <AdminInput
                value={editing.label}
                onChange={(event) => setEditing({ ...editing, label: event.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Note" hint="Short description shown beside the band.">
              <AdminTextarea
                value={editing.note}
                onChange={(event) => setEditing({ ...editing, note: event.target.value })}
              />
            </Field>
            {editing.max !== null ? (
              <Field
                label="Upper threshold (fraction)"
                hint="Bands are ordered from lowest to highest drift."
              >
                <AdminInput
                  type="number"
                  step="0.0001"
                  value={editing.max}
                  onChange={(event) =>
                    setEditing({ ...editing, max: Number(event.target.value) })
                  }
                />
              </Field>
            ) : (
              <p className="rounded-app bg-surface-2 p-3 text-sm text-muted-foreground">
                The final band is open-ended and has no upper threshold.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['Light colour', 'colorLight'],
                  ['Dark colour', 'colorDark'],
                ] as const
              ).map(([label, key]) => (
                <Field key={key} label={label}>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editing[key]}
                      onChange={(event) => setEditing({ ...editing, [key]: event.target.value })}
                      className="h-9 w-14 cursor-pointer rounded-app border border-line bg-background p-1"
                    />
                    <span className="font-mono-nums text-xs text-muted-foreground">
                      {editing[key]}
                    </span>
                  </div>
                </Field>
              ))}
            </div>
          </div>
        ) : null}
      </AdminDialog>
    </div>
  );
}
