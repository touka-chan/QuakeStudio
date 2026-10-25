"""
Reference solver for the QuakeStudio shear-building model.

============================================================================
WHY THIS FILE EXISTS
============================================================================
A passing unit test proves the TypeScript engine agrees with itself. It says
nothing about whether the TypeScript engine is right. Only an independent
implementation of the same specification can do that.

So this file re-derives the model from scratch, reading the SAME engineering
constants from `reference/constants.json` (exported from
`engineeringAssumptions.ts`). Sharing the constants is deliberate — otherwise
a disagreement would be ambiguous between "a bug", "a typo", and "a stale copy
of a number".

============================================================================
HOW THE INDEPENDENCE IS ACHIEVED
============================================================================
Where a choice was available, this file deliberately makes a DIFFERENT one
from the TypeScript, so that agreement is evidence rather than coincidence:

    Concern          TypeScript (ships)          This reference
    ---------------  --------------------------  --------------------------
    Eigenvalues      hand-written Jacobi,        scipy.linalg.eigh on the
                     on the mass-reduced matrix  GENERALISED problem (M, K)

    Linear solve     hand-written Cholesky       scipy.linalg.cho_solve
                     factor, own triangular      (LAPACK)
                     substitution

    Time stepping    fused double loop over      whole-matrix NumPy
                     matrix rows                 expressions

    Assemblies       index arithmetic into       @ operators on 2-D arrays

The generalisation in the eigenproblem is worth calling out: TypeScript reduces
M⁻¹K and solves a standard problem, this one hands M and K straight to LAPACK.
Agreeing therefore also confirms the reduction step was correct.

============================================================================
WHAT IS *NOT* INDEPENDENT, AND WHY
============================================================================
The model itself is shared, because that is the point — we are checking that
the code implements the specified model, not that two people invented the same
building. Specifically these are shared by design:

    • the empirical period formula  T1 = Ct · H^x
    • the story-stiffness calibration that inverts the uniform-shear-building
      closed form to hit that period
    • Rayleigh damping calibrated to modes 1 and 2
    • Newmark-β with β = 1/4, γ = 1/2
    • the ground-motion waveform formulas

Those are documented in `docs/assumptions.md` and are what the engineering
adviser is being asked to confirm. If one of them is wrong, BOTH
implementations are wrong in the same way and this comparison will happily
report a pass. It cannot catch that — nothing in this repository can.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from scipy.linalg import cho_factor, cho_solve, eigh

REFERENCE_DIR = Path(__file__).resolve().parent.parent
CONSTANTS_PATH = REFERENCE_DIR / "constants.json"


# ============================================================================
# Constants
# ============================================================================


def load_constants(path: Path = CONSTANTS_PATH) -> dict[str, Any]:
    """Read the engineering constants exported from the TypeScript config."""
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)

    if data.get("schemaVersion") != 3:
        raise ValueError(
            f"constants.json has schemaVersion {data.get('schemaVersion')!r}, "
            "expected 3 (bare floor mass + incompatible-use flags). "
            "Re-run `npm run validate:constants`."
        )
    return data


# ============================================================================
# Structural model
# ============================================================================


@dataclass(frozen=True)
class Building:
    """The subset of the building configuration the model actually uses."""

    floors: int
    floor_height_m: float
    width_m: float
    depth_m: float
    material: str
    frame_type: str
    damping_ratio: float | None = None
    floor_loads: tuple[dict[str, Any], ...] = ()
    live_load_participation: float | None = None
    # Whether the occupancy loads are counted at all. None means ON: runs and
    # cases written before the switch existed never turned loads off.
    loads_enabled: bool | None = None


def fundamental_period_s(building: Building, material: dict[str, Any]) -> float:
    """Empirical fundamental period T1 = Ct · H^x, in seconds."""
    height_m = building.floors * building.floor_height_m
    return material["periodCt"] * height_m ** material["periodExponentX"]


def story_stiffness_nm(
    floor_mass_kg: float, floors: int, target_period_s: float
) -> float:
    """
    Story stiffness that yields a target fundamental period.

    For a uniform shear building of N floors, each of mass m, joined by equal
    story stiffness k, the first natural frequency has the closed form

        ω1 = 2·√(k/m) · sin( π / (2(2N+1)) )

    so

        k = m·ω1² / ( 4·sin²( π / (2(2N+1)) ) )

    `floor_mass_kg` is the REFERENCE floor mass (all Office, default loads), not
    the user's actual floor mass. Passing the actual mass would change the
    stiffness whenever a load changed, which is exactly what the floor-loads
    feature must not do.
    """
    if target_period_s <= 0:
        raise ValueError("Target period must be positive")
    if floors < 1:
        raise ValueError("Need at least one floor")

    omega1 = 2.0 * math.pi / target_period_s
    sin_term = math.sin(math.pi / (2.0 * (2.0 * floors + 1.0)))
    return (floor_mass_kg * omega1 * omega1) / (4.0 * sin_term * sin_term)


def stiffness_matrix(floors: int, story_stiffness_nm_value: float) -> np.ndarray:
    """
    K for a uniform shear building: tridiagonal, k on each off-diagonal.

    A diagonal entry counts the stories attached to that floor. Every floor
    except the TOP has two — one down, one up — with floor 1's lower story
    connecting it to the ground. Only the top floor has a single story beneath
    it, so its diagonal is k, not 2k.

    Built here by assembling a diagonal matrix and two off-diagonal ones,
    rather than by the row loop the TypeScript uses.
    """
    k = story_stiffness_nm_value
    diagonal = np.full(floors, 2.0 * k)
    diagonal[-1] = k  # the top floor has one story, not two

    matrix = np.diag(diagonal)
    off = np.full(floors - 1, -k)
    matrix += np.diag(off, k=1) + np.diag(off, k=-1)
    return matrix


def rayleigh_coefficients(
    omega: np.ndarray, damping_ratio: float, floors: int
) -> tuple[float, float]:
    """
    Rayleigh coefficients calibrated to the damping ratio at modes 1 and 2.

        ζ(ω) = a0/(2ω) + a1·ω/2

    Solving at ω1 and ω2 for a common ζ:

        a0 = 2ζω1ω2/(ω1+ω2)        a1 = 2ζ/(ω1+ω2)

    A single-floor building has one mode, so both cannot be hit. The
    mass-proportional case (a1 = 0) is used instead, which still gives exactly
    ζ at ω1.
    """
    omega1 = float(omega[0]) if omega.size else 0.0

    if floors < 2 or omega.size < 2 or omega1 <= 0.0:
        return (2.0 * damping_ratio * omega1 if omega1 > 0 else 0.0), 0.0

    omega2 = float(omega[1])
    a0 = (2.0 * damping_ratio * omega1 * omega2) / (omega1 + omega2)
    a1 = (2.0 * damping_ratio) / (omega1 + omega2)
    return a0, a1


def damping_matrix(mass: np.ndarray, stiffness: np.ndarray, a0: float, a1: float) -> np.ndarray:
    """C = a0·M + a1·K."""
    return a0 * mass + a1 * stiffness


# ============================================================================
# Floor loads
# ============================================================================


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _default_floor_load(floor: int, loads: dict[str, Any]) -> dict[str, Any]:
    return {
        "floor": floor,
        "occupancy": "office",
        "deadLoadKPa": loads["defaultDeadLoadKPa"],
        "liveLoadKPa": loads["occupancies"]["office"]["liveKPa"],
        "liveOverridden": False,
    }


def normalise_floor_loads(
    building: Building, constants: dict[str, Any]
) -> list[dict[str, Any]]:
    """
    One entry per floor, exactly `building.floors` long.

    Mirrors `config/floorLoads.ts::normalizeFloorLoads`:
      • no loads          → all Office at the defaults (old runs migrate here)
      • too few           → new floors copy the nearest existing floor
      • too many          → extra floors are dropped from the top
      • out of range      → clamped; the Zod schema reports the error in the UI
    """
    loads = constants["loadAssumptions"]
    count = max(0, int(building.floors))
    source = list(building.floor_loads or ())
    out: list[dict[str, Any]] = []

    for index in range(count):
        fallback = out[-1] if out else _default_floor_load(index + 1, loads)
        candidate = source[index] if index < len(source) else None

        if not isinstance(candidate, dict):
            out.append({**fallback, "floor": index + 1})
            continue

        occupancy = candidate.get("occupancy")
        if occupancy not in loads["occupancies"]:
            occupancy = "office"
        live_fallback = loads["occupancies"][occupancy]["liveKPa"]

        dead = candidate.get("deadLoadKPa")
        dead = (
            float(dead)
            if isinstance(dead, (int, float)) and math.isfinite(dead)
            else loads["defaultDeadLoadKPa"]
        )
        live = candidate.get("liveLoadKPa")
        live = (
            float(live)
            if isinstance(live, (int, float)) and math.isfinite(live)
            else live_fallback
        )

        out.append(
            {
                "floor": index + 1,
                "occupancy": occupancy,
                "deadLoadKPa": _clamp(
                    dead, loads["minDeadLoadKPa"], loads["maxDeadLoadKPa"]
                ),
                "liveLoadKPa": _clamp(
                    live, loads["minLiveLoadKPa"], loads["maxLiveLoadKPa"]
                ),
                "liveOverridden": candidate.get("liveOverridden") is True,
            }
        )
    return out


def participation_for(building: Building, constants: dict[str, Any]) -> float:
    """ψ, falling back to the documented default."""
    loads = constants["loadAssumptions"]
    value = building.live_load_participation
    if value is None:
        return float(loads["liveLoadParticipation"])
    return _clamp(float(value), 0.0, 1.0)


def floor_area_m2(building: Building) -> float:
    return max(0.0, building.width_m) * max(0.0, building.depth_m)


def reference_floor_mass_kg(area_m2: float, constants: dict[str, Any]) -> float:
    """
    Floor mass of the reference building: all Office, DEFAULT loads and
    DEFAULT participation. Stiffness is calibrated from this, never from the
    user's loads — see the header note in `engine/buildingModel.ts`.
    """
    loads = constants["loadAssumptions"]
    reference_weight_kn = (
        loads["defaultDeadLoadKPa"]
        + loads["liveLoadParticipation"] * loads["occupancies"]["office"]["liveKPa"]
    ) * area_m2
    return reference_weight_kn * 1000.0 / loads["gravityMs2"]


def build_model(building: Building, constants: dict[str, Any]) -> dict[str, Any]:
    """Assemble M, K, C, and the natural frequencies, for the given building."""
    n = building.floors
    material = constants["materials"][building.material]
    frame = constants["frameTypes"][building.frame_type]
    load_constants = constants["loadAssumptions"]
    gravity = float(load_constants["gravityMs2"])

    area_m2 = floor_area_m2(building)
    loads = normalise_floor_loads(building, constants)
    participation = participation_for(building, constants)

    # ---- Mass, from the floor loads (or the bare structure) ---------------
    #
    # loads_enabled is None on runs and cases written before the switch
    # existed: they counted loads, so None means ON — never a massless
    # building. In OFF mode the occupancy loads and the dead-load inputs are
    # not consulted at all; every floor weighs its material's bare floor mass
    # times its area, converted to kilonewtons the same way the TypeScript's
    # bareFloorWeightKN does: mass × gravity / 1000, in that order, so the
    # two sides agree to the last bit and not merely to the gate.
    if building.loads_enabled is not False:
        floor_dead_kn = [load["deadLoadKPa"] * area_m2 for load in loads]
        floor_live_counted_kn = [
            participation * load["liveLoadKPa"] * area_m2 for load in loads
        ]
        floor_weights_kn = [
            dead + live for dead, live in zip(floor_dead_kn, floor_live_counted_kn)
        ]
    else:
        bare_mass_kgm2 = float(material["bareMassPerAreaKgM2"])
        floor_weights_kn = [
            (bare_mass_kgm2 * max(0.0, area_m2)) * gravity / 1000.0
            for _floor in range(n)
        ]
        # All of a bare floor's weight is structure; none of it is counted live.
        floor_dead_kn = list(floor_weights_kn)
        floor_live_counted_kn = [0.0] * n
    floor_masses_kg = [weight * 1000.0 / gravity for weight in floor_weights_kn]
    mass = np.diag(floor_masses_kg)

    # ---- Stiffness, from the reference mass -------------------------------
    reference_mass_kg = reference_floor_mass_kg(area_m2, constants)
    target_period = fundamental_period_s(building, material)
    # The frame factor is applied AFTER the period is targeted, so a braced
    # frame ends up stiffer — and therefore with a shorter period — than the
    # empirical formula predicts. Flagged in docs/assumptions.md §5.
    story_stiffness = (
        story_stiffness_nm(reference_mass_kg, n, target_period)
        * frame["stiffnessFactor"]
    )

    stiffness = stiffness_matrix(n, story_stiffness)

    # Generalised symmetric eigenproblem K·φ = ω²·M·φ, solved directly by
    # LAPACK. This handles a different mass on every floor; the TypeScript
    # reduces to M^{-1/2}·K·M^{-1/2} first.
    eigenvalues = eigh(stiffness, mass, eigvals_only=True)

    omega = np.sqrt(np.clip(eigenvalues, 0.0, None))
    omega = omega[omega > 0.0]  # the base is fixed, so there is no zero mode

    # omega ascends, so periods descend: `periods[0]` is the fundamental mode,
    # which has the LONGEST period. Do not sort.
    periods_s = 2.0 * math.pi / omega

    damping_ratio = (
        building.damping_ratio
        if building.damping_ratio is not None
        else material["dampingRatio"]
    )
    a0, a1 = rayleigh_coefficients(omega, damping_ratio, n)

    return {
        "floors": n,
        "floor_mass_kg": floor_masses_kg,
        "floor_weights_kn": floor_weights_kn,
        "floor_dead_kn": floor_dead_kn,
        "floor_live_counted_kn": floor_live_counted_kn,
        "total_weight_kn": float(sum(floor_weights_kn)),
        "participation": participation,
        "reference_mass_kg": reference_mass_kg,
        "story_stiffness_nm": story_stiffness,
        "mass": mass,
        "stiffness": stiffness,
        "damping": damping_matrix(mass, stiffness, a0, a1),
        "omega": omega,
        "periods_s": periods_s,
        "rayleigh_a0": a0,
        "rayleigh_a1": a1,
        "damping_ratio": damping_ratio,
    }


# ============================================================================
# Ground motion
# ============================================================================

_RANDOM_HARMONICS = 12


def _pseudo_random(seed: int) -> float:
    """
    Deterministic pseudo-random value in [0, 1) from an integer seed.

    Sin-based hashing: short, stable across engines, and good enough for
    choosing which frequencies a synthetic record contains. Not suitable for
    anything that needs statistical quality.

    The formula matches the TypeScript exactly. Both languages call the
    platform's libm `sin`, which agrees to the last bit for these inputs; if a
    platform ever disagreed by one ULP the resulting series would differ by
    ~1e-16 relative, far below the tolerance this comparison asserts.
    """
    x = math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return x - math.floor(x)


def _harmonic(t: float, motion: dict[str, Any], constants: dict[str, Any]) -> float:
    f = motion["frequencyHz"]
    taper = constants["groundMotion"]["taperDurationS"]

    # Taper in and out so the record starts and ends at rest. Without this the
    # building gets an artificial impulse at t=0 and at the end.
    ramp = min(1.0, t / taper, (motion["durationS"] - t) / taper)
    envelope = math.sin((math.pi / 2.0) * ramp) if ramp > 0.0 else 0.0

    return envelope * math.sin(2.0 * math.pi * f * t)


def _random(t: float, motion: dict[str, Any], constants: dict[str, Any]) -> float:
    band = constants["groundMotion"]["randomBandHz"]
    low, high = band["low"], band["high"]
    seed = constants["groundMotion"]["defaultSeed"]

    # A fixed set of in-band sinusoids at seed-derived frequencies: band-limited
    # noise that is deterministic and cheap enough to regenerate on a drag.
    value = 0.0
    for k in range(1, _RANDOM_HARMONICS + 1):
        u_freq = _pseudo_random(seed + k * 7919)
        frequency = low + (high - low) * u_freq
        phase = 2.0 * math.pi * _pseudo_random(seed + k * 104729)
        value += (1.0 / k) * math.sin(2.0 * math.pi * frequency * t + phase)

    ramp = min(1.0, t / 0.5, (motion["durationS"] - t) / 0.5)
    return value * (math.sin((math.pi / 2.0) * ramp) if ramp > 0.0 else 0.0)


def _impulse(t: float, constants: dict[str, Any]) -> float:
    duration = constants["groundMotion"]["impulseDurationS"]
    if t > duration:
        return 0.0

    # A half-sine pulse: zero at both ends, so it transfers momentum without
    # the discontinuity a raw spike would introduce.
    lead = 0.2 * duration
    if t < lead:
        return 0.0
    return math.sin(((t - lead) / (duration - lead)) * math.pi)


def generate_ground_motion(
    motion: dict[str, Any], constants: dict[str, Any]
) -> tuple[np.ndarray, np.ndarray]:
    """Ground acceleration samples in m/s², one per timestep."""
    dt = constants["solver"]["dtS"]
    steps = max(2, round(motion["durationS"] / dt) + 1)

    time = np.empty(steps)
    raw = np.empty(steps)

    for step in range(steps):
        t = step * dt
        time[step] = t

        preset = motion["preset"]
        if preset == "harmonic":
            raw[step] = _harmonic(t, motion, constants)
        elif preset == "random":
            raw[step] = _random(t, motion, constants)
        elif preset == "impulse":
            raw[step] = _impulse(t, constants)
        else:
            raise ValueError(f"Unknown ground motion preset: {preset!r}")

    # Scale so the largest sample equals the requested PGA exactly, so every
    # preset honours the user's strength setting identically.
    peak = float(np.max(np.abs(raw))) if raw.size else 0.0
    scale = (motion["pgaG"] * constants["gravityMs2"]) / peak if peak > 0.0 else 0.0
    accel = raw * scale

    return time, accel


# ============================================================================
# Time integration
# ============================================================================


def simulate(building: Building, motion: dict[str, Any], constants: dict[str, Any]) -> dict[str, Any]:
    """
    Solve the building's response to a ground motion with Newmark-β.

    β = 1/4, γ = 1/2 (average acceleration). Unconditionally stable, so the
    timestep affects accuracy but can never blow up; non-dissipative, so it
    does not artificially swallow high-frequency ringing.

    Written with whole-matrix expressions. The TypeScript solver fuses
    everything into one loop over matrix rows, which is faster but gives no
    second reading of the algebra.
    """
    dt = constants["solver"]["dtS"]
    beta = constants["solver"]["newmarkBeta"]
    gamma = constants["solver"]["newmarkGamma"]

    model = build_model(building, constants)
    time, ground_accel = generate_ground_motion(motion, constants)

    n = model["floors"]
    steps = time.size

    mass = model["mass"]
    damping = model["damping"]
    stiffness = model["stiffness"]

    # Newmark constants
    a0 = 1.0 / (beta * dt * dt)
    a1 = gamma / (beta * dt)
    a2 = 1.0 / (beta * dt)
    a3 = 1.0 / (2.0 * beta) - 1.0
    a4 = gamma / beta - 1.0
    a5 = dt * (gamma / (2.0 * beta) - 1.0)

    # K_eff = K + (1/(β dt²))·M + (γ/(β dt))·C — constant for a given model
    # and timestep, so it is factored once.
    k_eff = stiffness + a0 * mass + a1 * damping
    lu = cho_factor(k_eff, lower=True)

    u = np.zeros(n)  # displacement
    v = np.zeros(n)  # velocity
    acc = np.zeros(n)  # acceleration

    influence = np.ones(n)  # the "1" of influence 1
    history = np.zeros((steps, n))  # [step][floor]

    for step in range(steps):
        ag = ground_accel[step]

        # Effective load: p = −M·1·a_g, distributed by floor mass.
        rhs = -(mass @ (influence * ag))
        rhs += mass @ (a0 * u + a2 * v + a3 * acc)
        rhs += damping @ (a1 * u + a4 * v + a5 * acc)

        u_next = cho_solve(lu, rhs)

        acc_next = a0 * (u_next - u) - a2 * v - a3 * acc
        v_next = v + dt * ((1.0 - gamma) * acc + gamma * acc_next)

        u, v, acc = u_next, v_next, acc_next
        history[step] = u

    floor_disp = history.T  # [floor][step]

    return {
        "time": time,
        "floor_disp": floor_disp,
        "periods_s": model["periods_s"][: constants["solver"]["reportedModes"]],
        "ground_accel": ground_accel,
        "story_stiffness_nm": model["story_stiffness_nm"],
        "damping_ratio": model["damping_ratio"],
        **summarise(floor_disp, building, constants, model),
    }


def summarise(
    floor_disp: np.ndarray,
    building: Building,
    constants: dict[str, Any],
    model: dict[str, Any],
) -> dict[str, Any]:
    """
    Turn raw displacement histories into the outputs the app reports.

    Displacements stay in METRES throughout; the UI converts to millimetres at
    the edge.

    Note the drift definition: it is the difference of per-floor PEAKS, not the
    peak of the instantaneous story drift. That is unusual — the instantaneous
    form would be larger — but it is what the app computes and reports, so the
    reference reproduces it rather than quietly "improving" it. Flagged for the
    engineering adviser alongside the drift-band question in
    docs/assumptions.md §7a.
    """
    peak_disp = np.max(np.abs(floor_disp), axis=1)
    max_disp = float(np.max(peak_disp))

    drift_ratio = np.zeros(building.floors)
    for floor in range(building.floors):
        below = 0.0 if floor == 0 else peak_disp[floor - 1]
        drift = (peak_disp[floor] - below) / building.floor_height_m
        drift_ratio[floor] = max(0.0, drift)

    return {
        "peak_disp": peak_disp,
        "max_disp": max_disp,
        "drift_ratio": drift_ratio,
        "max_drift_ratio": float(np.max(drift_ratio)),
        "floor_weights_kn": model["floor_weights_kn"],
        "floor_dead_kn": model["floor_dead_kn"],
        "floor_live_counted_kn": model["floor_live_counted_kn"],
        "total_weight_kn": model["total_weight_kn"],
        "floor_masses_kg": model["floor_mass_kg"],
    }


def building_from_case(case: dict[str, Any]) -> Building:
    """Build a `Building` from one entry of `cases.json`."""
    raw = case["building"]
    raw_loads = raw.get("floorLoads")
    return Building(
        floors=int(raw["floors"]),
        floor_height_m=float(raw["floorHeightM"]),
        width_m=float(raw["widthM"]),
        depth_m=float(raw["depthM"]),
        material=str(raw["material"]),
        frame_type=str(raw["frameType"]),
        damping_ratio=(
            None if raw.get("dampingRatio") is None else float(raw["dampingRatio"])
        ),
        floor_loads=(
            tuple(dict(item) for item in raw_loads)
            if isinstance(raw_loads, list)
            else ()
        ),
        live_load_participation=(
            None
            if raw.get("liveLoadParticipation") is None
            else float(raw["liveLoadParticipation"])
        ),
        loads_enabled=(
            None if raw.get("loadsEnabled") is None else bool(raw["loadsEnabled"])
        ),
    )