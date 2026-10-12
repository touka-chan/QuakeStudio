# Engineering assumptions

> **Status: every value below is a PLACEHOLDER.**
> QuakeStudio is an educational simulation. It does not assess the safety of any
> real structure. Each row needs a decision and a source from the engineering
> adviser before any result is meaningful.

All numbers live in one place: [`apps/web/src/config/engineeringAssumptions.ts`](../apps/web/src/config/engineeringAssumptions.ts).
Nothing here is duplicated into components, stores, or the solver. Change it
there and the app follows.

---

## 1. Review checklist

| # | Assumption | Current value | Decision | Source / rationale |
|---|---|---|---|---|
| 1.1 | Floor mass per area — concrete | 600 kg/m² | ☐ | Given in the spec; confirm |
| 1.2 | Floor mass per area — steel | 400 kg/m² | ☐ | Estimate — **needs a real figure** |
| 1.3 | Floor mass per area — composite | 500 kg/m² | ☐ | Estimate — **needs a real figure** |
| 1.4 | Floor mass per area — wood | 250 kg/m² | ☐ | Estimate — **needs a real figure** |
| 2.1 | Damping ratio — concrete | 5% | ☐ | Within the spec's 2–5% range |
| 2.2 | Damping ratio — steel | 2% | ☐ | Typically the least damped |
| 2.3 | Damping ratio — composite | 3% | ☐ | |
| 2.4 | Damping ratio — wood | 5% | ☐ | Typically the most damped |
| 3.1 | Braced-frame stiffness factor | 2.0× moment frame | ☐ | Literature suggests ~1.8–2.2×; confirm |
| 4.1 | Period coefficients `Ct`, `x` | 0.072, 0.8 (all materials) | ☐ | **Same values for all four materials is almost certainly wrong** — see §5 |
| 5.1 | Model type | Linear-elastic shear building, 1 direction (X) | ☐ | Confirm this simplification is acceptable for the teaching goal |
| 6.1 | Integration timestep `dt` | 0.01 s | ☐ | Spec-fixed; must satisfy `dt ≤ T₁/20` |
| 7.1 | Rayleigh damping calibration | Modes 1 and 2 | ☐ | Standard choice; confirm |
| 8.1 | Solver vs Python reference tolerance | ≤ 5% | ☐ | **Confirm before Phase 5** |
| 9.1 | Drift colour band thresholds | 0.10 %, 0.20 %, 0.35 %, 0.50 % | ☐ | **Display bands only — see §7a** |
| 10.1 | A/B series colours | `#0072B2` / `#E69F00` | ☐ | Client spec; deuteranopia check outstanding — §8a |
| 11.1 | Comparison change column | `% change from A` | ☐ | Product decision — §8a |
| 12.1 | localStorage fallback may thin history | thinned, peaks exact | ☐ | **Acceptable? — §8a** |

---

## 2. Model

A regular multistory **linear-elastic shear building** with lumped mass per
floor, story stiffness between floors, and viscous damping. One horizontal
direction.

```
M·ü + C·u̇ + K·u = −M·1·a_g(t)
```

| Symbol | Meaning |
|---|---|
| `u` | Floor displacement relative to the ground (N × 1) |
| `M` | Diagonal matrix of floor masses |
| `K` | Tridiagonal shear-building stiffness matrix from story stiffnesses `k_i` |
| `C` | Rayleigh damping, calibrated to ζ at modes 1 and 2 |
| `a_g(t)` | Ground acceleration input |

Integration is **Newmark-β, average acceleration** (β = ¼, γ = ½) at a fixed
`dt = 0.01 s`. This is unconditionally stable and does not damp high-frequency
response, which is the right trade for a short educational run.

### Known simplifications

Each of these is a deliberate MVP boundary, not an oversight:

- No torsion, no two-direction motion
- No soil–structure interaction (Phase 7, pending approval)
- No nonlinear behaviour — the model stays elastic at any displacement
- No foundation flexibility; the base is fixed
- No vertical motion

---

## 3. Deriving story stiffness from the period

The spec asks for a fundamental period from the empirical relationship

```
T₁ ≈ Ct · H^x        (H = total building height in metres)
```

and then for story stiffnesses that actually produce that period. For a uniform
shear building — `N` floors, each of mass `m`, joined by equal story stiffness
`k` — the first natural frequency is known in closed form:

