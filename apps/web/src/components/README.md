# Components

Four groups, plus the shadcn/ui primitives they are built from.

| Folder | Holds | Phase |
|---|---|---|
| `ui/` | shadcn/ui primitives (Button, Slider, Dialog, Tooltip, Tabs, Select…). Installed via the shadcn CLI, committed to the repo. | 0–1 |
| `layout/` | Top bar, left controls panel, right results panel, mobile tab bar, first-run dialog. | 1 |
| `controls/` | Building and earthquake controls bound to the config store. Every control gets a plain-language tooltip. | 1 |
| `viewport/` | Three.js scene: building, ground slab, grid, playback bar, hover/select. | 1, 3 |
| `charts/` | Displacement-vs-time, per-floor peak bars, CSV export, A/B overlay. | 3, 4 |

## Conventions

- Every control has a tooltip explaining it in plain language. No jargon
  without a definition.
- Numeric readouts use `font-mono-nums` (JetBrains Mono, tabular figures).
- Never hard-code a colour — use a token.
- Validation errors are inline and friendly: "Floors must be between 1 and 20".
- Accessible by default: keyboard operable, visible focus, ARIA labels on
  sliders and charts, and never colour alone (pair with a label or pattern).