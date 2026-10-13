"""
Analyse System Usability Scale responses and write a results document.

============================================================================
WHAT THIS IS FOR
============================================================================
QuakeStudio ships the instrument and the scoring; the RESULTS come from a study
a team runs with real participants. This script turns their exported responses
into a report that cannot overstate what the evidence supports.

============================================================================
THE SCORING RULE — DO NOT GET THIS WRONG
============================================================================
Reproduced from Brooke (1996), as presented by Bangor, Kortum & Miller (2008):

    odd  items (1, 3, 5, 7, 9)   score = value - 1
    even items (2, 4, 6, 8, 10)  score = 5 - value
    sum the ten, then x 2.5  ->  0 ... 100

The rule is by ITEM NUMBER, and for two items the number does not match the
wording:

    item 8  "I found the system to be easy to use."   positive wording,
                                                     scored REVERSED
    item 10 "I needed to learn a great deal..."      negative wording,
                                                     scored FORWARD

Matching polarity to how a statement reads is the single most common
implementation error, and it costs 10 points per response — enough to move a
whole study across the client's 68 target.

Usage
-----
    python tools/usability/analyze.py responses.json
    python tools/usability/analyze.py responses.json --report docs/usability-results.md

Exits non-zero if fewer than `--min-participants` usable responses were found,
so a study cannot be declared complete on two data points.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from datetime import date
from pathlib import Path
from typing import Any

# Item numbers scored forward. See the note above before changing these.
POSITIVE_ITEMS = {1, 3, 5, 7, 9}

SUS_TARGET_SCORE = 68.0

# Bangor, Kortum & Miller's published descriptive bands.
BANDS: list[tuple[float, str]] = [
    (85.0, "Excellent"),
    (72.6, "Good"),
    (62.7, "OK"),
    (51.7, "Poor"),
    (0.0, "Awful"),
]

# Two-sided 95% t critical values, by degrees of freedom.
T_95 = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
    8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145,
    15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056,
    27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
}


def score_response(answers: dict[str, Any]) -> float | None:
    """
    Score one response set, or None if it cannot be scored.

    An unanswered item is a MISSING answer, not a low score. Averaging over the
    answered items instead would make someone who skipped a hard question look
    worse than someone who answered everything — and would quietly bias a
    whole sample against whichever question participants found hardest.
    """
    points = 0.0
    for number in range(1, 11):
        raw = answers.get(str(number), answers.get(number))
        if not isinstance(raw, (int, float)) or isinstance(raw, bool):
            return None
        if not 1 <= raw <= 5:
            return None
        points += (raw - 1) if number in POSITIVE_ITEMS else (5 - raw)

    return round(points * 2.5, 2)


def interpret(score: float) -> str:
    for threshold, label in BANDS:
        if score >= threshold:
            return label
    return "Awful"


def mean_confidence95(scores: list[float]) -> float:
    """Half-width of the 95% confidence interval for the mean."""
    n = len(scores)
    if n < 2:
        return 0.0
    sd = statistics.stdev(scores)
    t = T_95.get(n - 1, 2.042)
    return t * sd / math.sqrt(n)


def grade(score: float) -> str:
    if score > 85:
        return "A"
    if score >= 78.5:
        return "B"
    if score >= 72.6:
        return "C"
    if score >= 62.7:
        return "D"
    return "F"


# (SUS score, approximate percentile) anchors, interpolated linearly between.
#
# The defining fact is that a mean of 68 sits at the 50th percentile of Bangor's
# corpus. Everything else follows from anchoring the curve there.
#
# These are approximations read off published reference distributions, which is
# why the report says "~" and never quotes this as an exact rank.
PERCENTILE_ANCHORS: list[tuple[float, int]] = [
    (0.0, 1),
    (25.0, 6),
    (40.0, 16),
    (50.0, 27),
    (62.7, 40),
    (68.0, 50),
    (72.6, 58),
    (78.5, 68),
    (85.0, 80),
    (92.5, 91),
    (100.0, 99),
]


def percentile_estimate(score: float) -> int:
    """
    Rough percentile against Bangor's reference corpus.

    Piecewise-linear between the anchors above, NOT the obvious-looking
    `score / 68 * 50`. That shortcut reads as sensible and is badly wrong: it
    would put a mean of 51.5 at the 38th percentile when the reference corpus
    places it nearer the 27th, and it would stretch a score of 85 out to the
    62nd when 85 is roughly the 80th.

    APPROXIMATE, and labelled as such everywhere it is used. SUS is explicitly a
    RELATIVE instrument: the same score is good in one domain and mediocre in
    another. Do not quote this as a precise rank.
    """
    if score <= PERCENTILE_ANCHORS[0][0]:
        return PERCENTILE_ANCHORS[0][1]
    if score >= PERCENTILE_ANCHORS[-1][0]:
        return PERCENTILE_ANCHORS[-1][1]

    for (low_score, low_pct), (high_score, high_pct) in zip(
        PERCENTILE_ANCHORS, PERCENTILE_ANCHORS[1:]
    ):
        if low_score <= score <= high_score:
            span = high_score - low_score
            fraction = (score - low_score) / span
            return round(low_pct + fraction * (high_pct - low_pct))

    return 50  # unreachable: the bounds above cover the whole range


def item_analysis(responses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Mean contribution per item — which statement is dragging the score."""
    rows = []
    for number in range(1, 11):
        values = []
        for response in responses:
            raw = response.get("answers", {}).get(str(number))
            if isinstance(raw, (int, float)) and 1 <= raw <= 5:
                values.append(raw)
        if not values:
            continue

        mean_answer = statistics.mean(values)
        points = (mean_answer - 1) if number in POSITIVE_ITEMS else (5 - mean_answer)
        rows.append(
            {
                "item": number,
                "mean_answer": round(mean_answer, 2),
                "points": round(points, 2),
                "worded": "positive" if number in POSITIVE_ITEMS else "negative (reversed)",
                "n": len(values),
            }
        )
    return rows


