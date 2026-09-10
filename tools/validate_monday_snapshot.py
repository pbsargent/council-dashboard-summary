#!/usr/bin/env python3
"""Reject summary-only monday snapshots before they replace or publish data."""
import json
import math
import sys
from datetime import datetime
from pathlib import Path


SCHOOL_AFFILIATION_METHOD = "monday.com BoardRelationValue.linked_item_ids"
SCHOOL_AFFILIATION_COLUMN_ID = "board_relation_mkqzymsp"


def required_timestamp(value: object, label: str) -> datetime:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label} is missing")
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} is unusable") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone")
    return parsed


def validate_snapshot(snapshot: dict) -> None:
    boards = snapshot.get("boards", {})
    for name in ("prospects", "renewals", "schools", "popcorn"):
        board = boards.get(name, {})
        rows = board.get("rows")
        if not isinstance(rows, list) or len(rows) != board.get("items"):
            raise ValueError(f"{name}: complete detail rows must match the published item count")
        ids = [row.get("item_id") for row in rows]
        if any(not identity for identity in ids) or len(set(ids)) != len(ids):
            raise ValueError(f"{name}: missing or duplicate item IDs")
    schools = boards["schools"]["rows"]
    affiliation_flags = [row.get("unit_affiliated") for row in schools]
    if any(type(value) is not bool for value in affiliation_flags):
        raise ValueError("schools: every exported school must have a verified Boolean unit-affiliation flag")
    school_board = boards["schools"]
    verified_count = school_board.get("unit_affiliation_verified_schools")
    if type(verified_count) is not int or verified_count != len(schools):
        raise ValueError("schools: unit-affiliation verification count does not cover every exported school")
    affiliated_count = school_board.get("unit_affiliation_affiliated_schools")
    if type(affiliated_count) is not int or affiliated_count != sum(affiliation_flags):
        raise ValueError("schools: published affiliated-school count does not match the verified Boolean flags")
    if school_board.get("unit_affiliation_method") != SCHOOL_AFFILIATION_METHOD:
        raise ValueError("schools: unit-affiliation verification method is missing or unsupported")
    if school_board.get("unit_affiliation_column_id") != SCHOOL_AFFILIATION_COLUMN_ID:
        raise ValueError("schools: unit-affiliation relationship column does not match the approved source")
    verified_at = required_timestamp(
        school_board.get("unit_affiliation_verified_at"),
        "schools: unit-affiliation verification timestamp",
    )
    generated_at = required_timestamp(snapshot.get("generated_at"), "snapshot generated_at")
    if verified_at < generated_at:
        raise ValueError("schools: unit-affiliation verification predates the published snapshot")
    total = 0.0
    for row in schools:
        if not all(key in row for key in ("tay", "grades", "scouting_district")):
            raise ValueError("schools: missing TAY, grade/age, or district fields")
        raw = str(row["tay"] or "").strip().replace(",", "")
        if not raw:
            continue  # Individual source blanks are allowed, not fabricated.
        try:
            value = float(raw)
        except ValueError as error:
            raise ValueError(f"schools: unusable TAY for item {row['item_id']}") from error
        if not math.isfinite(value) or value < 0:
            raise ValueError(f"schools: invalid TAY for item {row['item_id']}")
        total += value
    if not total > 0:
        raise ValueError("schools: TAY denominator is missing or zero; publication blocked")
    if not any(str(row.get("grades") or "").strip() and str(row.get("tay") or "").strip() for row in schools):
        raise ValueError("schools: grade/age spans are missing; program TAY cannot be calculated")


if __name__ == "__main__":
    validate_snapshot(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
    print("monday.com detail and TAY validation passed")
