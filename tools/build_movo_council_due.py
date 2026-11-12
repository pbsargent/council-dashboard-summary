"""Publish council-wide Movo totals only from a dated, reconciled readback."""

import argparse
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

from movo_verification import PARENT_ID, SHEET_ID

CENTRAL = ZoneInfo("America/Chicago")
BOARD_ID = "18437939750"
GROUP_ID = "group_mm8n8m45"
RENEWED_COLUMN = "numeric_mm8nt56y"
DUE_COLUMN = "numeric_mm8yr4yk"
RATE_COLUMN = "numeric_mm8yza0g"
PREFIX = "window.CAC_MOVO_COUNCIL_DUE = "
SHEET_SCHEMA = "cac-movo-council-due-sheet-v1"
PERFORMANCE_SOURCE = ("Movo Performance page, Renewing view, Due selector, no other filters "
                      "(https://app.trymovo.ai/performance?side=renewing)")
TOTAL_DUE_HEADERS = [
    "Cohort", "Due date", "Total due (Scouting file)", "Renewed (Performance page)",
    "Renewed % of total due", "In Movo outreach", "Not yet in Movo outreach",
    "Said no (Performance page)", "Read at (America/Chicago)",
]


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
    if receipt.get("schema") == SHEET_SCHEMA:
        return build_from_sheet(receipt, snapshot, day)
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
        require(0 <= renewed <= due == denominator
                and Decimal(columns[DUE_COLUMN]) == due
                and Decimal(columns[RENEWED_COLUMN]) == renewed,
                f"Council due or renewed count does not reconcile for {label}")
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


def current_clock(value, day):
    parsed = datetime.fromisoformat(value)
    require(parsed.tzinfo is not None and parsed.astimezone(CENTRAL).date() == day
            and parsed <= datetime.now(CENTRAL), "Council-wide Movo evidence is stale or future")
    return parsed


def build_from_sheet(receipt, snapshot, day):
    for evidence in (receipt, snapshot):
        require(evidence["sheet_id"] == SHEET_ID and evidence["parent_id"] == PARENT_ID,
                "Wrong council-wide Movo Sheet identity")
    require(receipt["report_date"] == day.isoformat(), "Wrong Tracker report date")
    performance = receipt["performance"]
    require(performance["source"] == PERFORMANCE_SOURCE and performance["council"] == 564,
            "Wrong Movo Performance council, view or filters")
    require(snapshot["tab"] == "Total due" and snapshot["equals_written"] is True,
            "Tracker did not verify the council-wide Sheet tab")
    headers, *table = snapshot["readback"]
    require(headers == TOTAL_DUE_HEADERS and len(table) == 3
            and all(len(row) == len(headers) for row in table), "Unexpected Total due tab layout")
    captured = current_clock(snapshot["captured_at"], day)
    updated = current_clock(snapshot["source_updated_at"], day)
    require(updated <= captured, "Movo Sheet capture predates the Sheet update")
    cohorts = performance["cohorts"]
    require(len(cohorts) == 2, "Expected two council-wide Performance cohorts")
    results, observed, clocks = [], [], []
    for source, sheet in zip(cohorts, table[:2]):
        month = source["cohort"]
        due_date = date.fromisoformat(source["due_date"])
        require(due_date.isoformat()[:7] == month
                and (due_date + timedelta(days=1)).month != due_date.month,
                "Council-wide Performance date does not close its cohort month")
        read_at = current_clock(source["read_at"], day)
        require(read_at <= updated and sheet[8] == source["read_at"],
                "Total due tab observation does not match Performance")
        observed.append(read_at)
        clocks.append(source["read_at"])
        due, renewed = source["total_due"], source["renewed"]
        require(type(due) is int and type(renewed) is int and 0 <= renewed <= due,
                "Invalid council-wide Performance counts")
        require(sheet[0] == due_date.strftime("%B %Y") and sheet[1] == source["due_date"]
                and all(type(value) is int for value in sheet[2:4]) and sheet[2:4] == [due, renewed],
                f"Council-wide Performance and Total due counts differ for {month}")
        supplied_rate = sheet[4]
        require(supplied_rate in (None, "") if due == 0
                else Decimal(str(supplied_rate)) == rate(renewed, due),
                "Total due renewal rate does not reconcile")
        results.append(dict(month=month, due=due, renewed=renewed))
    require(results[0]["month"] < results[1]["month"], "Duplicate or out-of-order council cohorts")
    combined = {key: sum(row[key] for row in results) for key in ("due", "renewed")}
    total = table[-1]
    require(total[0] == "Both cohorts" and total[1] in (None, "")
            and all(type(value) is int for value in total[2:4])
            and total[2:4] == [combined["due"], combined["renewed"]]
            and total[8] == " / ".join(clocks), "Combined council counts do not reconcile")
    require(total[4] in (None, "") if combined["due"] == 0
            else Decimal(str(total[4])) == rate(combined["renewed"], combined["due"]),
            "Combined council rate does not reconcile")
    return dict(report_date=day.isoformat(), observed_at=max(observed).astimezone(CENTRAL).isoformat(),
                cohorts=results, combined=combined)


def validate_public(text, day):
    require(text.startswith(PREFIX) and text.rstrip().endswith(";"), "Invalid council-wide Movo payload")
    data = json.loads(text[len(PREFIX):].rstrip()[:-1])
    require(isinstance(data, dict), "Missing verified council-wide Movo totals")
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
    return data


def validate_comparison(outreach, council):
    outreach_counts = outreach["snapshots"][-1]["council"]
    council_counts = {row["month"]: row for row in council["cohorts"]}
    require(outreach_counts.keys() == council_counts.keys(),
            "Movo outreach and council-wide cohort months differ")
    for month, total in council_counts.items():
        extract = outreach_counts[month]
        require(extract["due"] <= total["due"],
                f"Movo outreach due exceeds council-wide due for {month}")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--date", type=date.fromisoformat, required=True)
    p.add_argument("--evidence", type=Path, required=True)
    p.add_argument("--private-copy", type=Path)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    names = ("readback.json", "after-snapshot.json")
    try:
        require(a.evidence.is_dir() and not a.evidence.is_symlink(), "Missing Tracker total-due evidence folder")
        raw = [read_evidence(a.evidence, name) for name in names]
        data = build(*(json.loads(value) for value in raw), a.date)
        require(raw == [read_evidence(a.evidence, name) for name in names], "Tracker evidence changed during capture")
        payload = PREFIX + json.dumps(data, ensure_ascii=True, separators=(",", ":")) + ";\n"
        validate_public(payload, a.date)
        if a.private_copy is not None:
            a.private_copy.mkdir(mode=0o700, parents=True)
            for name, value in zip(names, raw):
                with (a.private_copy / name).open("xb") as file:
                    file.write(value)
        a.output.write_text(payload)
    except (ValueError, KeyError, TypeError, OSError, ArithmeticError) as error:
        raise SystemExit(f"Council-wide Movo handoff failed for {a.date}: {error}") from error
    counts = ", ".join(f"{row['month']} {row['renewed']}/{row['due']}" for row in data["cohorts"])
    print(f"Council-wide Movo totals verified: {counts}")



if __name__ == "__main__":
    main()
