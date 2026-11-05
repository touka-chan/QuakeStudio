"""Content contract validation.

The structural schema is generated from the browser's Zod schema by
`npm run backend:content`. Zod refinements cannot be represented in JSON Schema,
so the cross-field rules that matter most are repeated here. The browser still
runs the full Zod validation before it saves; this is a second line of defence,
not a replacement for the client schema.
"""

from __future__ import annotations

import json
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

from .config import get_settings


class ContentValidationError(Exception):
    def __init__(self, issues: list[dict[str, str]]) -> None:
        super().__init__(issues[0]["message"] if issues else "The content is invalid.")
        self.issues = issues


@lru_cache
def _validator() -> Draft202012Validator:
    path: Path = get_settings().content_schema_path
    schema = json.loads(path.read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def validate_content(document: dict[str, Any]) -> None:
    issues: list[dict[str, str]] = []

    for error in sorted(_validator().iter_errors(document), key=lambda item: list(item.path)):
        issues.append(_schema_issue(error))

    if issues:
        raise ContentValidationError(issues)

    _semantic_checks(document, issues)
    if issues:
        raise ContentValidationError(issues)


def _schema_issue(error: ValidationError) -> dict[str, str]:
    path = ".".join(str(part) for part in error.absolute_path) or "document"
    if error.context:
        detail = "; ".join(context.message for context in error.context[:3])
        return {"path": path, "message": detail}
    return {"path": path, "message": error.message}


def _semantic_checks(document: dict[str, Any], issues: list[dict[str, str]]) -> None:
    def fail(path: str, message: str) -> None:
        issues.append({"path": path, "message": message})

    updated_at = document.get("updatedAt")
    if isinstance(updated_at, str):
        try:
            datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        except ValueError:
            fail("updatedAt", "Use an ISO-8601 timestamp.")

    engineering = document.get("engineering") or {}
    geometry = engineering.get("geometry") or {}
    ground_motion = engineering.get("groundMotion") or {}
    viewport = engineering.get("viewport") or {}
    playback = engineering.get("playback") or {}
    load_assumptions = engineering.get("loadAssumptions") or {}

    _check_range(geometry.get("floorHeightM"), "engineering.geometry.floorHeightM", fail)
    _check_range(geometry.get("widthM"), "engineering.geometry.widthM", fail)
    _check_range(geometry.get("depthM"), "engineering.geometry.depthM", fail)
    _check_range(ground_motion.get("pgaG"), "engineering.groundMotion.pgaG", fail)
    _check_range(ground_motion.get("frequencyHz"), "engineering.groundMotion.frequencyHz", fail)

    min_floors = geometry.get("minFloors")
    max_floors = geometry.get("maxFloors")
    if _is_number(min_floors) and _is_number(max_floors) and min_floors >= max_floors:
        fail("engineering.geometry.minFloors", "The minimum floor count must be below the maximum.")

    min_exaggeration = viewport.get("minExaggeration")
    max_exaggeration = viewport.get("maxExaggeration")
    default_exaggeration = viewport.get("defaultExaggeration")
    if _is_number(min_exaggeration) and _is_number(max_exaggeration):
        if min_exaggeration >= max_exaggeration:
            fail(
                "engineering.viewport.minExaggeration",
                "The minimum exaggeration must be below the maximum.",
            )
        _check_between(
            default_exaggeration,
            min_exaggeration,
            max_exaggeration,
            "engineering.viewport.defaultExaggeration",
            "The default exaggeration must sit inside the allowed range.",
            fail,
        )

    band = ground_motion.get("randomBandHz") or {}
    if _is_number(band.get("low")) and _is_number(band.get("high")):
        if band["low"] >= band["high"]:
            fail("engineering.groundMotion.randomBandHz.low", "The low band edge must be below the high edge.")
        frequency_range = ground_motion.get("frequencyHz") or {}
        if _is_number(frequency_range.get("max")) and band["high"] > frequency_range["max"]:
            fail(
                "engineering.groundMotion.randomBandHz.high",
                "The random band cannot exceed the maximum shaking frequency.",
            )

    speeds = playback.get("speeds") or []
    if speeds and playback.get("defaultSpeed") not in speeds:
        fail("engineering.playback.defaultSpeed", "The default speed must be one of the offered speeds.")

    if _is_number(load_assumptions.get("minDeadLoadKPa")) and _is_number(
        load_assumptions.get("maxDeadLoadKPa")
    ):
        if load_assumptions["minDeadLoadKPa"] >= load_assumptions["maxDeadLoadKPa"]:
            fail(
                "engineering.loadAssumptions.minDeadLoadKPa",
                "The minimum dead load must be below the maximum.",
            )
        default_dead = load_assumptions.get("defaultDeadLoadKPa")
        if _is_number(default_dead) and not (
            load_assumptions["minDeadLoadKPa"] <= default_dead <= load_assumptions["maxDeadLoadKPa"]
        ):
            fail(
                "engineering.loadAssumptions.defaultDeadLoadKPa",
                "The default dead load must sit inside the allowed range.",
            )

    if _is_number(load_assumptions.get("minLiveLoadKPa")) and _is_number(
        load_assumptions.get("maxLiveLoadKPa")
    ):
        if load_assumptions["minLiveLoadKPa"] >= load_assumptions["maxLiveLoadKPa"]:
            fail(
                "engineering.loadAssumptions.minLiveLoadKPa",
                "The minimum live load must be below the maximum.",
            )

    default_building = engineering.get("defaultBuilding") or {}
    _check_between(
        default_building.get("floors"),
        min_floors,
        max_floors,
        "engineering.defaultBuilding.floors",
        "The default building must sit inside the geometry floor limits.",
        fail,
    )
    for field in ("floorHeightM", "widthM", "depthM"):
        value_range = geometry.get(field) or {}
        _check_between(
            default_building.get(field),
            value_range.get("min"),
            value_range.get("max"),
            f"engineering.defaultBuilding.{field}",
            "The default building must sit inside the geometry limits.",
            fail,
        )

    default_motion = engineering.get("defaultGroundMotion") or {}
    for field in ("pgaG", "frequencyHz"):
        value_range = ground_motion.get(field) or {}
        _check_between(
            default_motion.get(field),
            value_range.get("min"),
            value_range.get("max"),
            f"engineering.defaultGroundMotion.{field}",
            "The default motion must sit inside the ground-motion limits.",
            fail,
        )

    templates = document.get("templates") or []
    template_ids: set[str] = set()
    for index, template in enumerate(templates):
        if not isinstance(template, dict):
            continue
        template_id = template.get("id")
        if isinstance(template_id, str):
            if template_id in template_ids:
                fail(f"templates[{index}].id", "Template ids must be unique.")
            template_ids.add(template_id)
        building = template.get("building") or {}
        _check_between(
            building.get("floors"),
            min_floors,
            max_floors,
            f"templates[{index}].building.floors",
            "This template is outside the current floor limits.",
            fail,
        )
        for field in ("floorHeightM", "widthM", "depthM"):
            value_range = geometry.get(field) or {}
            _check_between(
                building.get(field),
                value_range.get("min"),
                value_range.get("max"),
                f"templates[{index}].building.{field}",
                "This template is outside the current geometry limits.",
                fail,
            )

    if "custom" not in template_ids:
        fail("templates", "The Custom template is required and cannot be deleted.")
    default_template_id = document.get("defaultTemplateId")
    if default_template_id not in template_ids:
        fail("defaultTemplateId", "Choose a template that exists.")
    if default_template_id == "custom":
        fail("defaultTemplateId", "The Custom template cannot be the startup default.")

    drift_bands = document.get("driftBands") or []
    previous = 0.0
    for index, band_entry in enumerate(drift_bands):
        if not isinstance(band_entry, dict):
            continue
        maximum = band_entry.get("max")
        if maximum is None:
            if index != len(drift_bands) - 1:
                fail(f"driftBands[{index}].max", "Only the final drift band can be open-ended.")
            continue
        if not _is_number(maximum):
            continue
        if maximum <= previous:
            fail(f"driftBands[{index}].max", "Drift thresholds must increase from one band to the next.")
        previous = maximum
    if drift_bands and isinstance(drift_bands[-1], dict) and drift_bands[-1].get("max") is not None:
        fail(f"driftBands[{len(drift_bands) - 1}].max", "The final drift band must be open-ended.")

    features = document.get("features") or {}
    if _is_number(features.get("maxSideBySide")) and _is_number(features.get("maxBuildings")):
        if features["maxSideBySide"] > features["maxBuildings"]:
            fail(
                "features.maxSideBySide",
                "The side-by-side limit cannot exceed the number of buildings.",
            )

    glossary_ids: set[str] = set()
    glossary_terms: set[str] = set()
    for index, entry in enumerate(document.get("glossary") or []):
        if not isinstance(entry, dict):
            continue
        entry_id = entry.get("id")
        term = entry.get("term")
        if isinstance(entry_id, str):
            if entry_id in glossary_ids:
                fail(f"glossary[{index}].id", "Glossary ids must be unique.")
            glossary_ids.add(entry_id)
        if isinstance(term, str):
            normalised = term.strip().lower()
            if normalised in glossary_terms:
                fail(f"glossary[{index}].term", "This term already exists in the glossary.")
            glossary_terms.add(normalised)

    for collection, path in (
        (document.get("tour", {}).get("steps") or [], "tour.steps"),
        (document.get("welcome", {}).get("steps") or [], "welcome.steps"),
    ):
        seen: set[str] = set()
        for index, step in enumerate(collection):
            if not isinstance(step, dict):
                continue
            step_id = step.get("id")
            if isinstance(step_id, str):
                if step_id in seen:
                    fail(f"{path}[{index}].id", "Step ids must be unique.")
                seen.add(step_id)


def _check_range(value: Any, path: str, fail: Any) -> None:
    if not isinstance(value, dict):
        return
    minimum = value.get("min")
    maximum = value.get("max")
    default = value.get("default")
    if _is_number(minimum) and _is_number(maximum) and minimum >= maximum:
        fail(f"{path}.min", "The minimum must be below the maximum.")
    if _is_number(minimum) and _is_number(maximum) and _is_number(default):
        if default < minimum or default > maximum:
            fail(f"{path}.default", "The default must sit between the minimum and the maximum.")


def _check_between(
    value: Any,
    minimum: Any,
    maximum: Any,
    path: str,
    message: str,
    fail: Any,
) -> None:
    if _is_number(value) and _is_number(minimum) and _is_number(maximum):
        if value < minimum or value > maximum:
            fail(path, message)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)
