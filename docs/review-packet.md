# Engineering review packet

**For:** the engineering adviser
**Ask:** replace 26 placeholder numbers, and answer four questions
**Status:** the software is finished and verified; the physics inputs are not

---

## Read this first

QuakeStudio runs correctly. It computes what it is told to compute, and we can
prove it: the TypeScript engine is checked against an independent Python
implementation over 16 cases spanning 1 to 20 storeys, all four materials and
both frame types. The worst disagreement across every case is **6.3e-11 %**.

That is worth stating plainly because it defines the shape of this request:

> **We are not asking you to check our arithmetic. We are asking you to
> replace 26 numbers that we invented.**

The 26 is the count the app itself displays in its Assumptions tab, and a unit
test asserts it is non-zero so the list cannot quietly shrink. (The config file
carries 31 `PLACEHOLDER` markers in total; the extra five mark choices that are
not numbers — the model type, the timestep, the comparison change column — and
those are asked about in Groups 2 and 3 below.)

Every value lives in
[`apps/web/src/config/engineeringAssumptions.ts`](../apps/web/src/config/engineeringAssumptions.ts)
and is marked `PLACEHOLDER — needs engineer review`. Nothing is duplicated into
components, stores or the solver: change it there and the whole app follows.

Until they are replaced, QuakeStudio shows the *behaviour* of a simplified
model and not a result anyone should rely on. The app says so on every screen.

---

## How to change one value

Open `engineeringAssumptions.ts`, edit the value, and leave the
`PLACEHOLDER` comment in place until you have told us to remove it. There is a
cross-validation suite (`npm run validate`) that will tell you immediately if
a change breaks the engine's self-consistency — it will not tell you whether
the number is right, because it cannot.

---

## Group 1 — look up and confirm

**Roughly 20 minutes.** These have defensible published ranges. We need a
figure and a citation, not your judgement.

| # | Assumption | Our placeholder | Typical range | Source needed |
|---|---|---|---|---|
| 1.1 | Floor mass per area — concrete | 600 kg/m² | — | spec, confirm |
| 1.2 | Floor mass per area — steel | 400 kg/m² | — | **needs a real figure** |
| 1.3 | Floor mass per area — composite | 500 kg/m² | — | **needs a real figure** |
| 1.4 | Floor mass per area — wood | 250 kg/m² | — | **needs a real figure** |
| 2.1–2.4 | Damping ratio, four materials | 5 / 2 / 3 / 5 % | 2–5 % | citation per material |
| 3.1 | Braced-frame stiffness factor | 2.0× moment frame | ~1.8–2.2× | citation |

---

## Group 2 — needs your judgement

These are the ones we are least comfortable guessing at.

### 2a. Period coefficients are material-independent (the weakest point in the model)

We use `Ct = 0.072`, `x = 0.8` for **all four materials**. That is almost
certainly wrong — these coefficients are empirical formulas that differ by
structural system, and using one set across concrete, steel, composite and
wood is a known simplification rather than a considered choice.

- **Question:** should the app carry four sets of `(Ct, x)`? If so, please
  supply them.
- **If not:** is the simplification defensible for a teaching tool, given the
  app states it plainly and never presents a result as validated?

### 2b. Composite and wood are not really structural materials

They exist so a student can explore "what if I changed the material". Real
composite and timber buildings are hybrid systems, not a homogeneous slab.

- **Question:** is labelling these as materials misleading enough to rename
  them, or is it acceptable with the caveat the app already prints?

### 2c. Linear-elastic, one direction

The model is a linear-elastic shear building responding in X only. No
non-linearity, no torsion, no soil interaction, no foundation.

- **Question:** is this acceptable for the stated teaching goal — building
  intuition about how structures move — or does it mislead about real
  behaviour to the point it should be narrowed?

---

## Group 3 — display decisions

Not physics. These change how results are *read*, and the app is built so they
never imply a verdict about a building.

### 3a. Drift colour bands — we have already done the analysis for you

Our bands split at 0.10 / 0.20 / 0.35 / 0.50 %. They were chosen before the
engine ran, and they turned out to be unusable: across 84 runs (7 templates ×
12 shaking intensities, through the shipping engine), **74 % of runs landed in
the single top band**, and the default 5-storey concrete building read "very
large" at *every* intensity from 0.10 g up — including the app's own default.

Measured distribution of peak interstory drift ratio:

| min | p10 | p25 | median | p75 | p90 | p99 | max |
|---|---|---|---|---|---|---|---|
| 0.065 % | 0.262 % | 0.461 % | 0.917 % | 1.884 % | 3.392 % | 5.183 % | 5.568 % |

p90 is **12.9× p10**, so the quantity is roughly log-distributed and linear
bands cannot divide it evenly. Three candidates, same 84 runs:

| Scale | Cuts (%) | Band 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| current | 0.10 / 0.20 / 0.35 / 0.50 | 2 % | 6 % | 10 % | 8 % | **74 %** |
| even-spread | 0.50 / 1.00 / 1.50 / 2.00 | 26 % | 30 % | 12 % | 8 % | 24 % |
| **log (recommended)** | **0.25 / 0.50 / 1.00 / 2.00** | 10 % | 17 % | 30 % | 20 % | 24 % |

**We recommend the logarithmic scale** — the only one where no band swallows
the data — with the existing non-judgemental wording ("very small" → "very
large") and the top band left open-ended.

- **Question:** does that scale read correctly to you, and does the wording
  stay clear without implying a verdict?

**One caveat we want your eye on.** At the gentlest 0.05 g the default
building already drifts 0.314 %, which lands in band 3 of even the recommended
scale. We suspect that is a property of the placeholder stiffness in Group 1
rather than of the bands — the two interact — so we would rather fix the
stiffness first and re-run before finalising the bands.

Reproduce with `npm run analysis:drift`.

### 3b. A/B series colours

`#0072B2` (A) and `#E69F00` (B). A deuteranopia check is outstanding. These
are the standard Okabe–Ito blue/amber pair and are used identically in the 3D
view, the charts and the comparison table.

---

## Group 4 — storage

A saved run stores its full history in `localStorage`, and if a run is too
long for the quota it is thinned — peaks and key values stay exact, the dense
history is decimated. The app tells the user when this happens.

- **Question:** acceptable for a single-user teaching tool, or should we
  downsample on save and say so instead?

---

## What is already verified, so you do not have to

| Claim | How it was checked |
|---|---|
| The engine is correct | Independent Python implementation, 16 cases, worst disagreement **6.3e-11 %** |
| Two implementations agree | Deliberately sharing *constants* but not *code*, so agreement means something |
| The app says it is not a safety assessment | Permanent disclaimer on every screen. The words "safe" and "unsafe" appear nowhere except in that disclaimer and in the code comments explaining why they are banned |
| Colour is never the only cue | Drift bands are labelled in plain language, never as verdicts; the bar chart prints each peak in millimetres beside the bar; every chart gives exact numbers on hover |
| It works on a phone | Audited feature by feature on a real Android 11 device |
| It works at any screen size | Audited at 6 widths from 320 px to 1440 px, 6 views each |

---

## What we still owe you

- Re-run `npm run analysis:drift` once Group 1 lands, and bring you the
  recalculated bands rather than the ones above.
- Cite every value you supply, so the in-app assumptions list can carry the
  source next to the number.
- Flag anything in this packet you think we have framed wrongly. We would
  rather be corrected early than be right about the wrong thing.

Full detail and the reasoning behind each choice: [`assumptions.md`](./assumptions.md).