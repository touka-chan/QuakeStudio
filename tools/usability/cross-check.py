"""
Cross-check the Python SUS scorer against the TypeScript implementation.

============================================================================
WHY THIS EXISTS
============================================================================
The SUS scoring rule contains a genuine trap — items 8 and 10 are scored
contrary to how they read — and it is now implemented TWICE:

    apps/web/src/feedback/susScore.ts   the score a participant sees
    tools/usability/analyze.py          the score a researcher reports

Two implementations of one scoring table is exactly the situation the Phase 5
validation harness was built for, turned on the study instrument instead of the
structural model. If they disagree, a reported score will not match the score
the app showed the participant — and nobody would notice.

So this re-scores the TypeScript-generated cases with the Python scorer and
requires identical output.

Usage
-----
    npm run usability:cross-check

which is the equivalent of:

    npx tsx --tsconfig apps/web/tsconfig.app.json \\
        tools/usability/cross-check.ts > tools/usability/cases.json
    python tools/usability/cross-check.py

Pass a path to check a cases file from somewhere else.

Exits non-zero on any mismatch.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyze import score_response  # noqa: E402

DEFAULT_CASES = Path(__file__).resolve().parent / "cases.json"


def main() -> int:
    cases_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CASES

    if not cases_path.exists():
        print(
            f"error: {cases_path} not found.\n"
            "Generate it first:\n"
            "    npm run usability:cases",
            file=sys.stderr,
        )
        return 2

    bundle = json.loads(cases_path.read_text(encoding="utf-8"))
    cases = bundle.get("cases", [])

    if not cases:
        print("error: no cases in the file.", file=sys.stderr)
        return 2

    failures: list[str] = []

    for case in cases:
        case_id = case.get("id", "?")
        expected = case.get("tsScore")
        actual = score_response(case.get("answers", {}))

        if actual is None:
            failures.append(f"{case_id}: Python scored None; TypeScript gave {expected}")
        elif expected is None:
            failures.append(f"{case_id}: TypeScript scored None; Python gave {actual}")
        elif abs(expected - actual) > 1e-9:
            failures.append(f"{case_id}: TypeScript {expected} vs Python {actual}")

    print(f"Scoring rule: {bundle.get('scoring', 'unknown')}")
    print(f"Checked {len(cases)} cases across both implementations.")
    print()

    for case in cases:
        actual = score_response(case.get("answers", {}))
        status = "ok " if any(c.get("id") == case.get("id") for c in cases) and not any(
            f.startswith(f"{case.get('id')}:") for f in failures
        ) else "FAIL"
        print(f"  {status} {case.get('id'):<32} TS {case.get('tsScore'):>6}  PY {actual:>6}")

    if failures:
        print("\nMISMATCHES:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        print(
            "\nOne of the two implementations has the scoring table wrong. Check that it "
            "uses ITEM PARITY (odd forward, even reversed) and not the wording.",
            file=sys.stderr,
        )
        return 1

    print("\nPASS — the TypeScript and Python SUS scorers agree on every case.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())