import { useEffect, useState } from 'react';

import { ASSUMPTION_GROUPS, ASSUMPTIONS, type AssumptionRow } from '@/config/assumptionCatalogue';
import { assumptionReviewSchema } from '@/content/schema';
import { useAdminContent } from '../AdminContext';
import { showSaved } from '../adminToast';
import {
  AdminTextarea,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';
import { AdminBadge, AdminSearchInput } from '../AdminUI';

export function AdminReview() {
  const { content, update, errors } = useAdminContent();
  const [placeholder, setPlaceholder] = useState<Record<string, boolean>>(
    content.assumptionReview.placeholder,
  );
  const [notes, setNotes] = useState<Record<string, string>>(content.assumptionReview.notes);
  const [localErrors, setLocalErrors] = useState<{ path: string; message: string }[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setPlaceholder(content.assumptionReview.placeholder);
    setNotes(content.assumptionReview.notes);
  }, [content.assumptionReview]);

  const q = query.trim().toLowerCase();

  const rowsByGroup = ASSUMPTION_GROUPS.map((group) => ({
    group,
    rows: ASSUMPTIONS.filter(
      (row) =>
        row.group === group &&
        `${row.label} ${row.value} ${row.units ?? ''}`.toLowerCase().includes(q),
    ),
  })).filter((group) => group.rows.length > 0);

  const pending = ASSUMPTIONS.filter(
    (row) => placeholder[row.id] ?? row.placeholder,
  ).length;
  const total = ASSUMPTIONS.length;
  const reviewed = total - pending;
  const percent = total ? Math.round((reviewed / total) * 100) : 0;

  function save() {
    const value = { placeholder, notes };
    const parsed = assumptionReviewSchema.safeParse(value);
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
      document.assumptionReview = parsed.data;
    });
    showSaved();
  }

  function togglePlaceholder(row: AssumptionRow, checked: boolean) {
    setPlaceholder({
      ...placeholder,
      [row.id]: checked ? true : false,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 shadow-sm">
        <div>
          <p className="text-sm font-medium">Review checklist</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tick a value once a qualified adviser has signed it off.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge
            tone={pending ? 'warning' : 'success'}
          >
            {pending ? `${pending} of ${total} pending` : 'All reviewed'}
          </AdminBadge>
          <SaveButton onClick={save}>
            Save review status
          </SaveButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminSearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          placeholder="Search assumptions"
          ariaLabel="Search assumptions"
          className="w-full sm:max-w-sm"
        />
        {q ? (
          <p className="text-xs text-muted-foreground">
            {rowsByGroup.reduce((sum, group) => sum + group.rows.length, 0)} matching values
          </p>
        ) : null}
      </div>

      <IssueList issues={[...localErrors, ...errors]} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rowsByGroup.map(({ group, rows }) => (
          <SectionCard key={group} title={group}>
            <div className="space-y-3">
              {rows.map((row: AssumptionRow) => {
                const reviewed = !(placeholder[row.id] ?? row.placeholder);
                return (
                  <div
                    key={row.id}
                    className="rounded-app border border-line bg-background/40 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{row.label}</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                          {row.value} {row.units ?? ''}
                        </p>
                      </div>
                      <AdminBadge tone={reviewed ? 'success' : 'warning'}>
                        {reviewed ? 'Reviewed' : 'Pending'}
                      </AdminBadge>
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          onChange={(event) => togglePlaceholder(row, !event.target.checked)}
                          aria-label={`Mark ${row.label} as reviewed`}
                        />
                        Reviewed by adviser
                      </label>
                    </div>
                    <div className="mt-3">
                      <Field label="Review note">
                        <AdminTextarea
                          value={notes[row.id] ?? ''}
                          onChange={(event) =>
                            setNotes({ ...notes, [row.id]: event.target.value })
                          }
                          placeholder={row.note}
                          className="min-h-[80px]"
                        />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-card border border-line bg-surface p-3 shadow-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Reviewed
          </p>
          <p className="mt-1 text-sm font-semibold tabular">
            {reviewed} / {total}
          </p>
        </div>
        <div className="h-2 w-48 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="text-sm font-medium tabular">{percent}%</div>
      </div>
    </div>
  );
}
