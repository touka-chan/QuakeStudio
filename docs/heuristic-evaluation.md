# Heuristic evaluation

**Date:** 13 October 2026 · **Method:** Nielsen's ten usability heuristics
**Evaluator:** agent review of the built application

> **This is not a usability study.** An expert evaluation finds the problems an
> expert *notices*. Participants notice different things, and usually the ones
> that matter more. It is a cheap first pass that makes the study in
> [`usability-plan.md`](usability-plan.md) more productive — not a replacement
> for it.
>
> **A second limitation, stated up front:** this was an automated agent
> reviewing its own work. That is the weakest possible form of this method — it
> has no independence, and no exposure to a genuine first-time user's
> confusion. Treat the findings below as a checklist for a human evaluator to
> re-run, not as a substitute for one.

Severity is the usual 0–4 scale: **catastrophic**, **major**, **moderate**,
**minor**.

---

## Summary

| # | Heuristic | Verdict |
|---|---|---|
| 1 | Visibility of system status | ✅ good |
| 2 | Match between system and the real world | ⚠️ 1 moderate |
| 3 | User control and freedom | ⚠️ 1 minor (no change recommended) |
| 4 | Consistency and standards | ✅ no finding |
| 5 | Error prevention | ✅ good |
| 6 | Recognition rather than recall | ⚠️ 1 major, 1 moderate |
| 7 | Flexibility and efficiency | ✅ good |
| 8 | Aesthetic and minimalist design | ✅ good |
| 9 | Help users recover from errors | ✅ good |
| 10 | Help and documentation | ✅ good |

**One MAJOR finding, now fixed.** One moderate finding that deliberately waits
for the study, one that is more correct for engineers than for the public and is
therefore a client decision, and one that needs no change.

---

## Findings

### H6 — Recognition rather than recall: **MAJOR**

**The problem.** Comparison mode has no persistent label saying which building
is selected for editing. The A/B switcher shows which side is *selected*, but
once you scroll down the controls panel to the earthquake settings, nothing on
screen says whether you are editing A or B. The controls panel header reads
"BUILDING B — Step 1" only while the building group is in view.

**Why it matters.** A user who scrolls down, changes a control, and scrolls back
up cannot tell which building they just changed. Given that comparison mode
exists to compare two buildings, changing the wrong one is a serious error, and
the app does nothing to prevent or reveal it.

**Already partly mitigated.** The control group heading does read
"Building B". That helps when visible and does nothing when scrolled away.

**Fix.** Put a persistent A/B chip in the panel header — outside the scrolling
region — that reads "Editing B" with the series colour. One line, removes the
whole class of error. **Recommended.**

---

### H6 — Recognition rather than recall: **MODERATE**

**The problem.** The default motion (1.4 Hz) is close to the default building's
natural frequency (1.59 Hz), so the displacement chart is extremely dense and
the numbers are large — 192 mm and 1.88% drift on a 5-storey building. Neither
figure is implausible *given the placeholder coefficients*, but a student
meeting the app for the first time has no way to know that.

**Why it matters.** First impressions set expectations. A student who assumes
those numbers are realistic will either distrust the tool or, worse, trust it.

**Already mitigated.** The disclaimer is permanent, and the Assumptions page
states plainly that the absolute values are not established.

**Recommendation.** Do **not** change the default before the usability study —
changing it would mean measuring your own change rather than the tool. Note the
density as a finding, then revisit. If the study surfaces it, the honest fix is
a note in the UI, not a silently retuned default.

---

### H2 — Match with the real world: **MODERATE**

**The problem.** "Floors" controls the number of storeys. Engineers say
"storeys"; the general public says "floors", where a ground floor plus N upper
floors is N+1 storeys. The app also reports "Floor 5, relative to ground" for
the top of a 5-storey building.

**Why it matters.** For the target audience — civil engineering students —
"floors" is a misnomer but a harmless one, since they mentally translate. It
matters for anyone else, and it makes the readout slightly wrong on paper.

**Recommendation.** Low priority and deliberately not changed: renaming to
"storeys" would be more correct for the audience but less accessible to
everyone else. Flag it for the client rather than deciding unilaterally.

---

### H4 — Consistency and standards: **no finding**

An inconsistency was suspected here: clicking a bar in the peak-by-floor chart
selects a floor, and clicking a floor in the 3D view does too, but the two
surfaces show the selection differently — the chart with a ring, the 3D view
with a highlight colour.

Checked, and it is not a problem. The chart caption already reads *"Click a bar,
or a floor in 3D, to highlight it"* — both interaction paths are documented in
one place, which is the thing that actually matters. Each surface then uses its
own visual idiom for the result, which is the correct behaviour for a chart and
a 3D scene: a ring means the right idiom in a chart, and a highlight means the
right idiom in a model. Forcing them to match would make one of the two wrong.

Recorded here because the suspicion is the kind that gets "fixed" by somebody
later who has not read this. No change.

---

### H3 — User control and freedom: **MINOR**

**The problem.** There is no undo. Every control change immediately re-solves
and replaces the results, and the only way back is to retype the previous value
or reapply a template.

**Why this is minor.** The parameters are all sliders and toggles showing their
current value, and the effect is instantly visible. Nothing destructive can be
lost. The controls that *are* destructive — deleting a saved run — have an
explicit delete with a distinct label.

**Recommendation.** No change. An undo stack across a live-solver model would be
significant complexity for a tool with no destructive actions.

---

## What the evaluation found to be genuinely good

Not padding — these are the properties worth protecting in any Phase 6 or 7
change.

**H1 — visibility of system status.** The "Updating…" state, the live playback
clock, the cursor readout, and the permanent disclaimer all work together. A
user always knows what the app is showing and how current it is.

**H5 — error prevention.** The app has no states a user can get stuck in.
Saved-run import validates before writing anything; a run that does not fit
localStorage thins itself and says so; the first-run gate cannot be dismissed
without acknowledgement.

**H7 — flexibility and efficiency.** Comparison mode, templates, CSV export,
keyboard operation of every control, and the motion exaggeration slider all
provide real shortcuts for users who know what they are doing.

**H8 — aesthetic and minimalist design.** The interface stays out of the way of
the model. Nothing decorative competes with the numbers.

**H9 — recovering from errors.** Import failures name the problem in plain
language and say which file was wrong. The storage backend is named so a
participant knows whether a thinned run is expected.

**H10 — help and documentation.** Every control has a plain-language tooltip,
the glossary is searchable, and the Assumptions page is derived from the config
rather than written beside it.

---

## Recommended before the study

**Done — the one MAJOR finding.** A persistent "Editing A / Editing B" indicator
now sits *outside* the controls panel's scroll area, in the series colour, as a
`role="status"` region so the switch is announced. Before this, scrolling down
to the earthquake settings and back up lost all trace of which building was
being edited — in the mode whose entire purpose is comparing two buildings.

The A/B switcher's own heading was changed from "Editing" to "Switch" at the
same time, because two labels reading "Editing" in one panel made it ambiguous
which was the live answer.

**Nothing else is recommended before the study.** In particular, do not touch
the default motion — see the moderate finding above for why changing it now
would corrupt the measurement.

## Deliberately not changed

| Item | Why |
|---|---|
| Default shaking frequency | Changing it before the study means measuring your own change |
| "Floors" → "storeys" | More correct for engineers, less accessible to everyone else; a client decision |
| Undo | No destructive actions to undo |
| Drift colour bands | Waiting on the engineering adviser (`assumptions.md` §7a) |