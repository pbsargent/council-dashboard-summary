"""Publish council-wide Movo totals only from a dated, reconciled readback."""

import argparse
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

CENTRAL = ZoneInfo("America/Chicago")
BOARD_ID = "18437939750"
GROUP_ID = "group_mm8n8m45"
DUE_COLUMN = "numeric_mm8yr4yk"
RATE_COLUMN = "numeric_mm8yza0g"
PREFIX = "window.CAC_MOVO_COUNCIL_DUE = "


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_evidence(folder, name):
    path = folder / name
    require(not path.is_symlink() and path.is_file(), "Missing or unsafe Tracker readback")
    raw = path.read_bytes()
    require(0 < len(raw) <= 1024 * 1024, "Invalid Tracker evidence size")
    return raw


def rate(renewed, due):
    return (100 * Decimal(renewed) / due).quantize(Decimal("0.1"), ROUND_HALF_UP) if due else None


def build(receipt, snapshot, day):
    require(receipt["board_id"] == BOARD_ID and receipt["group_id"] == GROUP_ID
            and receipt["new_value_mismatches"] == 0 and receipt["other_cell_differences"] == 0,
            "Tracker board readback did not reconcile")
    match = re.fullmatch(r"Movo Performance page at (\d{1,2}:\d{2} [AP]M) (C[DS]T) ([A-Za-z]{3} \d{1,2}, \d{4})", receipt["source"])
    require(match is not None, "Missing Movo observation time")
    clock, abbreviation, calendar = match.groups()
    observed = datetime.strptime(f"{calendar} {clock}", "%b %d, %Y %I:%M %p").replace(tzinfo=CENTRAL)
    require(observed.date() == day and observed.tzname() == abbreviation
            and observed <= datetime.now(CENTRAL), "Movo observation must be current and in Central time")

    board, = snapshot["data"]["boards"]
    require(board["id"] == BOARD_ID, "Tracker board identity mismatch")
    group, = [group for group in board["groups"] if group["id"] == GROUP_ID]
    board_rows = group["items_page"]["items"]
    items = {row["id"]: row for row in board_rows}
    require(len(items) == len(board_rows), "Duplicate Tracker board row")
    rows = {}
    for source in receipt["values_written"]:
        name = source["name"]
        label = name.removeprefix("Council total — ")
        require(name == f"Council total — {label}" and label not in rows, "Unexpected or duplicate council total")
        require(label == "both cohorts" or re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", label), "Invalid council cohort")
        item = items[source["item_id"]]
        require(item["name"] == name, "Tracker board row identity mismatch")
        columns = {column["id"]: column["text"] for column in item["column_values"]}
        due = source["total_due"]
        match = re.fullmatch(r"([0-9,]+) of ([0-9,]+)", source["note"])
        require(type(due) is int and due >= 0 and match is not None, "Invalid source counts")
        renewed, denominator = (int(value.replace(",", "")) for value in match.groups())
        require(0 <= renewed <= due == denominator and int(columns[DUE_COLUMN]) == due, "Council counts do not reconcile")
        expected = rate(renewed, due)
        supplied = source["renewed_pct_of_total_due"]
        require((supplied is None and columns[RATE_COLUMN] in (None, "") if expected is None
                 else Decimal(str(supplied)) == Decimal(columns[RATE_COLUMN]) == expected),
                "Council renewal rate does not reconcile")
        rows[label] = {"due": due, "renewed": renewed}
    combined = rows.pop("both cohorts")
    months = sorted(rows)
    require(len(months) == 2 and all(sum(row[k] for row in rows.values()) == combined[k] for k in combined),
            "Combined total does not reconcile to both cohorts")
    return {"report_date": day.isoformat(), "observed_at": observed.isoformat(),
            "cohorts": [{"month": month, **rows[month]} for month in months], "combined": combined}


def validate_public(text, day):
    require(text.startswith(PREFIX) and text.rstrip().endswith(";"), "Invalid council-wide Movo payload")
    data = json.loads(text[len(PREFIX):].rstrip()[:-1])
    if data is None:
        return
    require(set(data) == {"report_date", "observed_at", "cohorts", "combined"}
            and data["report_date"] == day.isoformat(), "Invalid council-wide Movo metadata")
    observed = datetime.fromisoformat(data["observed_at"])
    require(observed.tzinfo is not None and observed.astimezone(CENTRAL).date() == day
            and observed <= datetime.now(CENTRAL), "Council-wide Movo observation is stale or future")
    rows = data["cohorts"]
    require(isinstance(rows, list) and len(rows) == 2, "Expected two council cohorts")
    for row in rows:
        require(set(row) == {"month", "due", "renewed"} and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", row["month"]),
                "Invalid or nonaggregate council cohort")
        require(all(type(row[k]) is int for k in ("due", "renewed"))
                and 0 <= row["renewed"] <= row["due"], "Invalid council cohort counts")
    combined = data["combined"]
    require(rows[0]["month"] < rows[1]["month"] and set(combined) == {"due", "renewed"}
            and all(type(combined[k]) is int and combined[k] == sum(row[k] for row in rows) for k in combined),
            "Council totals do not reconcile")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--date", type=date.fromisoformat, required=True)
    p.add_argument("--evidence", type=Path, required=True)
    p.add_argument("--private-copy", type=Path)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    data = None
    names = ("readback.json", "after-snapshot.json")
    if a.evidence.is_dir() and not a.evidence.is_symlink():
        try:
            raw = [read_evidence(a.evidence, name) for name in names]
            data = build(*(json.loads(value) for value in raw), a.date)
            require(raw == [read_evidence(a.evidence, name) for name in names], "Tracker evidence changed during capture")
        except (ValueError, KeyError, TypeError, OSError, ArithmeticError) as error:
            print(f"Council-wide Movo totals unavailable: {type(error).__name__}")
        else:
            if a.private_copy is not None:
                a.private_copy.mkdir(mode=0o700, parents=True)
                for name, value in zip(names, raw):
                    with (a.private_copy / name).open("xb") as file:
                        file.write(value)
    payload = PREFIX + json.dumps(data, ensure_ascii=True, separators=(",", ":")) + ";\n"
    validate_public(payload, a.date)
    a.output.write_text(payload)
    print("Council-wide Movo totals verified" if data is not None else "Council-wide Movo totals unavailable")


if __name__ == "__main__":
    main()