```
ω₁ = 2·√(k/m) · sin( π / (2(2N + 1)) )
```

Solving for `k`:

```
k = m · ω₁² / ( 4 · sin²( π / (2(2N + 1)) ) )
```

where `ω₁ = 2π / T₁`.

The derivation is included so the reviewer can check the algebra rather than
take it on trust. The frame type then scales the result:

```
k_effective = k · stiffnessFactor        (moment 1.0, braced ≈ 2.0)
```

**Open question for the adviser:** scaling stiffness by a constant factor after
the period has been targeted means a braced frame ends up with a *shorter*
period than the `Ct·H^x` formula predicted. That is intended — it is what makes
a braced frame stiffer — but it means `Ct` and `x` effectively describe the
moment-frame case only. Confirm that framing.

---

## 4. Ground motion

Three **synthetic** presets, chosen so there are no licensing questions:

| Preset | Construction |
|---|---|
| Harmonic pulse | Sine wave at the user's frequency, with a taper at each end to avoid a shock |
| Random | Band-limited (0.2–4.0 Hz) noise from a **fixed seed**, so runs are reproducible |
| Impulse | A single short jolt (~0.15 s) |

PGA scales the output to the requested value in `g`. Real recorded motions can
be imported as JSON later; the presets keep the MVP self-contained.

---

## 5. Known weakness: one material-independent period formula

Rows 4.1 in the checklist flag this deliberately. Using `Ct = 0.072, x = 0.8`
for all four materials is a convenience, not a finding — real empirical
coefficients depend on the lateral system (moment vs braced) more than on the
deck material. **This is the single assumption most likely to be wrong**, and
it is the one to fix first.

---

## 6. What students are and are not shown

Shown: peak floor displacement, max interstory drift ratio, displacement vs
time, the first three natural periods, and a full CSV export.

Not shown, by design: damage, failure, collapse, safety factors, or any
verdict. Red is reserved for errors in the interface — never for "a bad
result" — so that the tone stays calm and scientific rather than alarming.

---

## 7a. Drift colour bands — a Phase 2 observation

The five-band drift scale currently splits at 0.10 %, 0.20 %, 0.35 % and 0.50 %
(`src/lib/driftScale.ts`). Those thresholds were chosen when there were no real
results to look at.

Now that the engine runs, a default 5-storey concrete building at 0.3 g
produces **drifts above 0.50 %**, which puts every story in the top band and
makes the scale useless for the common case.

This is a design question, not a physics one, so it is flagged rather than
silently retuned:

- The bands should probably be **logarithmic**, or rescaled to whatever range
  the model actually produces across the template set.