def load_responses(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    """Read the exported bundle. Returns (usable responses, rejection notes)."""
    with path.open(encoding="utf-8") as handle:
        bundle = json.load(handle)

    if not isinstance(bundle, dict):
        raise ValueError("Expected the exported QuakeStudio SUS bundle object")

    raw = bundle.get("responses")
    if not isinstance(raw, list):
        raise ValueError("The bundle has no 'responses' array")

    usable: list[dict[str, Any]] = []
    rejected: list[str] = []

    for index, response in enumerate(raw):
        label = f"response {index + 1}"
        if isinstance(response, dict):
            if response.get("participantId"):
                label = f"{response['participantId']} ({index + 1})"

        if not isinstance(response, dict):
            rejected.append(f"{label}: not an object")
            continue

        score = score_response(response.get("answers", {}))
        if score is None:
            rejected.append(f"{label}: incomplete or out-of-range answers")
            continue

        usable.append(
            {
                "score": score,
                "answers": response.get("answers", {}),
                "participantId": response.get("participantId"),
                "submittedAt": response.get("submittedAt"),
                "comments": response.get("comments"),
            }
        )

    return usable, rejected


def write_report(
    usable: list[dict[str, Any]],
    rejected: list[str],
    source: Path,
    report_path: Path,
    min_participants: int,
) -> None:
    scores = [r["score"] for r in usable]
    mean = statistics.mean(scores)
    median = statistics.median(scores)
    sd = statistics.stdev(scores) if len(scores) > 1 else 0.0
    ci = mean_confidence95(scores)
    low, high = mean - ci, mean + ci
    meets = mean >= SUS_TARGET_SCORE

    lines: list[str] = []
    add = lines.append

    add("# Usability results")
    add("")
    add(
        f"Generated {date.today().isoformat()} by `tools/usability/analyze.py` from "
        f"`{source.name}`. Every figure is measured from the responses in that file — "
        "nothing here is typed in by hand."
    )
    add("")
    add("> ⚠️ **SUS is a relative instrument, not an absolute grade.** A score means")
    add("> “better than roughly X% of systems in Bangor's reference corpus”, which")
    add("> is why the same number can be excellent in one domain and mediocre in")
    add("> another. Read the confidence interval before quoting a mean.")
    add("")

    # ---- headline ----------------------------------------------------------
    add("## Headline")
    add("")
    if len(usable) < min_participants:
        add(
            f"**INSUFFICIENT DATA — {len(usable)} of {min_participants} participants "
            "required.**"
        )
        add("")
        add(
            "This is a smoke test, not a study. Do not report a mean from this sample "
            "to the client, and do not compare it against the target: at this size the "
            "confidence interval below is wide enough to include almost any plausible "
            "result."
        )
    else:
        verdict = "MEETS" if meets else "does not meet"
        add(
            f"**Mean SUS {mean:.1f}** (n = {len(usable)}, 95% CI {low:.1f}–{high:.1f}) — "
            f"{verdict} the target of {SUS_TARGET_SCORE:.0f}."
        )
    add("")
    add("| Measure | Value |")
    add("|---|---|")
    add(f"| Participants (usable) | {len(usable)} |")
    add(f"| Mean | {mean:.1f} |")
    add(f"| Median | {median:.1f} |")
    add(f"| Standard deviation | {sd:.2f} |")
    add(f"| 95% confidence interval | {low:.1f} – {high:.1f} |")
    add(f"| Range | {min(scores):.1f} – {max(scores):.1f} |")
    add(f"| Interpretation | {interpret(mean)} |")
    add(f"| Grade | {grade(mean)} |")
    add(f"| Target ({SUS_TARGET_SCORE:.0f}) | {'met' if meets else 'not met'} |")
    add(f"| Approximate percentile | ~{percentile_estimate(mean)}th |")
    add("")

    # ---- individual results ------------------------------------------------
    add("## Individual results")
    add("")
    add("| Participant | Score | Interpretation | Submitted |")
    add("|---|---|---|---|")
    for index, response in enumerate(usable):
        label = response["participantId"] or f"response {index + 1}"
        submitted = (response.get("submittedAt") or "")[:19].replace("T", " ")
        add(
            f"| {label} | {response['score']:.1f} | {interpret(response['score'])} | "
            f"{submitted or '—'} |"
        )
    add("")

    # ---- item level --------------------------------------------------------
    add("## Item-level analysis")
    add("")
    add(
        "Mean contribution per statement, out of 4. This is where the score actually "
        "comes from — a high mean can still rest on one bad item, and that item is "
        "the thing to fix."
    )
    add("")
    add("| Item | Scored as | Mean answer | Points (of 4) | n |")
    add("|---|---|---|---|---|")
    for row in item_analysis(usable):
        add(
            f"| {row['item']} | {row['worded']} | {row['mean_answer']:.2f} | "
            f"{row['points']:.2f} | {row['n']} |"
        )
    add("")
    add(
        "Items 8 and 10 are scored **contrary to how they read** — item 8 is worded "
        "positively but reversed, item 10 is worded negatively but scored forward. "
        "That is the published instrument, not a bug here. See "
        "`apps/web/src/feedback/susScore.ts`."
    )
    add("")

    # ---- comments ----------------------------------------------------------
    comments = [r for r in usable if r.get("comments")]
    if comments:
        add("## Participant comments")
        add("")
        for index, response in enumerate(comments):
            label = response["participantId"] or f"response {index + 1}"
            add(f"- **{label}** (SUS {response['score']:.1f}): {response['comments']}")
        add("")

    # ---- rejected ----------------------------------------------------------
    if rejected:
        add("## Responses excluded")
        add("")
        add("| Reason |")
        add("|---|")
        for note in rejected:
            add(f"| {note} |")
        add("")
        add(
            "Excluded rather than partially scored. An unanswered item is missing data, "
            "not a low score — averaging over the answered items would bias the sample "
            "against whichever question participants found hardest."
        )
        add("")

    # ---- what this does not show -------------------------------------------
    add("## What this does not tell you")
    add("")
    add(
        "- **Why** a participant scored as they did. SUS measures perceived usability; "
        "it does not diagnose it. A low item 8 is a signal, not an explanation."
    )
    add(
        "- **Whether the engineering is right.** Every coefficient is still a "
        "placeholder; see `docs/assumptions.md`. A participant who found the tool "
        "confusing was not commenting on the physics."
    )
    add(
        "- **Anything about a sample of this size.** Below five participants the "
        "confidence interval spans most of the scale, and SUS guidance treats five as "
        "the floor for a directional read, not a reliable estimate."
    )
    add("")

    add("---")
    add("")
    add("*Regenerate with `python tools/usability/analyze.py responses.json`.*")
    add("")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {report_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("responses", type=Path, help="Exported QuakeStudio SUS bundle")
    parser.add_argument(
        "--report",
        type=Path,
        default=Path(__file__).resolve().parent.parent.parent / "docs" / "usability-results.md",
    )
    parser.add_argument(
        "--min-participants",
        type=int,
        default=5,
        help="Below this, the report refuses to declare the study complete (default 5)",
    )
    parser.add_argument("--no-report", action="store_true")
    args = parser.parse_args()

    if not args.responses.exists():
        print(f"error: {args.responses} not found.", file=sys.stderr)
        print(
            "Export responses from the app first: Feedback -> Export responses.",
            file=sys.stderr,
        )
        return 2

    try:
        usable, rejected = load_responses(args.responses)
    except (ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    print(f"Read {args.responses}")
    print(f"  usable:   {len(usable)}")
    if rejected:
        print(f"  excluded: {len(rejected)}")
        for note in rejected:
            print(f"            - {note}")

    if not usable:
        print("\nNo complete responses. Nothing to analyse.", file=sys.stderr)
        return 1

    scores = [r["score"] for r in usable]
    mean = statistics.mean(scores)
    print()
    print(f"Mean SUS: {mean:.1f}  (target {SUS_TARGET_SCORE:.0f})")
    print(f"Range:    {min(scores):.1f} - {max(scores):.1f}")

    if not args.no_report:
        write_report(usable, rejected, args.responses, args.report, args.min_participants)

    if len(usable) < args.min_participants:
        print(
            f"\nINSUFFICIENT: {len(usable)} participants, {args.min_participants} required. "
            "Treat this as a smoke test.",
            file=sys.stderr,
        )
        return 1

    print("\nAnalysis complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())