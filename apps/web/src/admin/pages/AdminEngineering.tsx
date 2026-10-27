import React from 'react';
import { useEffect, useState } from 'react';

import { engineeringContentSchema } from '@/content/schema';
import { FRAME_TYPE_IDS, GROUND_MOTION_PRESET_IDS, MATERIAL_IDS, OCCUPANCY_IDS } from '@/content/types';
import { useAdminContent } from '../AdminContext';
import {
  AdminInput,
  AdminSelect,
  AdminTextarea,
  Field,
  IssueList,
  SaveButton,
  SectionCard,
} from '../AdminForms';
import { AdminPageHeader } from '../AdminForms';

export function AdminEngineering() {
  const { content, update, errors } = useAdminContent();
  const [draft, setDraft] = useState(content.engineering);
  const [speedsText, setSpeedsText] = useState(content.engineering.playback.speeds.join(', '));
  const [localErrors, setLocalErrors] = useState<{ path: string; message: string }[]>([]);

  useEffect(() => {
    setDraft(content.engineering);
    setSpeedsText(content.engineering.playback.speeds.join(', '));
  }, [content.engineering]);

  function toggleIncompatible(occupancy: string, material: string) {
    const current = draft.incompatibleUses[occupancy as keyof typeof draft.incompatibleUses] ?? [];
    const next = current.includes(material as any)
      ? current.filter((item) => item !== material)
      : [...current, material];
    setDraft({
      ...draft,
      incompatibleUses: { ...draft.incompatibleUses, [occupancy]: next },
    });
  }

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
  }

  <AdminPageHeader title="Engineering assumptions" description="Admin content management." />
  return (
    <div>
      
      <div className="mb-4 rounded-app border border-warning/40 bg-warning-bg p-3 text-sm text-warning-text">
        Every value here is a placeholder pending engineer review. Changes affect the next simulator load.
      </div>
      <form onSubmit={save} className="space-y-4">
        <IssueList issues={[...localErrors, ...errors]} />

        <SectionCard title="Materials">
          <div className="space-y-4">
            {MATERIAL_IDS.map((id) => (
              <div key={id} className="rounded-app border border-line p-3">
                <p className="mb-2 font-medium">{id}</p>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="Label">
                    <AdminInput value={draft.materials[id].label} onChange={(e) => setDraft({ ...draft, materials: { ...draft.materials, [id]: { ...draft.materials[id], label: e.target.value } } })} />
                  </Field>
                  <Field label="Damping ratio">
                    <AdminInput type="number" step="0.001" value={draft.materials[id].dampingRatio} onChange={(e) => setDraft({ ...draft, materials: { ...draft.materials, [id]: { ...draft.materials[id], dampingRatio: Number(e.target.value) } } })} />
                  </Field>
                  <Field label="Period Ct">
                    <AdminInput type="number" step="0.01" value={draft.materials[id].periodCt} onChange={(e) => setDraft({ ...draft, materials: { ...draft.materials, [id]: { ...draft.materials[id], periodCt: Number(e.target.value) } } })} />
                  </Field>
                  <Field label="Period exponent">
                    <AdminInput type="number" step="0.01" value={draft.materials[id].periodExponentX} onChange={(e) => setDraft({ ...draft, materials: { ...draft.materials, [id]: { ...draft.materials[id], periodExponentX: Number(e.target.value) } } })} />
                  </Field>
                  <Field label="Bare mass (kg/m²)">
                    <AdminInput type="number" value={draft.materials[id].bareMassPerAreaKgM2} onChange={(e) => setDraft({ ...draft, materials: { ...draft.materials, [id]: { ...draft.materials[id], bareMassPerAreaKgM2: Number(e.target.value) } } })} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Frame types">
          {FRAME_TYPE_IDS.map((id) => (
            <div key={id} className="mb-4 grid gap-3 md:grid-cols-2">
              <Field label={`${id} label`}>
                <AdminInput value={draft.frameTypes[id].label} onChange={(e) => setDraft({ ...draft, frameTypes: { ...draft.frameTypes, [id]: { ...draft.frameTypes[id], label: e.target.value } } })} />
              </Field>
              <Field label={`${id} stiffness factor`}>
                <AdminInput type="number" step="0.1" value={draft.frameTypes[id].stiffnessFactor} onChange={(e) => setDraft({ ...draft, frameTypes: { ...draft.frameTypes, [id]: { ...draft.frameTypes[id], stiffnessFactor: Number(e.target.value) } } })} />
              </Field>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Occupancies and incompatible uses">
          <div className="space-y-4">
            {OCCUPANCY_IDS.map((id) => (
              <div key={id} className="rounded-app border border-line p-3">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="Label">
                    <AdminInput value={draft.occupancies[id].label} onChange={(e) => setDraft({ ...draft, occupancies: { ...draft.occupancies, [id]: { ...draft.occupancies[id], label: e.target.value } } })} />
                  </Field>
                  <Field label="Live load (kPa)">
                    <AdminInput type="number" step="0.1" value={draft.occupancies[id].liveKPa} onChange={(e) => setDraft({ ...draft, occupancies: { ...draft.occupancies, [id]: { ...draft.occupancies[id], liveKPa: Number(e.target.value) } } })} />
                  </Field>
                  <Field label="Light colour">
                    <input type="color" value={draft.occupancies[id].colorLight} onChange={(e) => setDraft({ ...draft, occupancies: { ...draft.occupancies, [id]: { ...draft.occupancies[id], colorLight: e.target.value } } })} className="h-10 w-20 rounded-app border border-line bg-background" />
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{draft.occupancies[id].colorLight}</span>
                  </Field>
                  <Field label="Dark colour">
                    <input type="color" value={draft.occupancies[id].colorDark} onChange={(e) => setDraft({ ...draft, occupancies: { ...draft.occupancies, [id]: { ...draft.occupancies[id], colorDark: e.target.value } } })} className="h-10 w-20 rounded-app border border-line bg-background" />
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{draft.occupancies[id].colorDark}</span>
                  </Field>
                </div>
                <Field label="Description">
                  <AdminTextarea value={draft.occupancies[id].description} onChange={(e) => setDraft({ ...draft, occupancies: { ...draft.occupancies, [id]: { ...draft.occupancies[id], description: e.target.value } } })} />
                </Field>
                {id !== 'custom' ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-muted-foreground">Flagged material combinations</p>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {MATERIAL_IDS.map((material) => (
                        <label key={material} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(draft.incompatibleUses[id] ?? []).includes(material)}
                            onChange={() => toggleIncompatible(id, material)}
                          />
                          {material}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Load assumptions">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Code basis">
              <AdminTextarea value={draft.loadAssumptions.codeBasis} onChange={(e) => setDraft({ ...draft, loadAssumptions: { ...draft.loadAssumptions, codeBasis: e.target.value } })} />
            </Field>
            <Field label="Gravity (m/s²) — read only">
              <AdminInput value={draft.loadAssumptions.gravityMs2} disabled />
            </Field>
            <Field label="Default dead load (kPa)">
              <AdminInput type="number" step="0.1" value={draft.loadAssumptions.defaultDeadLoadKPa} onChange={(e) => setDraft({ ...draft, loadAssumptions: { ...draft.loadAssumptions, defaultDeadLoadKPa: Number(e.target.value) } })} />
            </Field>
            <Field label="Live load participation">
              <AdminInput type="number" step="0.01" value={draft.loadAssumptions.liveLoadParticipation} onChange={(e) => setDraft({ ...draft, loadAssumptions: { ...draft.loadAssumptions, liveLoadParticipation: Number(e.target.value) } })} />
            </Field>
            <Field label="Min dead load (kPa)">
              <AdminInput type="number" step="0.1" value={draft.loadAssumptions.minDeadLoadKPa} onChange={(e) => setDraft({ ...draft, loadAssumptions: { ...draft.loadAssumptions, minDeadLoadKPa: Number(e.target.value) } })} />
            </Field>
            <Field label="Max dead load (kPa)">
              <AdminInput type="number" step="0.1" value={draft.loadAssumptions.maxDeadLoadKPa} onChange={(e) => setDraft({ ...draft, loadAssumptions: { ...draft.loadAssumptions, maxDeadLoadKPa: Number(e.target.value) } })} />
            </Field>
            <Field label="Min live load (kPa)">
              <AdminInput type="number" step="0.1" value={draft.loadAssumptions.minLiveLoadKPa} onChange={(e) => setDraft({ ...draft, loadAssumptions: { ...draft.loadAssumptions, minLiveLoadKPa: Number(e.target.value) } })} />
            </Field>
            <Field label="Max live load (kPa)">
              <AdminInput type="number" step="0.1" value={draft.loadAssumptions.maxLiveLoadKPa} onChange={(e) => setDraft({ ...draft, loadAssumptions: { ...draft.loadAssumptions, maxLiveLoadKPa: Number(e.target.value) } })} />
            </Field>
          </div>
          <Field label="Source note">
            <AdminTextarea value={draft.loadAssumptions.sourceNote} onChange={(e) => setDraft({ ...draft, loadAssumptions: { ...draft.loadAssumptions, sourceNote: e.target.value } })} />
          </Field>
        </SectionCard>

        <SectionCard title="Geometry">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Min floors">
              <AdminInput type="number" value={draft.geometry.minFloors} onChange={(e) => setDraft({ ...draft, geometry: { ...draft.geometry, minFloors: Number(e.target.value) } })} />
            </Field>
            <Field label="Max floors">
              <AdminInput type="number" value={draft.geometry.maxFloors} onChange={(e) => setDraft({ ...draft, geometry: { ...draft.geometry, maxFloors: Number(e.target.value) } })} />
            </Field>
          </div>
          {(['floorHeightM', 'widthM', 'depthM'] as const).map((field) => (
            <div key={field} className="mt-4 rounded-app border border-line p-3">
              <p className="mb-2 font-medium">{field}</p>
              <div className="grid gap-3 md:grid-cols-4">
                {(['min', 'max', 'step', 'default'] as const).map((part) => (
                  <Field key={part} label={part}>
                    <AdminInput
                      type="number"
                      step="any"
                      value={draft.geometry[field][part]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          geometry: {
                            ...draft.geometry,
                            [field]: { ...draft.geometry[field], [part]: Number(e.target.value) },
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Ground motion">
          <div className="grid gap-4 md:grid-cols-2">
            {(['pgaG', 'frequencyHz'] as const).map((field) => (
              <div key={field} className="rounded-app border border-line p-3">
                <p className="mb-2 font-medium">{field}</p>
                <div className="grid gap-3 md:grid-cols-4">
                  {(['min', 'max', 'step', 'default'] as const).map((part) => (
                    <Field key={part} label={part}>
                      <AdminInput
                        type="number"
                        step="any"
                        value={draft.groundMotion[field][part]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            groundMotion: {
                              ...draft.groundMotion,
                              [field]: { ...draft.groundMotion[field], [part]: Number(e.target.value) },
                            },
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ))}
            <Field label="Default seed">
              <AdminInput type="number" value={draft.groundMotion.defaultSeed} onChange={(e) => setDraft({ ...draft, groundMotion: { ...draft.groundMotion, defaultSeed: Number(e.target.value) } })} />
            </Field>
            <Field label="Sample dt (s)">
              <AdminInput type="number" step="0.001" value={draft.groundMotion.sampleDtS} onChange={(e) => setDraft({ ...draft, groundMotion: { ...draft.groundMotion, sampleDtS: Number(e.target.value) } })} />
            </Field>
            <Field label="Taper duration (s)">
              <AdminInput type="number" step="0.1" value={draft.groundMotion.taperDurationS} onChange={(e) => setDraft({ ...draft, groundMotion: { ...draft.groundMotion, taperDurationS: Number(e.target.value) } })} />
            </Field>
            <Field label="Impulse duration (s)">
              <AdminInput type="number" step="0.01" value={draft.groundMotion.impulseDurationS} onChange={(e) => setDraft({ ...draft, groundMotion: { ...draft.groundMotion, impulseDurationS: Number(e.target.value) } })} />
            </Field>
            <Field label="Random band low (Hz)">
              <AdminInput type="number" step="0.1" value={draft.groundMotion.randomBandHz.low} onChange={(e) => setDraft({ ...draft, groundMotion: { ...draft.groundMotion, randomBandHz: { ...draft.groundMotion.randomBandHz, low: Number(e.target.value) } } })} />
            </Field>
            <Field label="Random band high (Hz)">
              <AdminInput type="number" step="0.1" value={draft.groundMotion.randomBandHz.high} onChange={(e) => setDraft({ ...draft, groundMotion: { ...draft.groundMotion, randomBandHz: { ...draft.groundMotion.randomBandHz, high: Number(e.target.value) } } })} />
            </Field>
          </div>
          <div className="mt-4 space-y-3">
            {GROUND_MOTION_PRESET_IDS.map((id) => (
              <div key={id} className="rounded-app border border-line p-3">
                <p className="mb-2 font-medium">{id}</p>
                <Field label="Label">
                  <AdminInput value={draft.groundMotionPresets[id].label} onChange={(e) => setDraft({ ...draft, groundMotionPresets: { ...draft.groundMotionPresets, [id]: { ...draft.groundMotionPresets[id], label: e.target.value } } })} />
                </Field>
                <Field label="Description">
                  <AdminTextarea value={draft.groundMotionPresets[id].description} onChange={(e) => setDraft({ ...draft, groundMotionPresets: { ...draft.groundMotionPresets, [id]: { ...draft.groundMotionPresets[id], description: e.target.value } } })} />
                </Field>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Viewport and playback">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(['defaultExaggeration', 'minExaggeration', 'maxExaggeration', 'exaggerationStep'] as const).map((field) => (
              <Field key={field} label={field}>
                <AdminInput type="number" step="any" value={draft.viewport[field]} onChange={(e) => setDraft({ ...draft, viewport: { ...draft.viewport, [field]: Number(e.target.value) } })} />
              </Field>
            ))}
            <Field label="Grid divisions">
              <AdminInput type="number" value={draft.viewport.defaultGridDivisions} onChange={(e) => setDraft({ ...draft, viewport: { ...draft.viewport, defaultGridDivisions: Number(e.target.value) } })} />
            </Field>
            <Field label="Ground thickness (m)">
              <AdminInput type="number" step="0.1" value={draft.viewport.groundThicknessM} onChange={(e) => setDraft({ ...draft, viewport: { ...draft.viewport, groundThicknessM: Number(e.target.value) } })} />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Playback speeds (comma separated)">
              <AdminInput value={speedsText} onChange={(e) => setSpeedsText(e.target.value)} />
            </Field>
            <Field label="Default speed">
              <AdminInput type="number" step="any" value={draft.playback.defaultSpeed} onChange={(e) => setDraft({ ...draft, playback: { ...draft.playback, defaultSpeed: Number(e.target.value) } })} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.playback.defaultLoop} onChange={(e) => setDraft({ ...draft, playback: { ...draft.playback, defaultLoop: e.target.checked } })} />
            Default loop
          </label>
        </SectionCard>

        <SectionCard title="Default building">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="ID">
              <AdminInput value={draft.defaultBuilding.id} onChange={(e) => setDraft({ ...draft, defaultBuilding: { ...draft.defaultBuilding, id: e.target.value } })} />
            </Field>
            <Field label="Name">
              <AdminInput value={draft.defaultBuilding.name} onChange={(e) => setDraft({ ...draft, defaultBuilding: { ...draft.defaultBuilding, name: e.target.value } })} />
            </Field>
            <Field label="Floors">
              <AdminInput type="number" value={draft.defaultBuilding.floors} onChange={(e) => setDraft({ ...draft, defaultBuilding: { ...draft.defaultBuilding, floors: Number(e.target.value) } })} />
            </Field>
            <Field label="Floor height (m)">
              <AdminInput type="number" step="0.1" value={draft.defaultBuilding.floorHeightM} onChange={(e) => setDraft({ ...draft, defaultBuilding: { ...draft.defaultBuilding, floorHeightM: Number(e.target.value) } })} />
            </Field>
            <Field label="Width (m)">
              <AdminInput type="number" step="0.5" value={draft.defaultBuilding.widthM} onChange={(e) => setDraft({ ...draft, defaultBuilding: { ...draft.defaultBuilding, widthM: Number(e.target.value) } })} />
            </Field>
            <Field label="Depth (m)">
              <AdminInput type="number" step="0.5" value={draft.defaultBuilding.depthM} onChange={(e) => setDraft({ ...draft, defaultBuilding: { ...draft.defaultBuilding, depthM: Number(e.target.value) } })} />
            </Field>
            <Field label="Material">
              <AdminSelect value={draft.defaultBuilding.material} onChange={(e) => setDraft({ ...draft, defaultBuilding: { ...draft.defaultBuilding, material: e.target.value as any } })}>
                {MATERIAL_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </AdminSelect>
            </Field>
            <Field label="Frame type">
              <AdminSelect value={draft.defaultBuilding.frameType} onChange={(e) => setDraft({ ...draft, defaultBuilding: { ...draft.defaultBuilding, frameType: e.target.value as any } })}>
                {FRAME_TYPE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </AdminSelect>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Default ground motion">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Preset">
              <AdminSelect value={draft.defaultGroundMotion.preset} onChange={(e) => setDraft({ ...draft, defaultGroundMotion: { ...draft.defaultGroundMotion, preset: e.target.value as any } })}>
                {GROUND_MOTION_PRESET_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </AdminSelect>
            </Field>
            <Field label="PGA (g)">
              <AdminInput type="number" step="0.01" value={draft.defaultGroundMotion.pgaG} onChange={(e) => setDraft({ ...draft, defaultGroundMotion: { ...draft.defaultGroundMotion, pgaG: Number(e.target.value) } })} />
            </Field>
            <Field label="Frequency (Hz)">
              <AdminInput type="number" step="0.1" value={draft.defaultGroundMotion.frequencyHz} onChange={(e) => setDraft({ ...draft, defaultGroundMotion: { ...draft.defaultGroundMotion, frequencyHz: Number(e.target.value) } })} />
            </Field>
            <Field label="Duration (s)">
              <AdminInput type="number" step="1" value={draft.defaultGroundMotion.durationS} onChange={(e) => setDraft({ ...draft, defaultGroundMotion: { ...draft.defaultGroundMotion, durationS: Number(e.target.value) } })} />
            </Field>
            <Field label="dt (s)">
              <AdminInput type="number" step="0.001" value={draft.defaultGroundMotion.dt} onChange={(e) => setDraft({ ...draft, defaultGroundMotion: { ...draft.defaultGroundMotion, dt: Number(e.target.value) } })} />
            </Field>
            <Field label="Seed">
              <AdminInput type="number" value={draft.defaultGroundMotion.seed} onChange={(e) => setDraft({ ...draft, defaultGroundMotion: { ...draft.defaultGroundMotion, seed: Number(e.target.value) } })} />
            </Field>
          </div>
        </SectionCard>

        <SaveButton>Save engineering</SaveButton>
      </form>
    </div>
  );
}
