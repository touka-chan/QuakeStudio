"""System Usability Scale scoring.

Kept in lockstep with `apps/web/src/feedback/susScore.ts`. The server recomputes
the score on submit, so a modified browser payload cannot decide what the study
record says.
"""

from __future__ import annotations

import math
from typing import Mapping

from .schemas import SusSummary

TARGET_SCORE = 68.0
POSITIVE_ITEMS = frozenset({1, 3, 5, 7, 9})

_T95: dict[int, float] = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    11: 2.201,
    12: 2.179,
    13: 2.160,
    14: 2.145,
    15: 2.131,
    16: 2.120,
    17: 2.110,
    18: 2.101,
    19: 2.093,
    20: 2.086,
    21: 2.080,
    22: 2.074,
    23: 2.069,
    24: 2.064,
    25: 2.060,
    26: 2.056,
    27: 2.052,
    28: 2.048,
    29: 2.045,
    30: 2.042,
}


def score_sus(answers: Mapping[str, int]) -> float:
    raw = 0
    for number in range(1, 11):
        value = answers[str(number)]
        raw += value - 1 if number in POSITIVE_ITEMS else 5 - value
    return round(raw * 2.5, 2)


def interpret_sus(score: float) -> str:
    if score >= 85:
        return "Excellent"
    if score >= 72.6:
        return "Good"
    if score >= 62.7:
        return "OK"
    if score >= 51.7:
        return "Poor"
    return "Awful"


def grade_sus(score: float) -> str:
    if score > 85:
        return "A"
    if score >= 78.5:
        return "B"
    if score >= 72.6:
        return "C"
    if score >= 62.7:
        return "D"
    return "F"


def summarise_scores(scores: list[float]) -> SusSummary | None:
    if not scores:
        return None

    ordered = sorted(scores)
    count = len(ordered)
    mean = sum(ordered) / count
    median = (
        ordered[(count - 1) // 2]
        if count % 2 == 1
        else (ordered[count // 2 - 1] + ordered[count // 2]) / 2
    )

    variance = (
        sum((value - mean) ** 2 for value in ordered) / (count - 1)
        if count > 1
        else 0.0
    )
    standard_deviation = math.sqrt(variance)
    confidence95 = (
        _T95.get(count - 1, 2.042) * (standard_deviation / math.sqrt(count))
        if count > 0
        else 0.0
    )

    return SusSummary(
        participants=count,
        mean=round(mean, 2),
        median=round(median, 2),
        min=ordered[0],
        max=ordered[-1],
        standard_deviation=round(standard_deviation, 2),
        confidence95=round(confidence95, 2),
        interpretation=interpret_sus(mean),
        grade=grade_sus(mean),
        meets_target=mean >= TARGET_SCORE,
    )
