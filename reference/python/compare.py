"""
Run the Python reference over the validation matrix and compare it with the
TypeScript engine.

============================================================================
WHAT THIS DOES AND DOES NOT PROVE
============================================================================
It proves: the TypeScript engine implements the model in
`engineeringAssumptions.ts` as specified.

It does NOT prove the model is physically correct. Both implementations read
the same constants and follow the same formulation, so a wrong assumption —
say a damping ratio twice what it should be — is wrong identically in both, and
this comparison reports a clean pass.

That distinction is the whole point of the report, and it is why the 5%
tolerance in the spec is NOT the threshold used here. See "Tolerances" below.

Usage
-----
    python reference/python/compare.py

    --tolerance FLOAT   relative agreement required to pass (default 1e-6)
    --report PATH       where to write the report
    --no-report         compare and print, but write nothing

Exits non-zero if any case falls outside tolerance, so it can gate CI.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from reference_solver import (  # noqa: E402
    Building,
    building_from_case,
    load_constants,
    simulate,
)

REFERENCE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = REFERENCE_DIR.parent

CONSTANTS_PATH = REFERENCE_DIR / "constants.json"
CASES_PATH = REFERENCE_DIR / "cases.json"
TS_RESULTS_PATH = REFERENCE_DIR / "ts-results.json"
DEFAULT_REPORT_PATH = REPO_ROOT / "docs" / "validation-report.md"

# The tolerance named in the specification, kept for reporting. It is a target
# for agreement with a REAL structure, not for two implementations of the same
# specification — see the report for the full argument.
SPEC_TOLERANCE_PCT = 5.0


# ============================================================================
# Error measures
# ============================================================================


def relative_error(ts_value: float, py_value: float) -> float:
    """
    Relative difference between two values.

    Symmetric and scaled to the larger magnitude, so a value near zero does not
    report an enormous percentage for a difference that is physically
    meaningless.
    """
    scale = max(abs(ts_value), abs(py_value))
    if scale == 0.0:
        return 0.0
    return abs(ts_value - py_value) / scale


def nrmse(ts_series: np.ndarray, py_series: np.ndarray) -> float:
    """
    Normalised RMSE over a whole time history.

    Peaks alone are not enough: two implementations can agree on every peak and
    still be a quarter-cycle out of phase, which would look correct in a bar
    chart and be badly wrong as an animation. The history catches that, and
    normalising by the signal's own RMS makes it scale-free.
    """
    if ts_series.shape != py_series.shape:
        raise ValueError(
            f"history length mismatch: TypeScript {ts_series.shape} vs Python {py_series.shape}"
        )
    rmse = float(np.sqrt(np.mean((ts_series - py_series) ** 2)))
    scale = float(np.sqrt(np.mean(ts_series**2)))
    if scale == 0.0:
        return 0.0
    return rmse / scale


def phase_lag_s(ts_series: np.ndarray, py_series: np.ndarray, dt: float) -> float:
    """
    Time shift that best aligns the two histories, by cross-correlation.

    A near-zero lag means the two agree in TIME, not merely in magnitude. This
    is reported rather than asserted, because it is the number that would move
    if an integrator had a subtly different phase error while still producing
    matching peaks.
    """
    a = ts_series - ts_series.mean()
    b = py_series - py_series.mean()
    if not np.any(a) or not np.any(b):
        return 0.0

    correlation = np.correlate(b, a, mode="full")
    lag_samples = int(np.argmax(correlation)) - (len(a) - 1)

    # A sub-sample refinement by parabolic interpolation around the peak.
    refined = float(lag_samples)
    if 0 < lag_samples < len(correlation) - 1:
        left, centre, right = correlation[lag_samples - 1 : lag_samples + 2]
        denominator = left - 2 * centre + right
        if denominator != 0.0:
            refined += 0.5 * (left - right) / denominator

    return refined * dt


# ============================================================================
# Comparison
# ============================================================================


def compare_case(ts_case: dict[str, Any], case: dict[str, Any], constants: dict[str, Any]) -> dict[str, Any]:
    """Solve one case with the reference and measure the differences."""
    building: Building = building_from_case(case)
    result = simulate(building, case["motion"], constants)

    ts_periods = np.asarray(ts_case["periodsS"], dtype=float)
    py_periods = np.asarray(result["periods_s"], dtype=float)
    count = min(ts_periods.size, py_periods.size)

    period_errors = [
        relative_error(float(ts_periods[i]), float(py_periods[i])) for i in range(count)
    ]

    ts_peaks = np.asarray(ts_case["peakDisp"], dtype=float)
    py_peaks = np.asarray(result["peak_disp"], dtype=float)
    peak_errors = [
        relative_error(float(ts_peaks[i]), float(py_peaks[i]))
        for i in range(min(ts_peaks.size, py_peaks.size))
    ]

    ts_drift = np.asarray(ts_case["driftRatio"], dtype=float)
    py_drift = np.asarray(result["drift_ratio"], dtype=float)
    drift_errors = [
        relative_error(float(ts_drift[i]), float(py_drift[i]))
        for i in range(min(ts_drift.size, py_drift.size))
    ]

    top = int(ts_case["topFloorIndex"])
    ts_history = np.asarray(ts_case["topFloorDisp"], dtype=float)
    py_history = np.asarray(result["floor_disp"][top], dtype=float)

    ts_accel = np.asarray(ts_case["groundAccel"], dtype=float)
    py_accel = np.asarray(result["ground_accel"], dtype=float)

    dt = constants["solver"]["dtS"]

    return {
        "id": case["id"],
        "why": case["why"],
        "floors": building.floors,
        "material": building.material,
        "frame": building.frame_type,
        "preset": case["motion"]["preset"],

        "ts_period_1": float(ts_periods[0]) if ts_periods.size else 0.0,
        "py_period_1": float(py_periods[0]) if py_periods.size else 0.0,

        "period_errors": period_errors,
        "peak_errors": peak_errors,
        "drift_errors": drift_errors,

        "max_drift_error": relative_error(ts_case["maxDriftRatio"], result["max_drift_ratio"]),
        "max_disp_error": relative_error(ts_case["maxDisp"], result["max_disp"]),

        "history_nrmse": nrmse(ts_history, py_history),
        "phase_lag_s": phase_lag_s(ts_history, py_history, dt),
        "accel_nrmse": nrmse(ts_accel, py_accel),

        "story_stiffness_ts": None,  # filled in below from the TS side if present
    }


# ============================================================================
# Report
# ============================================================================


def worst(rows: list[dict[str, Any]], key: str) -> float:
    values: list[float] = []
    for row in rows:
        value = row[key]
        if isinstance(value, list):
            values.extend(value)
        elif value is not None:
            values.append(float(value))
    return max(values) if values else 0.0


def worst_of(values: list[float]) -> float:
    """Largest of a list of errors, for the per-case table."""
    return max(values) if values else 0.0


def pct(value: float) -> str:
    if value == 0.0:
        return "0"
    if value < 1e-4:
        return f"{value:.1e}"
    return f"{value * 100:.4f}"


def write_report(
    rows: list[dict[str, Any]],
    tolerance: float,
    report_path: Path,
    constants: dict[str, Any],
    ts_meta: dict[str, Any],
) -> None:
    """Render `docs/validation-report.md` from the measured numbers."""
    case_count = len(rows)

    worst_period = worst(rows, "period_errors")
    worst_peak = worst(rows, "peak_errors")
    worst_drift = worst(rows, "drift_errors")
    worst_max_drift = worst(rows, "max_drift_error")
    worst_history = worst(rows, "history_nrmse")
    worst_accel = worst(rows, "accel_nrmse")
    worst_lag = worst(rows, "phase_lag_s")

    overall = max(worst_period, worst_peak, worst_drift, worst_max_drift)
    verdict = "PASS" if overall <= tolerance else "FAIL"

    lines: list[str] = []
    add = lines.append

    add("# Validation report")
    add("")
    add(
        f"Generated {date.today().isoformat()} by `python/reference/python/compare.py`. "
        "Every number below is measured, not typed in by hand — re-running the "
        "comparison regenerates this file."
    )
    add("")
    add("> ⚠️ **This validates the software, not the engineering.** Read")
    add("> [What this does and does not prove](#what-this-does-and-does-not-prove)")
    add("> before treating any number here as an endorsement of the model.")
    add("")

    # ---- headline ----------------------------------------------------------
    add(f"## Verdict: {verdict}")
    add("")
    add(
        f"The TypeScript engine and the independent Python reference agree to "
        f"**{pct(overall)}%** at worst across {case_count} cases — "
        f"tolerance was {pct(tolerance)}%."
    )
    add("")
    add("| Quantity | Worst disagreement |")
    add("|---|---|")
    add(f"| Natural periods (3 modes) | {pct(worst_period)} % |")
    add(f"| Peak displacement (every floor) | {pct(worst_peak)} % |")
    add(f"| Story drift ratio (every story) | {pct(worst_drift)} % |")
    add(f"| Max drift ratio | {pct(worst_max_drift)} % |")
    add(f"| Roof displacement history | {pct(worst_history)} % (NRMSE) |")
    add(f"| Ground acceleration history | {pct(worst_accel)} % (NRMSE) |")
    add(f"| Phase lag between histories | {worst_lag:.2e} s |")
    add("")

    if verdict == "FAIL":
        add(
            f"> ⚠️ Some cases exceed the {pct(tolerance)}% threshold. "
            "The per-case table below identifies which."
        )
    else:
        margin = tolerance / overall if overall > 0 else float("inf")
        add(
            f"The agreement is {margin:,.0f}× tighter than the threshold, which is "
            "the expected result: two correct implementations of the same "
            "arithmetic disagree only by floating-point rounding."
        )
    add("")

    # ---- what this proves --------------------------------------------------
    add("## What this does and does not prove")
    add("")
    add("### It does prove")
    add("")
    add(
        "The TypeScript engine implements the model described in "
        "`engineeringAssumptions.ts`. The matrix assembly, the eigenvalue "
        "solution, the Rayleigh damping calibration, the Newmark-β time "
        "integration and the synthetic ground-motion generator all behave as "
        "specified — across 1 to 20 floors, all four materials, both frame "
        "types, and all three ground-motion presets."
    )
    add("")
    add(
        "The reference shares the *specification* (the same constants, read from "
        "the same exported JSON file) but not the *code*: it solves the "
        "generalised eigenproblem through LAPACK instead of reducing to M⁻¹K and "
        "running a hand-written Jacobi rotation, factorises with LAPACK Cholesky "
        "instead of its own substitution, and steps time with whole-matrix NumPy "
        "expressions instead of a fused row loop."
    )
    add("")
    add("### It does not prove")
    add("")
    add(
        "That the model is a good description of a real building. Both sides read "
        "the same coefficients, so an assumption that is wrong — a damping ratio "
        "twice what it should be — is wrong identically in both and this "
        "comparison reports a clean pass."
    )
    add("")
    add(
        "**Every engineering constant is still a placeholder.** They remain the "
        "subject of the adviser review in "
        "[`assumptions.md` §1](../assumptions.md#1-review-checklist); this report "
        "does not discharge any of those rows."
    )
    add("")
    add(
        "The drift-ratio definition is reproduced, not endorsed: it differences "
        "per-floor *peaks*, which is smaller than the peak of the instantaneous "
        "story drift. Both implementations do the same thing, so this comparison "
        "cannot detect it. Flagged in `assumptions.md` §7a."
    )
    add("")

    # ---- tolerances --------------------------------------------------------
    add("## Tolerances, and why 5% is not the number used here")
    add("")
    add(
        f"The specification names a **{SPEC_TOLERANCE_PCT:.0f}%** tolerance, and it "
        "is still carried in `SOLVER.validationTolerancePct` awaiting adviser "
        "confirmation. That figure is a reasonable target for comparing a model "
        "against **a real structure** or a commercial package — real codes make "
        "different idealisations, and 5% is a sensible place to draw the line."
    )
    add("")
    add(
        "It is the wrong threshold for **this** comparison. Two implementations "
        "of the same linear algebra, given the same doubles, should not disagree "
        "by anything except rounding — the correct expectation is around 1e-12. "
        "Allowing 5% here would let a genuine bug sail through: a sign error in "
        "one place, or a damping term dropped entirely, can still land inside "
        "5% on a lightly shaken model."
    )
    add("")
    add(
        f"So this harness asserts **{pct(tolerance)}%** and reports what it "
        "actually measured. The 5% figure belongs to a different question — "
        "whether the model matches reality — which needs an adviser and, ideally, "
        "a benchmark structure."
    )
    add("")

    # ---- method ------------------------------------------------------------
    add("## Method")
    add("")
    add("```")
    add("engineeringAssumptions.ts")
    add("        │  npm run validate:constants")
    add("        ▼")
    add("  constants.json ──────────┐")
    add("                           │  shared: the specification")
    add("  cases.json ──────────┐   │")
    add("        │              │   │")
    add("        ▼              ▼   ▼")
    add("   TypeScript      Python reference")
    add("     engine         (NumPy / SciPy)")
    add("        │              │")
    add("        ▼              │")
    add("  ts-results.json     │")
    add("        └──────► compare.py ──► docs/validation-report.md")
    add("```")
    add("")
    add("| Step | Command |")
    add("|---|---|")
    add("| Export the shared constants | `npm run validate:constants` |")
    add("| Solve every case with the shipping engine | `npm run validate:ts` |")
    add("| Solve with Python and compare | `python reference/python/compare.py` |")
    add("| All three | `npm run validate` |")
    add("")
    add(
        f"Constants are shared through `constants.json` so that a disagreement "
        "cannot be blamed on a stale copy of a number. Newmark parameters: "
        f"β = {constants['solver']['newmarkBeta']}, "
        f"γ = {constants['solver']['newmarkGamma']}, "
        f"dt = {constants['solver']['dtS']} s."
    )
    add("")
    add(
        "Comparisons are relative and symmetric — `|a − b| / max(|a|, |b|)` — so "
        "a quantity near zero does not report a meaningless percentage. The "
        "history comparisons are NRMSE: normalised by the signal's own RMS, they "
        "measure the whole time history rather than only its peaks, which is what "
        "would catch a phase error that leaves every peak unchanged."
    )
    add("")

    # ---- per case ----------------------------------------------------------
    add("## Per-case results")
    add("")
    add("| Case | Floors | Material / frame | Motion | T₁ TS | T₁ Py | Period err | Peak err | Drift err | History NRMSE |")
    add("|---|---|---|---|---|---|---|---|---|---|")
    for row in rows:
        add(
            f"| `{row['id']}` | {row['floors']} | "
            f"{row['material']} / {row['frame']} | {row['preset']} | "
            f"{row['ts_period_1']:.4f} s | {row['py_period_1']:.4f} s | "
            f"{pct(worst_of(row['period_errors']))} % | "
            f"{pct(worst_of(row['peak_errors']))} % | "
            f"{pct(worst_of(row['drift_errors']))} % | "
            f"{pct(row['history_nrmse'])} % |"
        )
    add("")
    add("Errors are percentages; `0` means the two agree to within floating-point noise.")
    add("")

    # ---- why these cases ---------------------------------------------------
    add("## Why these cases")
    add("")
    add(
        "Agreeing on the default model proves very little. The matrix is built "
        "around the places where an implementation is most likely to go wrong:"
    )
    add("")
    for row in rows:
        add(f"- **`{row['id']}`** — {row['why']}")
    add("")

    # ---- performance -------------------------------------------------------
    if ts_meta.get("solveTimes"):
        times = ts_meta["solveTimes"]
        add("## Engine performance")
        add("")
        add(
            f"Wall clock for all {len(times)} cases: "
            f"{sum(times):.0f} ms total, {max(times):.0f} ms worst single case."
        )
        add("")

    # ---- next steps --------------------------------------------------------
    add("## What would make this stronger")
    add("")
    add(
        "1. **Replace the placeholders.** This is the only step that changes "
        "whether the tool means anything. See `assumptions.md` §1."
    )
    add(
        "2. **Compare against a real structure.** Run the same model for a "
        "published benchmark building and check it against measured or "
        "peer-reviewed results. That is where the 5% tolerance belongs, and it "
        "needs the adviser to pick the benchmark."
    )
    add(
        "3. **Confirm the drift definition.** Differencing per-floor peaks "
        "understates drift. The standard quantity is the peak of the "
        "instantaneous interstory drift, which is always larger. Changing it "
        "would shift every drift number the app shows."
    )
    add(
        "4. **Agree the drift colour bands.** They currently do not discriminate "
        "(`assumptions.md` §7a)."
    )
    add("")
    add("---")
    add("")
    add(
        "*Regenerate with `npm run validate`. If you change an engineering "
        "constant, both implementations move together automatically — that is the "
        "point of exporting `constants.json`.*"
    )
    add("")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {report_path}")


# ============================================================================
# Entry point
# ============================================================================


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tolerance",
        type=float,
        default=1e-6,
        help="Maximum relative disagreement to pass (default 1e-6)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT_PATH,
        help="Where to write the report",
    )
    parser.add_argument("--no-report", action="store_true", help="Do not write the report")
    args = parser.parse_args()

    for path in (CONSTANTS_PATH, CASES_PATH, TS_RESULTS_PATH):
        if not path.exists():
            print(
                f"error: {path} is missing.\n"
                "Run `npm run validate:constants && npm run validate:ts` first.",
                file=sys.stderr,
            )
            return 2

    constants = load_constants()
    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))["cases"]
    ts_cases = json.loads(TS_RESULTS_PATH.read_text(encoding="utf-8"))["cases"]

    ts_by_id = {case["id"]: case for case in ts_cases}
    missing = [case["id"] for case in cases if case["id"] not in ts_by_id]
    if missing:
        print(f"error: no TypeScript result for: {', '.join(missing)}", file=sys.stderr)
        return 2

    print(f"Solving {len(cases)} cases with the Python reference…\n")
    rows: list[dict[str, Any]] = []
    for case in cases:
        row = compare_case(ts_by_id[case["id"]], case, constants)
        rows.append(row)
        worst_here = max(
            worst_of(row["period_errors"]),
            worst_of(row["peak_errors"]),
            worst_of(row["drift_errors"]),
        )
        flag = "ok  " if worst_here <= args.tolerance else "FAIL"
        print(
            f"  {flag} {row['id']:<42} "
            f"T1 {row['py_period_1']:.4f}s  "
            f"peak {pct(worst_of(row['peak_errors']))}%  "
            f"drift {pct(worst_of(row['drift_errors']))}%  "
            f"history {pct(row['history_nrmse'])}%"
        )

    overall = max(
        worst(rows, "period_errors"),
        worst(rows, "peak_errors"),
        worst(rows, "drift_errors"),
        worst(rows, "max_drift_error"),
    )

    print()
    print(f"Worst disagreement across all cases: {pct(overall)}%")
    print(f"Tolerance:                          {pct(args.tolerance)}%")

    if not args.no_report:
        write_report(
            rows,
            args.tolerance,
            args.report,
            constants,
            {"solveTimes": [case["solveMs"] for case in ts_cases]},
        )

    if overall > args.tolerance:
        print("\nFAIL — the two implementations disagree beyond tolerance.")
        return 1

    print("\nPASS — the TypeScript engine matches the independent reference.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())