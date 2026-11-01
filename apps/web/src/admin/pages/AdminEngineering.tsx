import React, { useEffect, useState } from 'react';

import { engineeringContentSchema } from '@/content/schema';
import { OCCUPANCY_IDS } from '@/content/types';
import { placeholderCount } from '@/config/assumptionCatalogue';
import { useAdminContent } from '../AdminContext';
import { showSaved } from '../adminToast';
import { AdminInput, Field, IssueList, SectionCard } from '../AdminForms';
import { AdminBadge, AdminButton, AdminTabNav } from '../AdminUI';

type TabId = 'structure' | 'ground-motion' | 'floor-loads' | 'damping';

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function AdminEngineering({ onNavigate }: { onNavigate: (to: string) => void }) {
  const { content, update, errors } = useAdminContent();
  const [draft, setDraft] = useState(content.engineering);
  const [speedsText, setSpeedsText] = useState(content.engineering.playback.speeds.join(', '));
  const [localErrors, setLocalErrors] = useState<{ path: string; message: string }[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('floor-loads');

  useEffect(() => {
    setDraft(content.engineering);
    setSpeedsText(content.engineering.playback.speeds.join(', '));
  }, [content.engineering]);

  const approved = 0;
  const pending = placeholderCount();

  function save(event: React.FormEvent) {
    event.preventDefault();
    const speeds = speedsText.split(',').map((item) => Number(item.trim()));
    if (speeds.some((value) => Number.isNaN(value))) {
      setLocalErrors([{ path: 'playback.speeds', message: 'Playback speeds must be numbers separated by commas.' }]);
      return;
    }
    const nextDraft = { ...draft, playback: { ...draft.playback, speeds } };
    const parsed = engineeringContentSchema.safeParse(nextDraft);
    if (!parsed.success) {
      setLocalErrors(parsed.error.issues.map((item) => ({ path: item.path.join('.'), message: item.message })));
      return;
    }
    setLocalErrors([]);
    update((document) => {
      document.engineering = parsed.data;
    });
    showSaved();
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'structure', label: 'Structure' },
    { id: 'ground-motion', label: 'Ground motion' },
    { id: 'floor-loads', label: 'Floor loads' },
    { id: 'damping', label: 'Damping & period' },
  ];

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="rounded-card border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-warning-text">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-warning/50 text-[10px] font-bold text-warning-text/70" aria-hidden="true">!</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Every value here is a placeholder pending engineer review.</p>
            <p className="mt-0.5 text-xs leading-5">Publishing is allowed, but values stay marked “Needs review” until the adviser confirms them.</p>
          </div>
          <AdminButton variant="secondary" size="sm" onClick={() => onNavigate('review')}>
            Review now
          </AdminButton>
        </div>
      </div>

      {/* Tabs + page action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AdminTabNav tabs={tabs} active={activeTab} onSelect={(id) => setActiveTab(id as TabId)} />
        <AdminButton variant="secondary" size="sm" onClick={save}>
          Save changes
        </AdminButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          <IssueList issues={[...localErrors, ...errors]} />

          <form onSubmit={save}>
            {activeTab === 'floor-loads' && (
              <>
                <SectionCard title="Occupancy presets" description="Live load, dead load, counted share and review status for each occupancy type.">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        <tr className="border-b border-line">
                          <th className="p-2.5 text-left">Use of floor</th>
                          <th className="p-2.5 text-right">Live (kPa)</th>
                          <th className="p-2.5 text-right">Dead (kPa)</th>
                          <th className="p-2.5 text-right">Counted</th>
                          <th className="p-2.5 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {OCCUPANCY_IDS.map((id) => (
                          <tr key={id} className="border-b border-line bg-surface/50 hover:bg-surface-2 transition-colors">
                            <td className="p-2.5">
                              <p className="font-medium">{titleCase(id)}</p>
                              {draft.occupancies[id]?.label &&
                              draft.occupancies[id].label.toLowerCase() !== id.toLowerCase() ? (
                                <p className="text-[11px] text-muted-foreground">
                                  {draft.occupancies[id].label}
                                </p>
                              ) : null}
                            </td>
                            <td className="p-2.5 text-right font-mono-nums">{draft.occupancies[id]?.liveKPa ?? '—'}</td>
                            <td className="p-2.5 text-right font-mono-nums">{draft.loadAssumptions.defaultDeadLoadKPa}</td>
                            <td className="p-2.5 text-right font-mono-nums">25%</td>
                            <td className="p-2.5">
                              <AdminBadge tone="warning">Needs review</AdminBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                <SectionCard title="Default settings" description="Starting dead load, live load share, and gravity value.">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Live load counted as weight">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={draft.loadAssumptions.liveLoadParticipation}
                        onChange={(e) => setDraft({ ...draft, loadAssumptions: { ...draft.loadAssumptions, liveLoadParticipation: Number(e.target.value) } })}
                        className="w-full accent-primary"
                      />
                      <p className="mt-1 text-xs text-muted-foreground tabular">{Math.round(draft.loadAssumptions.liveLoadParticipation * 100)}%</p>
                    </Field>
                    <Field label="Starting dead load (kPa)">
                      <AdminInput value={draft.loadAssumptions.defaultDeadLoadKPa} disabled className="bg-surface-2/50 text-muted-foreground" />
                    </Field>
                    <Field label="Gravity (m/s²)">
                      <AdminInput value={draft.loadAssumptions.gravityMs2} disabled className="bg-surface-2/50 text-muted-foreground" />
                    </Field>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">Starting value in the simulator: users can change it later. About 3/5 for a 150 mm slab plus 1.2 for finishes.</p>
                </SectionCard>
              </>
            )}

            {activeTab === 'structure' && (
              <div className="space-y-4">
                <SectionCard title="Materials" description="Material properties: label, damping, period coefficients.">
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {['Concrete', 'Steel', 'Composite', 'Wood'].map((label) => (
                      <Field key={label} label={label}>
                        <AdminInput disabled value={label === 'Concrete' ? '5% damping, Ct 0.07' : '—'} className="bg-surface-2/40 text-muted-foreground" />
                      </Field>
                    ))}
                  </div>
                </SectionCard>
                <SectionCard title="Frame types" description="Stiffness factor per frame system.">
                  <div className="grid gap-3 md:grid-cols-2">
                    {['Moment frame', 'Braced frame'].map((label) => (
                      <Field key={label} label={label}>
                        <AdminInput disabled value={label === 'Moment frame' ? '1.0' : '0.8'} className="bg-surface-2/40 text-muted-foreground" />
                      </Field>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}
          </form>
        </div>

        {/* Right sidebar */}
        <aside className="space-y-4">
          <SectionCard title="Live check" description="Current simulator readout." className="bg-surface/80">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-app bg-surface-2 p-2.5 text-center">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Dead</p>
                <p className="text-sm font-semibold">{draft.loadAssumptions.defaultDeadLoadKPa} kPa</p>
              </div>
              <div className="rounded-app bg-surface-2 p-2.5 text-center">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Live</p>
                <p className="text-sm font-semibold">{(draft.loadAssumptions.defaultDeadLoadKPa + 25).toFixed(1)} kPa</p>
              </div>
              <div className="rounded-app bg-surface-2 p-2.5 text-center">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Counted</p>
                <p className="text-sm font-semibold">25%</p>
              </div>
            </div>
            <div className="mt-3 rounded-app bg-surface-2 p-2.5 text-xs leading-5 text-muted-foreground font-mono">
              (Dead + 25% × Live) × area = weight in kN
            </div>
          </SectionCard>

          <SectionCard title="Adviser review" description="Values still needing a qualified engineer sign-off.">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{approved} of 4 approved</p>
              <AdminBadge tone="warning">{pending} need review</AdminBadge>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted-foreground/60" aria-hidden="true">○</span>
                Code basis (NSCP 2015)
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted-foreground/60" aria-hidden="true">○</span>
                Live-load values per use
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted-foreground/60" aria-hidden="true">○</span>
                25% counted as weight
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted-foreground/60" aria-hidden="true">○</span>
                Starting dead load, 4.8 kPa
              </li>
            </ul>
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.14em]">Assigned adviser</p>
              <p className="mt-0.5 text-sm">Name or email (not set)</p>
            </div>
            <AdminButton variant="primary" className="mt-4 w-full" onClick={() => onNavigate('review')}>Request adviser review</AdminButton>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
