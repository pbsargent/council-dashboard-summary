#!/usr/bin/env python3
"""Abbreviate person names in public dashboard data to ``First L.``.

The source workbooks remain unchanged. This publication-layer sanitizer handles
the JSON and JavaScript data bundles used by the Council Summary, Commissioner,
Unit Level, Training, SYT, camping-readiness, and Renewal Board pages.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


PUBLIC_DATA_FILES = (
    "data/latest.json",
    "data/unit-level-latest.json",
    "data/unit-level-latest.js",
    "renewal-board/data.js",
)

DIRECT_PERSON_FIELDS = {
    "beAScoutContact",
    "be_a_scout_contact",
    "districtChair",
    "districtCommissioner",
    "districtCommissionerFromHierarchy",
    "districtProfessional",
    "district_chair",
    "district_commissioner",
    "district_commissioner_from_hierarchy",
    "district_professional",
    "fieldDirector",
    "field_director",
    "field_exec",
    "owner",
    "serviceAreaFieldDirector",
    "service_area_field_director",
    "unitLeader",
    "unit_leader",
}

SPECIAL_VALUES = {
    "n/a",
    "no district commissioner",
    "no field director",
    "none",
    "none listed",
    "not recorded",
    "tba",
    "unassigned",
    "vacant",
}

NAME_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def normalize_space(value: str) -> str:
    return " ".join(value.strip().split())


def surname_initial(value: str) -> str:
    for character in value:
        if character.isalpha():
            return character.upper()
    return ""


def format_person_name(value: str) -> str:
    """Return one person's name as ``First L.`` without exposing other names."""

    normalized = normalize_space(value).strip(" ,;")
    if not normalized or normalized.casefold() in SPECIAL_VALUES:
        return normalized

    if "," in normalized:
        family, given = (normalize_space(part) for part in normalized.split(",", 1))
        first = given.split()[0] if given else ""
        last = family.split()[0] if family else ""
    else:
        parts = normalized.split()
        if len(parts) < 2:
            return normalized
        first = parts[0]
        family_parts = parts[1:]
        while len(family_parts) > 1 and family_parts[-1].rstrip(".").casefold() in NAME_SUFFIXES:
            family_parts.pop()
        last = family_parts[-1]

    initial = surname_initial(last)
    return f"{first} {initial}." if first and initial else normalized


def format_person_list(value: str) -> str:
    return ", ".join(format_person_name(part) for part in value.split(",") if normalize_space(part))


def is_person_record_name(path: tuple[str | int, ...]) -> bool:
    string_path = {part for part in path if isinstance(part, str)}
    if string_path.intersection({"training_people", "syt_people", "commissioners", "unit_key3_statuses"}):
        return True
    return "renewal_records" in string_path and "members" in string_path


def transform_person_value(key: str, value: Any, path: tuple[str | int, ...]) -> Any:
    if key == "name" and is_person_record_name(path) and isinstance(value, str):
        return format_person_name(value)
    if key == "member_name" and isinstance(value, str):
        return format_person_name(value)
    if key == "commissioners" and isinstance(value, list):
        return [format_person_name(item) if isinstance(item, str) else item for item in value]
    if key == "commissioner" and isinstance(value, str):
        return format_person_list(value) if "," in value else format_person_name(value)
    if key in DIRECT_PERSON_FIELDS and isinstance(value, str):
        return format_person_name(value)
    return value


def sanitize_tree(value: Any, path: tuple[str | int, ...] = ()) -> None:
    if isinstance(value, dict):
        for key, child in list(value.items()):
            transformed = transform_person_value(key, child, path)
            value[key] = transformed
            sanitize_tree(transformed, path + (key,))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            sanitize_tree(child, path + (index,))


def is_public_person_name(value: str) -> bool:
    normalized = normalize_space(value)
    if not normalized or normalized.casefold() in SPECIAL_VALUES:
        return True
    parts = normalized.split()
    return (
        len(parts) == 2
        and len(parts[1]) == 2
        and parts[1][0].isalpha()
        and parts[1][1] == "."
    )


def person_value_violations(
    key: str,
    value: Any,
    path: tuple[str | int, ...],
) -> list[tuple[tuple[str | int, ...], str]]:
    candidates: list[str] = []
    if key == "name" and is_person_record_name(path) and isinstance(value, str):
        candidates = [value]
    elif key == "member_name" and isinstance(value, str):
        candidates = [value]
    elif key == "commissioners" and isinstance(value, list):
        candidates = [item for item in value if isinstance(item, str)]
    elif key == "commissioner" and isinstance(value, str):
        candidates = [part for part in value.split(",") if normalize_space(part)]
    elif key in DIRECT_PERSON_FIELDS and isinstance(value, str):
        candidates = [value]
    return [
        (path + (key,), candidate)
        for candidate in candidates
        if not is_public_person_name(candidate)
    ]


def find_violations(value: Any, path: tuple[str | int, ...] = ()) -> list[tuple[tuple[str | int, ...], str]]:
    violations: list[tuple[tuple[str | int, ...], str]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            violations.extend(person_value_violations(key, child, path))
            violations.extend(find_violations(child, path + (key,)))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            violations.extend(find_violations(child, path + (index,)))
    return violations


def load_bundle(path: Path) -> tuple[Any, str, str]:
    source = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        return json.loads(source), "", "\n"

    start = source.find("{")
    if start < 0:
        raise ValueError(f"JavaScript data bundle has no JSON object: {path}")
    payload, consumed = json.JSONDecoder().raw_decode(source[start:])
    return payload, source[:start], source[start + consumed :]


def write_bundle(path: Path, payload: Any, prefix: str, suffix: str) -> None:
    serialized = json.dumps(payload, indent=2, ensure_ascii=False)
    if path.suffix == ".json":
        path.write_text(f"{serialized}\n", encoding="utf-8")
    else:
        path.write_text(f"{prefix}{serialized}{suffix}", encoding="utf-8")


def display_path(path: tuple[str | int, ...]) -> str:
    return ".".join(str(part) for part in path)


def process_site(site_root: Path, check_only: bool) -> tuple[int, int]:
    processed = 0
    violations: list[tuple[Path, tuple[str | int, ...], str]] = []
    for relative in PUBLIC_DATA_FILES:
        path = site_root / relative
        if not path.is_file():
            continue
        payload, prefix, suffix = load_bundle(path)
        if not check_only:
            sanitize_tree(payload)
            write_bundle(path, payload, prefix, suffix)
        for item_path, value in find_violations(payload):
            violations.append((path, item_path, value))
        processed += 1

    if processed == 0:
        raise FileNotFoundError(f"No recognized public dashboard data bundles found under {site_root}")
    if violations:
        details = "\n".join(
            f"{path}: {display_path(item_path)} = {value!r}"
            for path, item_path, value in violations[:20]
        )
        extra = len(violations) - 20
        if extra > 0:
            details += f"\n... and {extra} more"
        raise ValueError(f"Public person-name privacy check failed:\n{details}")
    return processed, len(violations)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("site_root", type=Path)
    parser.add_argument("--check", action="store_true", help="Validate without modifying files")
    args = parser.parse_args()

    root = args.site_root.resolve()
    processed, _ = process_site(root, args.check)
    action = "validated" if args.check else "sanitized"
    print(f"Public person names {action}: {processed} data bundles; format First L.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
