import { useEffect, useState } from 'react';

import { ASSUMPTION_GROUPS, ASSUMPTIONS, type AssumptionRow } from '@/config/assumptionCatalogue';
import { assumptionReviewSchema } from '@/content/schema';
import { useAdminContent } from '../AdminContext';
import {
  AdminTextarea,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';

export function AdminReview() {
  const { content, update, errors } = useAdminContent();
  const [placeholder, setPlaceholder] = useState<Record<string, boolean>>(content.assumptionReview.placeholder);
  const [notes, setNotes] = useState<Record<string, string>>(content.assumptionReview.notes);
  const [localErrors, setLocalErrors] = useState<{ path: string; message: string }[]>([]);

  useEffect(() => {
    setPlaceholder(content.assumptionReview.placeholder);
    setNotes(content.assumptionReview.notes);
  }, [content.assumptionReview]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    const value = { placeholder, notes };
    const parsed = assumptionReviewSchema.safeParse(value);
    if (!parsed.success) {
      setLocalErrors(parsed.error.issues.map((item) => ({ path: item.path.join('.'), message: item.message })));
      return;
    }
    setLocalErrors([]);
    update((document) => {
      document.assumptionReview = parsed.data;
    });
  }

  const rowsByGroup = ASSUMPTION_GROUPS.map((group) => ({
    group,
    rows: ASSUMPTIONS.filter((row) => row.group === group),
  })).filter((group) => group.rows.length > 0);

  return (
    <div>
      
      <form onSubmit={save} className="space-y-4">
        <IssueList issues={[...localErrors, ...errors]} />
        {rowsByGroup.map(({ group, rows }) => (
          <SectionCard key={group} title={group}>
            <div className="space-y-4">
              {rows.map((row: AssumptionRow) => (
                <div key={row.id} className="rounded-app border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.value}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={placeholder[row.id] ?? row.placeholder}
                        onChange={(e) => setPlaceholder({ ...placeholder, [row.id]: e.target.checked })}
                      />
                      Placeholder
                    </label>
                  </div>
                  <div className="mt-3">
                    <Field label="Review note">
                      <AdminTextarea
                        value={notes[row.id] ?? ''}
                        onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
                        placeholder={row.note}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ))}
        <SaveButton>Save review status</SaveButton>
      </form>
    </div>
  );
}
