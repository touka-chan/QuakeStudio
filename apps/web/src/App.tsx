import { useCallback, useEffect, useState } from 'react';

import { DISCLAIMER_SHORT, MATERIALS, type MaterialId } from '@/config/engineeringAssumptions';
import {
  applyTheme,
  prefersDark,
  readStoredTheme,
  storeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

/* ==========================================================================
   PHASE 0 — DESIGN SYSTEM PROOF PAGE
   --------------------------------------------------------------------------
   This page exists to verify that the foundation renders correctly BEFORE
   the real workspace layout is built on top of it (Phase 1): fonts load,
   tokens resolve, light/dark both hold contrast, and the drift scale is
   legible. It is not part of the final app and will be replaced.
   ========================================================================== */

const BRAND_TOKENS: ReadonlyArray<{ name: string; varName: string; use: string }> = [
  { name: 'Primary', varName: '--primary', use: 'Buttons, active state, playback' },
  { name: 'Accent yellow', varName: '--accent-yellow', use: 'Ground shaking, highlights' },
  { name: 'Info blue', varName: '--info-blue', use: 'Links, info, Config A' },
  { name: 'Warning', varName: '--warning', use: 'Disclaimer badge' },
  { name: 'Danger', varName: '--danger', use: 'Errors only — never results' },
  { name: 'Surface', varName: '--surface', use: 'Cards, panels' },
  { name: 'Surface 2', varName: '--surface-2', use: 'Subtle fills, input wells' },
  { name: 'Border', varName: '--border', use: '1px separators' },
  { name: 'Viewport bg', varName: '--viewport-bg', use: '3D canvas backdrop' },
  { name: 'Text muted', varName: '--text-muted', use: 'Captions, secondary labels' },
];

const SERIES_TOKENS: ReadonlyArray<{ name: string; varName: string; use: string }> = [
  { name: 'Config A', varName: '--series-a', use: 'Building A, primary series' },
  { name: 'Config B', varName: '--series-b', use: 'Building B, comparison' },
  { name: 'Config C', varName: '--series-c', use: 'Optional third series' },
  { name: 'Ground motion', varName: '--series-ground', use: 'Dashed reference line' },
];

const DRIFT_SCALE = [
  { label: '1', varName: '--drift-1', sideVar: '--drift-1-side' },
  { label: '2', varName: '--drift-2', sideVar: '--drift-2-side' },
  { label: '3', varName: '--drift-3', sideVar: '--drift-3-side' },
  { label: '4', varName: '--drift-4', sideVar: '--drift-4-side' },
  { label: '5', varName: '--drift-5', sideVar: '--drift-5-side' },
];

const MATERIAL_ROWS = (Object.keys(MATERIALS) as MaterialId[]).map((id) => ({
  id,
  label: MATERIALS[id].label,
  mass: MATERIALS[id].massPerAreaKgM2,
  damping: MATERIALS[id].dampingRatio,
  ct: MATERIALS[id].periodCt,
  x: MATERIALS[id].periodExponentX,
}));

function Swatch({ varName, name, use }: { varName: string; name: string; use: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div
        className="h-14 w-full rounded-app border border-line"
        style={{ backgroundColor: `var(${varName})` }}
        role="img"
        aria-label={`${name} swatch`}
      />
      <p className="mt-2 text-sm font-medium">{name}</p>
      <p className="font-mono-nums text-xs text-muted-foreground">{varName}</p>
      <p className="mt-1 text-xs text-muted-foreground">{use}</p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const THEME_ORDER: readonly ThemePreference[] = ['light', 'dark', 'system'];

export default function App() {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredTheme());

  // Track the OS setting so 'system' stays live. This is the one bit of state
  // that cannot be derived — `resolved` below is.
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark());

  // Derived, never stored: a stored copy could drift out of sync with the OS.
  const resolved: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  // Push the resolved theme onto the document — the only external system we
  // own here. The inline script in index.html already applied it before paint;
  // this keeps it correct on later changes.
  useEffect(() => {
    applyTheme(resolved);
    storeTheme(preference);
  }, [resolved, preference]);

  // Follow the OS while the preference is 'system'.
  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const cycleTheme = useCallback(() => {
    setPreference((current) => {
      const index = THEME_ORDER.indexOf(current);
      return THEME_ORDER[(index + 1) % THEME_ORDER.length]!;
    });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---- Top bar (structure preview; full bar arrives in Phase 1) ---- */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <div
            className="grid size-8 place-items-center rounded-app bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <span className="text-base font-bold leading-none">Q</span>
          </div>
          <h1 className="text-lg font-semibold">QuakeStudio</h1>
          <span className="rounded-full bg-warning-bg px-3 py-1 text-xs font-medium text-warning">
            Phase 0 · Design tokens
          </span>

          <div className="ml-auto flex items-center gap-2">
            <span
              className="hidden text-xs text-muted-foreground sm:inline"
              aria-live="polite"
              data-testid="theme-status"
            >
              {preference} ({resolved})
            </span>
            <button
              type="button"
              onClick={cycleTheme}
              className="rounded-app border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
              aria-label={`Theme: ${preference}. Activate to change.`}
            >
              Theme: {preference}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6">
        {/* ---- Disclaimer: must always be visible, in every phase ---- */}
        <p className="rounded-app border border-line bg-warning-bg px-4 py-2.5 text-sm text-warning-text">
          {DISCLAIMER_SHORT}
        </p>

        <Section
          title="Brand & surface tokens"
          description="Every value below is defined once in src/styles/tokens.css. Components must reference tokens, never raw hex codes."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {BRAND_TOKENS.map((token) => (
              <Swatch key={token.varName} {...token} />
            ))}
          </div>
        </Section>

        <Section
          title="Data-visualisation series"
          description="Colourblind-safe set. Identical in light and dark — hue carries meaning, so it must not shift with the theme."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SERIES_TOKENS.map((token) => (
              <Swatch key={token.varName} {...token} />
            ))}
          </div>
          <div className="mt-4 space-y-2 rounded-app border border-line bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-16 rounded" style={{ backgroundColor: 'var(--series-a)' }} />
              <span className="font-mono-nums text-xs">— Config A (solid)</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-0.5 w-16 rounded"
                style={{
                  backgroundColor: 'var(--series-b)',
                  backgroundImage:
                    'repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 8px)',
                  color: 'var(--series-b)',
                }}
              />
              <span className="font-mono-nums text-xs">— Config B (dashed)</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-0.5 w-16 rounded"
                style={{
                  backgroundColor: 'var(--series-ground)',
                  backgroundImage:
                    'repeating-linear-gradient(90deg, var(--series-ground) 0 3px, transparent 3px 6px)',
                }}
              />
              <span className="font-mono-nums text-xs">— Ground motion (dashed, neutral)</span>
            </div>
          </div>
        </Section>

        <Section
          title="Shaking-intensity scale (story drift)"
          description="Magnitude-map styling, low to high. Always paired with a numeric value and a legend — never colour alone. Hue order is fixed across both themes."
        >
          <div className="flex flex-wrap items-end gap-2">
            {DRIFT_SCALE.map((step) => (
              <div key={step.label} className="text-center">
                <div
                  className="flex h-24 w-16 overflow-hidden rounded-app border border-line"
                  role="img"
                  aria-label={`Drift level ${step.label} of 5`}
                >
                  <div className="flex-1" style={{ backgroundColor: `var(${step.varName})` }} />
                  <div className="flex-1" style={{ backgroundColor: `var(${step.sideVar})` }} />
                </div>
                <p className="font-mono-nums mt-1 text-xs text-muted-foreground">{step.label}</p>
              </div>
            ))}
            <div className="ml-4 flex h-24 w-24 overflow-hidden rounded-app border border-line">
              <div className="w-full" style={{ backgroundColor: 'var(--drift-top)' }} />
            </div>
            <p className="ml-1 text-xs text-muted-foreground">
              Top face
              <br />
              (--drift-top)
            </p>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Low</span>
            <div
              className="h-2 flex-1 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, var(--drift-1), var(--drift-2), var(--drift-3), var(--drift-4), var(--drift-5))',
              }}
              role="img"
              aria-label="Legend: low drift blue, rising through green, yellow and orange to deep orange"
            />
            <span className="text-xs text-muted-foreground">High</span>
          </div>
        </Section>

        <Section
          title="Typography"
          description="Inter for UI, JetBrains Mono with tabular figures for every number."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Caption · 12px · Inter</p>
              <p className="text-xl font-semibold">Heading 24px — Building response</p>
              <p className="text-lg font-medium">Subheading 20px — Earthquake input</p>
              <p className="text-base">Body 14px — the default UI size</p>
              <p className="text-sm text-muted-foreground">
                Secondary 13px — supporting explanation text
              </p>
            </div>
            <div className="space-y-3 rounded-app border border-line bg-surface-2 p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-strong uppercase">
                Metric card · mono, tabular
              </p>
              <p className="font-mono-nums text-2xl font-semibold">31.8 mm</p>
              <p className="font-mono-nums text-sm text-muted-strong">0.34 % · story 1</p>
              <p className="font-mono-nums text-sm text-muted-strong">T₁ 0.52 s · 1st mode</p>
              <table className="w-full font-mono-nums text-xs">
                <tbody>
                  <tr>
                    <td className="py-0.5 text-muted-strong">Floor 5</td>
                    <td className="py-0.5 text-right">31.8</td>
                    <td className="py-0.5 text-right text-muted-strong">mm</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-muted-strong">Floor 4</td>
                    <td className="py-0.5 text-right">30.0</td>
                    <td className="py-0.5 text-right text-muted-strong">mm</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-muted-strong">Floor 1</td>
                    <td className="py-0.5 text-right">10.2</td>
                    <td className="py-0.5 text-right text-muted-strong">mm</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        <Section
          title="Spacing & shape"
          description="8-point scale (4, 8, 12, 16, 24, 32). Radius 8px; cards 12px. Borders 1px, shadows minimal."
        >
          <div className="flex items-end gap-3">
            {[4, 8, 12, 16, 24, 32].map((px) => (
              <div key={px} className="text-center">
                <div
                  className="rounded-t-app bg-primary/70"
                  style={{ width: px * 2, height: px * 2 }}
                  aria-hidden="true"
                />
                <p className="font-mono-nums mt-1 text-xs text-muted-foreground">{px}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="rounded-app border border-line bg-surface-2 px-3 py-1.5 text-xs">
              radius 8px
            </span>
            <span className="rounded-card border border-line bg-surface-2 px-4 py-2.5 text-xs">
              card radius 12px
            </span>
            <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              primary button
            </span>
            <span className="rounded-app border border-line bg-surface px-3 py-1.5 text-xs">
              secondary button
            </span>
            <span className="rounded-app border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs text-danger">
              error (danger reserved)
            </span>
          </div>
        </Section>

        <Section
          title="Engineering assumptions — placeholder register"
          description="Read the live contents of src/config/engineeringAssumptions.ts. Every value below is marked PLACEHOLDER and needs review by the engineering adviser."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Material</th>
                  <th className="py-2 pr-4 font-medium">Mass / area</th>
                  <th className="py-2 pr-4 font-medium">Damping ζ</th>
                  <th className="py-2 pr-4 font-medium">Ct</th>
                  <th className="py-2 font-medium">x</th>
                </tr>
              </thead>
              <tbody className="font-mono-nums">
                {MATERIAL_ROWS.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 font-sans font-medium">{row.label}</td>
                    <td className="py-2 pr-4">{row.mass} kg/m²</td>
                    <td className="py-2 pr-4">{(row.damping * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-4">{row.ct}</td>
                    <td className="py-2">{row.x}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Story stiffness is derived from the fundamental period, not hard-coded — see
            docs/assumptions.md for the derivation.
          </p>
        </Section>

        <footer className="py-6 text-center text-xs text-muted-foreground">
          Phase 0 foundation · the workspace layout arrives in Phase 1
        </footer>
      </main>
    </div>
  );
}
