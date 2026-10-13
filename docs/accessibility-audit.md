# Accessibility audit

**Date:** 13 October 2026 · **Scope:** QuakeStudio web app, Phases 1–5
**Target:** WCAG 2.1 Level AA (the standard the specification commits to)

This has two halves, and both matter.

- The **automated** half runs axe-core over every surface in
  `apps/web/tests/unit/accessibility.test.tsx`. It catches names, roles, ARIA
  validity, and structural problems. It cannot judge whether the app makes
  sense with a screen reader.
- The **manual** half is this document. It covers what a tool cannot check:
  whether focus behaves, whether anything is reachable, and whether the copy
  tells the truth.

## Summary

| Area | Status |
|---|---|
| Automated axe checks | **0 violations** across workspace, both dialogs, all three tabs, and comparison mode |
| Colour contrast | **Pass**, both themes — `tests/unit/contrast.test.ts` |
| Focus management | **Pass** after fixes (see below) |
| Keyboard operability | **Pass**, with one documented gap (3D orbit) |
| Live regions | **Pass** |
| Reduced motion | **Pass** |
| Colour is never the only cue | **Pass** |

## What the audit found and fixed

Every item below was found by writing the check, not by reading the code. The
pattern is the same throughout: **the markup looked right and conveyed nothing**,
because ARIA attributes only take effect on elements that have a role.

### 1. `aria-label` on a roleless element — the canvas

**Severity: serious.** The 3D viewport's wrapper `<div>` carried a descriptive
`aria-label` and no `role`. `aria-label` on a generic element is *prohibited*:
axe reports it and screen readers drop it entirely. The 3D view — the centre of
the application — was described to nobody.

**Fixed** by adding `role="img"` to both viewports. The labels were also
rewritten: they now name the building and say where the numbers are, because a
description of a picture only helps if it tells a screen-reader user that the
actual data is elsewhere.

### 2. `aria-label` on a roleless element — the metric help icons

**Severity: serious.** Same bug, smaller surface. Each metric card's ⓘ icon
span had `aria-label` and no role, and its only child was `aria-hidden`. It
announced as nothing at all.

**Fixed** with `role="img"`.

### 3. `aria-valuetext` on the slider track — critical

**Severity: critical.** Radix puts `role="slider"` on the **Thumb**. A previous
phase correctly forwarded `aria-label` to the thumb, but left it on the Root as
well. `aria-valuetext` is only valid on an element with a role, so the track
carried a prohibited attribute. It also meant the same `id` landed on two
elements.

**Fixed** in `components/ui/slider.tsx`: the ARIA props are destructured out and
applied to the thumb only.

### 4. Focus was not restored when a dialog closed — serious

**Severity: serious, and invisible in unit tests.** Radix returns focus to its
`DialogTrigger` on close. Both dialogs were opened by external state, with the
trigger button rendered in `TopBar` and the dialog elsewhere — so Radix had no
registered trigger. Pressing **Escape** dropped focus onto `<body>`. A keyboard
user then had to tab from the top of the document all over again to return to
where they were.

This passed in jsdom and only showed up in a real browser.

**Fixed** by moving each dialog beside its trigger: `TopBar` now owns both, and
wraps each button in `<DialogTrigger asChild>`. `AppShell` no longer holds that
state. The assertion now lives in `tests/e2e/accessibility.spec.ts`.

### 5. Two buttons announced as "Close"

The saved-runs dialog had both Radix's corner ✕ and a footer Close. A screen
reader user heard two identical controls with no way to tell them apart.

**Fixed** by turning off the corner ✕ (`showCloseButton={false}`) and keeping the
footer button, which is the larger touch target on mobile. Escape and
click-outside still work.

### 6. The A/B switcher was unlabelled

The comparison A/B buttons carried a decorative colour badge marked
`aria-hidden`, so assistive technology announced nothing but the building name
with no indication of which side of the comparison it was.

**Fixed** with an explicit `aria-label` naming the side and the building.

## Documented gaps

These are **not** fixed. They are recorded so nobody discovers them later and
assumes they were overlooked.

### The 3D viewport cannot be orbited by keyboard

`OrbitControls` is attached with the mouse only; there is no keyboard handler.
A keyboard user cannot change the camera angle.

**Why it is left:** the viewport is decorative in the accessibility sense — the
numbers are all available as text in the results panel and the comparison table.
The animation is a *visualisation* of data that is also given numerically, which
is the pattern WCAG 2.1 accepts. Adding arrow-key camera control would help
nobody who cannot see the canvas in the first place, and would add a confusing
set of key bindings to the main tab order.

**If the client wants it:** three.js supports it via
`controls.listenToKeyEvents(window)`. That should be scoped to the canvas being
focused, or arrow keys would fight every other control on the page.

### Charts are SVG without a text alternative per mark

The charts expose a summary and a cursor readout, and the underlying data is
available as text elsewhere (metric cards, peak-by-floor numbers, the
comparison table). Individual data points are not separately focusable.

**Why it is left:** a 2,000-point time series made keyboard-navigable is not
useful — it is slow and it is noise. The honest alternative is a data table,
which the CSV export already provides.

### Colour-only drift bands

The drift bar chart colours bars by band. **This is already mitigated**: the
number is printed beside every bar, and the chart states so in words. The band
thresholds themselves do not discriminate well — see `assumptions.md` §7a,
still awaiting the engineering adviser.

## Checks that are automated

| Check | Where |
|---|---|
| axe-core over workspace, both dialogs, all tabs, comparison mode | `tests/unit/accessibility.test.tsx` |
| Every control has an accessible name | same file |
| Every slider exposes value, min, max and a name | same file |
| No ARIA value attribute without a role | same file |
| Dialog opens into focus; Escape closes | same file + e2e |
| Focus returns to the trigger | `tests/e2e/accessibility.spec.ts` |
| Tab is trapped inside a dialog | e2e |
| Arrow keys operate sliders, ARIA value follows | e2e |
| Visible focus ring | e2e |
| Live regions announce export and save | e2e |
| `prefers-reduced-motion` | e2e + `playback.test.ts` |
| Colour contrast, both themes | `tests/unit/contrast.test.ts` |

### Two axe rules are deliberately disabled

Both are named in the test file rather than skipped silently:

- **`color-contrast`** — jsdom performs no layout, so every element has zero
  size and axe cannot compute a ratio. Contrast is checked for real in
  `contrast.test.ts`, against token values, in both themes.
- **`aria-hidden-focus`** — flags the Three.js canvas and decorative icons.
  Reviewed by hand above; no genuinely focusable content is hidden.

## Testing notes for the student team

If you add a component, add it to the axe sweep in
`tests/unit/accessibility.test.tsx`. A new dialog is the case most likely to
regress, because the focus-restore bug lived exactly there.

If you add an `aria-label`, ask whether the element has a **role**. If it does
not, the label does nothing — that was the single most common defect in this
audit, and it is invisible unless you run a tool that checks it.