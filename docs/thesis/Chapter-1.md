# CHAPTER 1
## INTRODUCTION

### Background of the Study

Earthquakes impose lateral demands on buildings through ground shaking, and the resulting floor movement depends jointly on the characteristics of the ground motion and the properties of the structure. For students beginning to study earthquake behavior, the relationship between input shaking, structural characteristics, and time-varying lateral displacement is central but difficult to grasp from equations alone. Hsu et al. (2022) demonstrated that coupling dynamic analysis with three-dimensional visualization can make calculated seismic responses inspectable, providing a precedent for connecting computation with visible building movement.

QuakeStudio is developed in this context as an educational, browser-based prototype for interactive 3D building modeling and simplified earthquake simulation. The user creates a regular multistory building by selecting a template or adjusting the number of floors, floor height, plan dimensions, material, and structural frame type; applies a specified synthetic ground-motion input; and observes the animated lateral response together with displacement measurements and graphs. Comparison of up to four configurations under the identical earthquake is supported so that differences in response can be examined while holding the input fixed.

The prototype implements a linear-elastic shear-building model in one horizontal direction. Floor masses are lumped at each level, stories provide lateral stiffness between levels, and viscous damping is represented through Rayleigh damping calibrated at the first two modes. The equations of motion,

M·ü + C·u̇ + K·u = −M·1·a_g(t),

are integrated with the Newmark average-acceleration method (β = 1/4, γ = 1/2) at a fixed timestep dt = 0.01 s. Zuo et al. (2022) describe idealized shear-building models as a low-computational-cost simplification widely used to approximate multistory seismic response, which supports their selection for a student prototype subject to a two-to-three-month development scope. Ji et al. (2023) further underscore the engineering relevance of interstory drift measurement in shaking-table assessment, which motivates reporting drift alongside displacement in the prototype.

Browser delivery is adopted because it requires no specialized software installation. Wang et al. (2025) demonstrated the technical potential of WebGL for interactive seismic visualization in the browser, which provides the technical basis for the present 3D viewport, playback controls, and charting. Kuncoro et al. (2023) reported favorable learning outcomes from virtual-reality media on earthquake-resistant construction for civil engineering students, which motivates investigating the educational potential of interactive visualization while stopping short of claiming measured learning gains before an appropriate learning assessment is conducted.

Critically, every engineering coefficient in the prototype is a placeholder pending review by a civil or structural engineering adviser. The single source of truth is `apps/web/src/config/engineeringAssumptions.ts`, in which each assumed value carries an explicit placeholder marker enforced by unit test. Cross-validation proves only that the code implements the documented model faithfully; it cannot prove that the model coefficients are physically correct. A disclaimer to this effect is visible in the application at all times, and the About and Assumptions page derives its rows from the configuration file at runtime so that displayed assumptions cannot drift from what the engine executes. Damage prediction and structural safety certification are outside the scope of the study.

### Statement of the Problem

Buildings undergo lateral movement during earthquake ground shaking, and that response must be examined in relation to both the imposed motion and the properties of the structure. Hsu et al. (2022) connected dynamic building analysis with 3D visualization to present calculated seismic responses. For this student research project, the problem is to connect those numerical responses with an understandable model that users can inspect, modify, and compare, displaying floor movement alongside displacement measurements so that users can examine how response changes throughout a simulation.

Specifically, the study addresses the following:

1. How can building geometry (number of floors, floor height, plan width and depth), structural properties (material, frame type, derived mass, stiffness, and damping), and earthquake inputs (preset, peak ground acceleration, frequency, duration) be connected to time-varying floor displacement within an understandable browser interface?
2. How can calculated floor displacements be made to drive both the 3D animation and the displacement graphs so that visible movement is always consistent with the reported numbers?
3. How can users be enabled to compare up to four building configurations under the identical ground motion using common measurements — peak floor displacement relative to the ground, displacement over time, maximum interstory drift ratio, and natural periods — with reproducible inputs and stated assumptions?
4. How can simulation outputs be shown to agree with independent reference calculations, and how can users' ability to configure models, run simulations, and interpret and compare displayed results be evaluated without overstating educational or safety claims?

The civil engineering consultation identified soil type, earthquake magnitude and intensity, building material, fault distance, building height or number of stories, and foundation type as relevant features in real assessment. Translating the full set into a verified educational model exceeds the prototype scope. Soil type, foundation type, fault distance, and a 0–10 capability rating are therefore treated as proposed future scope (Phase 7), visible but disabled in the interface, and are not among the computed outputs of the present prototype.

### Objectives of the Study

**General Objective**

To develop QuakeStudio as a simplified, browser-based platform for visualizing earthquake-related building response, in which user-selected building characteristics and a specified ground-motion input produce a computed lateral response that is shown consistently as 3D animation and as numerical and graphical outputs.

**Specific Objectives**

1. To implement a regular multistory linear-elastic shear-building model with lumped floor mass, story stiffness, and Rayleigh damping, integrated with Newmark-β (β = 1/4, γ = 1/2) at dt = 0.01 s in a Web Worker, with all engineering coefficients isolated in a single reviewed assumptions file.
2. To implement a browser-based 3D environment with template selection, parameter controls, playback (speed, pause, loop, ×20 motion exaggeration applied to the view only), displacement-over-time and peak-by-floor charts, metric cards, hover floor callouts, and CSV/JSON run export and import.
3. To implement comparison of up to four buildings (A–D) under the identical ground motion in a single worker request, with side-by-side and ghost-overlay presentations, fixed series hues with letter labels, and a change-from-A column that states no verdict of which building is better.
4. To verify calculation fidelity through cross-check of the TypeScript engine against an independent Python (NumPy/SciPy) reference solver over a 16-case matrix with a 1e-6 agreement gate, and to confirm animation-graph numerical consistency and run reproducibility.
5. To evaluate functionality, browser performance (entry JavaScript against a 220 KB gzip budget, 60 fps animation with zero React renders in the loop), accessibility (axe-core plus keyboard and live-region checks), and usability through task-based trials and the System Usability Scale, with the usability study reported only after real participants are tested.

