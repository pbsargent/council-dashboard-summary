"""Reconcile Tracker's Performance workbook before generating public aggregates."""
import argparse
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

PREFIX = "window.MOVO_PERFORMANCE = "
CENTRAL = ZoneInfo("America/Chicago")
COHORTS = ("Nov 30", "Dec 31", "All")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def counts(total, renewed):
    require(type(total) is int and type(renewed) is int and 0 <= renewed <= total,
            "Invalid due or renewed count")
    return total, renewed


def sum_counts(rows):
    return tuple(map(sum, zip(*rows, strict=True)))


def unique_rows(rows, label):
    keys = [row[0] for row in rows]
    require(len(keys) == len(set(keys)), f"Duplicate {label} rows")
    return dict((row[0], row[1:]) for row in rows)


def source_date(value):
    if type(value) is int:
        return date(1899, 12, 30) + timedelta(days=value)
    return date.fromisoformat(value)


def build(tabs):
    about = unique_rows(tabs["About"][1:], "About")
    observed_date = datetime.strptime(about["Capture date"][0], "%A, %b %d, %Y").date()
    window = re.fullmatch(r"(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2}) ([AP]M) (CST|CDT)",
                          about["Capture window (CST)"][0])
    require(window is not None, "Invalid Performance observation window")
    start, end = (datetime.combine(observed_date, datetime.strptime(
        f"{value} {window[3]}", "%I:%M %p").time(), CENTRAL) for value in window.group(1, 2))
    require(start <= end <= datetime.now(CENTRAL) and start.tzname() == end.tzname() == window[4],
            "Invalid Performance observation clock")
    require(about["Council"][0] == "Capitol Area Council, Scouting America (Round Rock, TX)"
            and "https://app.trymovo.ai/performance" in about["Source"][0]
            and about["Note: data through"][0] == 'Movo shows no "data through" date.',
            "Unexpected Performance source, council, or data-through metadata")
    require(tabs["Summary"][0][:3] == ["View", "Total due", "Renewed"]
            and tabs["By program"][0] == ["View", "Program", "Audience", "Youth %", "Youth renewed",
                                        "Youth of", "Adult %", "Adult renewed", "Adult of", "All %", "All renewed"]
            and tabs["Districts"][0][:4] == ["View", "District", "In outreach", "Renewed"],
            "Unexpected Performance count columns")

    summary = unique_rows(tabs["Summary"][1:4], "Summary")
    cohorts = []
    for label in COHORTS:
        raw = summary["All deadlines" if label == "All" else label]
        council = counts(*raw[:2])
        programs = unique_rows([row[1:] for row in tabs["By program"][1:] if row and row[0] == label],
                               f"{label} program")
        totals = programs.pop("All programs")

        def program_count(row):
            total = counts(row[0], row[8])
            youth = counts(row[3], row[2])
            adults = counts(row[6], row[5])
            require(sum_counts([youth, adults]) == total, "Program age counts disagree")
            return total

        audience = program_count(totals)
        require(sum_counts([program_count(row) for row in programs.values()]) == audience,
                f"{label} program totals disagree")
        districts = unique_rows([row[1:] for row in tabs["Districts"][1:] if len(row) >= 7 and row[0] == label],
                                f"{label} district")
        district_total = counts(*districts.pop("All districts")[:2])
        require(district_total == audience
                and sum_counts([counts(*row[:2]) for row in districts.values()]) == audience
                and all(value <= maximum for value, maximum in zip(audience, council, strict=True)),
                f"{label} audience, district or council counts disagree")
        history = []
        if label != "All":
            i = 0 if label == "Nov 30" else 8
            history_header = tabs["Daily history"][1]
            require(history_header[i:i + 7] == ["Date", "Days left", "Renewed %", "Renewed",
                                                "+Day", "+7 days", "Note"], "Unexpected history columns")
            due = date(observed_date.year, 11, 30) if i == 0 else date(observed_date.year, 12, 31)
            for row in tabs["Daily history"][2:]:
                if len(row) <= i or row[i] is None:
                    continue
                day = source_date(row[i])
                renewed = counts(council[0], row[i + 3])[1]
                require(day <= observed_date and row[i + 1] == (due - day).days
                        and (not history or day > date.fromisoformat(history[-1][0])),
                        "History date, ordering, or deadline disagrees")
                if len(row) <= i + 6 or not str(row[i + 6]).startswith("Page shows range"):
                    history.append([day.isoformat(), renewed])
            require(history and history[-1] == [observed_date.isoformat(), council[1]],
                    f"{label} trend endpoint differs from Summary")
        cohorts.append({"label": label, "audience": audience, "council": council, "history": history,
                        "programs": [[name, *program_count(row), row[2], row[3], row[5], row[6]]
                                     for name, row in programs.items()],
                        "districts": [[name, *counts(*row[:2])] for name, row in districts.items()]})
    for key in ("audience", "council"):
        require(sum_counts([row[key] for row in cohorts[:2]]) == cohorts[2][key], f"Combined {key} disagrees")

    outreach = []
    for row in tabs["Outreach status"][1:3]:
        cohort = next(entry for entry in cohorts if entry["label"] == row[0])
        require(row[1] == cohort["audience"][0], "Outreach status coverage differs from audience")
        outreach.append([row[0], row[6], row[8], row[10]])
    pin = unique_rows(tabs["Pin data"][1:6], "PIN metric")
    pin_counts = [pin[name][0] for name in ("Reachable units", "Units contacted", "Updated their pin")]
    require(all(type(value) is int for value in pin_counts) and 0 <= pin_counts[2] <= pin_counts[1] <= pin_counts[0],
            "Invalid PIN outreach counts")
    joining = [row[:6] for row in tabs["Joining"][1:3]]
    require([row[0] for row in joining] == ["National", "Council"] and
            all(type(row[1]) is int and row[1] >= 0 and
                all(isinstance(value, (int, float)) and 0 <= value <= 1 for value in row[2:])
                for row in joining), "Invalid Joining summary")
    return {"observed_start": start.isoformat(), "observed_end": end.isoformat(),
            "data_through": None, "cohorts": cohorts, "approximate_status": outreach,
            "pin": pin_counts, "joining": joining}


