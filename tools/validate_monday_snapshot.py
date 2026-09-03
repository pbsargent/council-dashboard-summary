#!/usr/bin/env python3
"""Reject summary-only monday snapshots before they replace or publish data."""
import json
import math
import sys
from pathlib import Path


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