- They must keep using **non-judgemental wording** ("very small" → "very
  large"). Whatever values are chosen, the legend must never imply a verdict.
- The top band must be open-ended so an extreme case still renders.

Please advise on thresholds that are meaningful to read, and confirm the
wording.

---

## 8. Design decisions taken in Phase 0

Not engineering assumptions — product and accessibility decisions, recorded so
they are not mistaken for mistakes later.

### Two colours deviate from the spec, both for WCAG AA

The spec commits the project to WCAG AA. Two specified pairs fall short, so
`tokens.css` adds a corrected token alongside the spec value rather than
silently overwriting it. `apps/web/tests/unit/contrast.test.ts` enforces this
and will fail if anyone reverts either.

| Issue | Spec value | Measured | Fix | Measured |
|---|---|---|---|---|
| Muted text on tinted surfaces | `--text-muted` `#64748B` on `--surface-2` `#F1F5F9` | **4.34:1 — fails AA** | new `--text-muted-strong` `#5B6B80` | **4.97:1** ✅ |
| Disclaimer text on the warning band | `--warning` `#B45309` on `#FEF3C7` | **4.51:1 — passes with no margin** at 13px | `--warning-text` → `--accent-yellow-text` `#854D0E` | **6.15:1** ✅ |

The second one is the larger change in *use*, not in value: the disclaimer badge
is text on a yellow band, and `--accent-yellow-text` is the token the spec
already defines for exactly that case. `--warning` itself is untouched and is
still the correct colour for warning *borders and icons*.

Dark theme needed no changes — both pairs already cleared AA comfortably.

### Other decisions

- **Theme follows the OS** by default; an explicit light/dark choice overrides
  and persists. Applied by an inline script in `index.html` before first paint,
  so there is no flash of the wrong theme.
- **Data-visualisation colours do not change between themes.** Hue carries
  meaning in the drift scale and the A/B series, so shifting it with the theme
  would be a lie about the data. The one exception is Config A's blue, which
  needs a lighter shade to stay visible on the dark surface.
- **shadcn/ui variables are aliases, not a second palette.** `--card` points at
  `--surface` and so on, so there is exactly one place a colour is defined.
- **Fonts are bundled** via `@fontsource` rather than loaded from the Google
  Fonts CDN — the app works offline and makes no third-party request.
- **TypeScript is pinned to 5.9.x.** `typescript-eslint` does not yet support
  TypeScript 7, and working lint tooling matters more for a student-maintained
  codebase than a newer compiler.

---

## 8a. Phase 4 decisions that touch how numbers are presented

Comparison mode and saved runs do not change the physics, but they change how
results are *read*, so they are recorded here rather than in the code history.

### The comparison's only shared quantity is the earthquake

Both buildings are solved in a single worker request from one `GroundMotionConfig`.
There is no per-building motion override, by design.

This is worth an adviser's confirmation because it is a claim the UI makes out
loud: the results table prints the PGA and duration in a caption so a reader can
see both sides were shaken identically. If the intended future behaviour is to
compare buildings under *different* site conditions, that is a change to this
invariant, not a UI change — and it would make the caption misleading.

### The comparison expresses change as a percentage of A

The change column is `(B − A) / |A| × 100`. Percentage, not absolute difference,
because the rows mix units — millimetres, seconds, percent drift — and an
absolute difference between a displacement and a period would be meaningless.

Two deliberate restraints:

- Rows where a percentage is meaningless (floors, material, frame type) show `—`
  rather than `0 %`. "The material changed from concrete to steel" is not a
  "0 % change" in material.
- Differences under 0.5 % read `same` rather than a spurious `+0 %`.

### The A/B colours are fixed across themes

Blue `#0072B2` for A and amber `#E69F00` for B in both light and dark. This
follows the same reasoning as the drift scale: hue is carrying identity, so it
must not shift with the theme. The contrast test covers both themes.

**Open question for the adviser:** are these two colours distinguishable enough
for the most common form of colour vision deficiency, deuteranopia? They were
taken from the client spec and chosen because they are the classic
blue/orange pair precisely because it survives red-green deficiency. Worth a
confirmation rather than an assumption.

### A saved run stores the result, but loading re-runs the engine

Loading a run restores its **configuration** and then re-solves, rather than
displaying the stored result array. Two reasons: the numbers on screen always
correspond to the engine that is actually running, and a record saved by an
older app version cannot show a stale result computed by different assumptions.

The consequence is that a saved run's history is not a bit-exact record of what
was on screen. It is a record of the *inputs*. The stored result exists for
reproducibility checking and for the CSV export.

### The localStorage fallback thins long runs

A 20-storey, 60-second run is ~120,000 displacement values — past the ~5 MB
quota after a few saves. Rather than fail with a raw quota error, the fallback
resamples the time series. Peaks, drift ratios and periods are carried over
**exactly**, because they are maxima over the whole record and resampling would
change them.

A thinned run cannot replay the animation frame for frame. The UI says so at the
moment of saving. **Please confirm this is acceptable for the client's intended
use**, or confirm that IndexedDB availability is a reasonable requirement to
state in the README.

### JSON round trips have two documented quirks

Both are harmless and both are locked down by `tests/unit/storage.test.ts`:

- `undefined` does not survive serialisation, so an unset `dampingRatio` is
  absent after a round trip.
- JSON has no negative zero, so `-0` reloads as `0`. They compare equal
  numerically and format identically.

Neither affects any displayed number, but a student diffing two exported files
would otherwise be puzzled.

---

## 9. Validation status

Not yet performed. Phase 5 adds a NumPy/SciPy reference solver and compares at
least 10 cases (floors 3/5/10/15 × materials), reporting percent error and
RMSE against the TypeScript engine.

Results go in [`validation-report.md`](validation-report.md), which doubles as
part of the adviser's hand-off package.