### Significance of the Study

**Students.** The prototype provides an inspectable link between building choices and simulated lateral sway. By holding the earthquake fixed while varying height, material, or frame type, students can examine relative behavior — for example, that a braced frame sways less than the same building as a moment frame, or that a taller building exhibits a longer fundamental period — without requiring licensed analysis software.

**Teachers.** The platform offers a classroom-ready demonstration that runs offline after download, including as a self-contained Android package for laboratories with limited connectivity. Saved runs, exported CSV at full precision in displayed units, and JSON export/import support guided exercises and review.

**Student Researchers and Programmer.** The project enforces maintainable practice: single-source engineering constants, single-source design tokens, batched solver requests, deterministic simulation, and verification that gates integration. These constraints keep the prototype auditable by the engineering adviser.

**Engineering Adviser.** All assumptions, open questions, measured limitations (notably drift-band calibration and material-independent period coefficients), and verification evidence are documented in a review packet, so that review effort concentrates on physical correctness rather than on reconstructing what the code does.

**Future Researchers.** The instrumented usability protocol, scoring cross-check, and drift-distribution analysis provide a starting point for a properly powered classroom study and for the deferred site-factors extension, subject to client and adviser approval.

### Scope and Delimitations

The prototype is limited to the following implemented scope:

- **Building:** Regular multistory building, 1–20 floors; floor height 2.2–5.0 m (default 3.0 m); plan 4–40 m (defaults 14 × 10 m); materials concrete, steel, composite, wood; frames moment (stiffness factor 1.0) and braced (factor 2.0). Default is a 5-story concrete moment frame. Each floor's counted earthquake weight is (dead load + ψ × live load) × floor area, with a 4.8 kPa editable dead load, live loads set per floor use (office 2.4, residential 1.9, parking 2.4, storage 6.0 kPa, from published summaries of NSCP 2015 Table 205-1), and ψ = 0.25 — all placeholders pending engineer review. Damping ratios are 2–5% by material (placeholders). Period coefficients Ct = 0.072 and exponent x = 0.8 are identical for all four materials (known weakness, flagged for adviser review).
- **Motion:** Three synthetic presets — harmonic pulse, band-limited random (seeded, default 20240501), single impulse — scaled to exact peak ground acceleration 0.05–0.60 g (default 0.30 g); frequency 0.2–5.0 Hz where applicable (default 1.4 Hz); duration 5–60 s (default 20 s). No recorded accelerograms are used in the prototype.
- **Computation:** One horizontal direction only; linear-elastic response only; no damage, yielding, soil–structure interaction, vertical motion, torsion, or safety assessment. Engine units are SI (metres, seconds); the interface converts to millimetres and percent at the display edge.
- **Outputs:** Per-floor displacement history, peak floor displacement, maximum displacement, interstory drift ratio (difference of per-floor peaks divided by story height), maximum drift ratio with worst-story index, first three natural periods, and ground acceleration history. Motion exaggeration (default ×20, range 1–60) magnifies the 3D view only; numbers are unaffected.
- **Platform:** Progressive Web App installable on Android and desktop Chromium; ordinary web page on Safari/iOS (install not offered where the platform exposes no install API). Offline use after download. Service worker is disabled inside the Android package to avoid serving a stale precache after update.

Explicitly excluded from computed results in this study are soil type, foundation type, fault distance effects, and any 0–10 capability rating. Those controls appear in the interface as disabled future scope and will require separate engineering approval before implementation. Claims of improved learning are also excluded until a dedicated learning assessment with real participants is completed; the present usability work ships the instrument, not a score.

### Definition of Terms

**Floor displacement.** Horizontal displacement of a floor relative to the ground, in metres inside the engine and shown in millimetres. Operationally, `SimulationResult.floorDisp[floor][time]`.

**Peak floor displacement.** Maximum absolute displacement attained by a floor over the record. The building maximum is the largest across floors.

**Interstory drift ratio.** For each story, the difference between the peak displacement of a floor and that of the floor below (ground taken as zero for story 1), divided by the story height, as a fraction and shown as percent. The prototype uses difference-of-peaks, which is documented as differing from simultaneous-peak drift and flagged for adviser review.

**Fundamental period (T1).** Longest natural period from T1 = Ct·H^x, in seconds, where H is total height. Story stiffness is then calibrated in closed form to deliver that period for the uniform shear building before application of the frame factor.

**Peak ground acceleration (PGA).** Largest absolute ground acceleration in the generated record, in g and scaled exactly to the user setting.

**Newmark average-acceleration integration.** Time-stepping with β = 1/4 and γ = 1/2, unconditionally stable and non-dissipative, used to solve the equations of motion at dt = 0.01 s.

**Rayleigh damping.** Viscous damping matrix C = a0·M + a1·K with coefficients fitted to the material damping ratio at the first two modes (mass-proportional fallback for a single floor).

**Shared-motion comparison.** Evaluation of two to four building configurations against the same ground-motion samples in one worker request, so that neither side can display numbers from different inputs due to racing requests.

**Reproducibility.** Property that identical inputs produce bit-identical outputs; the random preset is seeded so that the same seed returns the same shake.