def validate_asset(path):
    text = path.read_text()
    require(text.startswith(PREFIX) and text.endswith(";\n"), "Invalid Performance data script")
    payload = json.loads(text[len(PREFIX):-2])
    end = datetime.fromisoformat(payload["observed_end"])
    start = datetime.fromisoformat(payload["observed_start"])
    require(start.tzinfo and end.tzinfo and start <= end <= datetime.now(CENTRAL)
            and payload["data_through"] is None, "Invalid observed date")
    cohorts = payload["cohorts"]
    require(tuple(row["label"] for row in cohorts) == COHORTS, "Missing comparison cohorts")
    for row in cohorts:
        council = counts(*row["council"])
        audience = counts(*row["audience"])
        for name in ("programs", "districts"):
            require(sum_counts([counts(*entry[1:3]) for entry in row[name]]) == audience,
                    f"Published {name} counts disagree")
        if row["label"] != "All":
            require(row["history"][-1] == [end.astimezone(CENTRAL).date().isoformat(), council[1]],
                    "Published history endpoint differs")
    for key in ("audience", "council"):
        require(sum_counts([row[key] for row in cohorts[:2]]) == tuple(cohorts[2][key]),
                f"Published combined {key} disagrees")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("asset", type=Path)
    parser.add_argument("--workbook", type=Path)
    args = parser.parse_args()
    if args.workbook:
        result = build(json.loads(args.workbook.read_text()))
        args.asset.write_text(PREFIX + json.dumps(result, ensure_ascii=True, allow_nan=False).replace("<", "\\u003c") + ";\n")
    validate_asset(args.asset)
    print("Validated Movo Performance comparison, program/district counts, and trend endpoints")
