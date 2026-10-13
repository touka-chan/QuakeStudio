# Copy review

**Date:** 13 October 2026 · **Scope:** every string a user can read in QuakeStudio

Copy in an educational tool that touches structural engineering has one job
above all others: **never let a student believe a number is more authoritative
than it is.** Every other concern — consistency, brevity, plain language — comes
second to that.

## What was checked

| Surface | Reviewed |
|---|---|
| First-run dialog | Full read |
| Top bar, tooltips, live regions | Full read |
| Controls panel (every label, help text, preset description) | Full read |
| Playback bar, including the reduced-motion notice | Full read |
| Results panel (metric cards, both charts, drift legend) | Full read |
| Comparison mode (switcher, table, caption, view toggle) | Full read |
| Saved-runs dialog | Full read |
| About & Assumptions (all three tabs) | Full read |
| CSV export header, saved-run summaries, import errors | Full read |
| Validation report, assumptions doc, README | Full read |

## Findings

### 1. "the numbers are the true values" — an overclaim

**Changed.** The playback bar said:

> Motion is drawn 20× larger so millimetres are visible — **the numbers are the
> true values**.

The sentence's *purpose* is sound: it separates the exaggerated view from the
underlying data. But in a tool whose entire premise is "these numbers are not
validated", calling them **true** reads as a claim of correctness. A student
quoting that line to a tutor would be quoting a claim the project explicitly
disclaims.

Now reads:

> Motion is drawn 20× larger so millimetres are visible. **The numbers themselves
> are not exaggerated — but they are still the model's output, not a validated
> result.**

Same reassurance, no claim of truth. Three tests were updated to match.

### 2. "The assumptions page opens in Phase 5" — stale

**Fixed.** The first-run dialog offered a disabled **Read the assumptions**
button and explained that the page "opens in Phase 5", pointing at a file in the
repository. Phase 5 is now.

The button works: it closes the welcome dialog and opens the assumptions page.
It deliberately does **not** tick the acknowledgement checkbox — reading the
assumptions is not the same as agreeing to them, and a gate that can be passed
without reading is not a gate.

### 3. Assumptions dialog footer overlapped its content

**Fixed.** Found by looking at the screen, not by reading the code. The footer
("Copy assumptions for review") rendered **on top of** the scrolling About text,
because the dialog was not a flex column and the two competed for space.

The content now scrolls behind a pinned, separated footer.

### 4. The canvas flashed white on remount

**Fixed.** The 3D canvas cleared to opaque white for the frame or two before the
scene rendered — so switching comparison mode flashed the *wrong theme* in dark
mode. Invisible in unit tests; only visible by using the app.

`alpha: true` on the WebGL renderer lets the theme's `--viewport-bg` show through
instead.

## Language rules now in force

These are the patterns the review settled on. They are worth applying to any new
copy.

### Never claim correctness

The engine has been cross-validated against an independent implementation. That
is **software** correctness, not **engineering** correctness. Say "the software
agrees with itself", never "accurate" or "true" or "realistic".

### Distinguish "not exaggerated" from "true"

Motion exaggeration affects the 3D view only. That is a real and useful
distinction — just do not make it with the word "true".

### Say what a number is not

Every repeated caveat should be attached to a specific claim:

| Claim | Better than | Say |
|---|---|---|
| Peak displacement 192.6 mm | "the real displacement" | "the model's peak displacement" |
| Internally consistent | "accurate" | "checked against an independent implementation" |
| Comparison change | "improvement" / "better" | "+23%" or "▼" |

### No verdict language

Nothing in the app says which building, material or frame type is *better*.
The comparison reports a difference; it does not grade.

### Jargon gets a one-sentence definition

Every control has a ⓘ. The glossary has 16 terms. If a new term needs a
paragraph, the UI copy is wrong rather than the definition.

### Plain, short, second person

Short sentences. "Pick a template", not "Select a building configuration
template". Students first.

## Consistency checks that passed

- **Units.** `mm`, `m`, `s`, `g`, `Hz`, `kg/m²` throughout, with a space before
  the unit. Displacement is millimetres everywhere in the UI and metres
  throughout the engine; conversion happens once, at the edge.
- **Numbering.** `Floor 5`, `Story 1`, `1st mode` — floors count from 1 in the
  UI, and the engine's 0-indexed arrays never leak.
- **Rounding.** Metric cards round for reading; CSV carries full precision
  *and* the displayed value, so "the CSV matches the screen" is literally
  checkable.
- **Building names.** Described from the model's own fields
  (`describeBuilding`), so "10-story steel · braced frame" cannot contradict the
  building it labels.
- **Placeholder language.** "Awaiting review", "needs review", "placeholder" —
  never "estimated" or "approximate", which sound more settled than they are.

## Known wording that is deliberate

- **The ground-shaking arrow caption** reads "Ground shaking (left ↔ right)".
  Kept in both themes; it is the only place the ground direction is named.
- **"Comparison"** as the placeholder heading when comparison is off, rather than
  hiding the section. An empty heading teaches that the feature exists.
- **Phase 7 site controls** are shown but disabled, with the reason stated
  inline. A hidden control is a mystery; a disabled one with a reason is a
  decision the client can revisit.