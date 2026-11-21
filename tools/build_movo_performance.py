"""Reconcile Tracker's Performance workbook before generating public aggregates."""
import argparse
from datetime import date, datetime, timedelta
from hashlib import sha256
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


def missing_number(value):
    return value is None or (isinstance(value, str) and value.strip().lower() in ("", "not stated"))


def optional_count(total, value):
    return None if missing_number(value) else counts(total, value)[1]


def sum_counts(rows):
    return tuple(map(sum, zip(*rows, strict=True)))


def unique_rows(rows, label):
    keys = [row[0] for row in rows]
    require(len(keys) == len(set(keys)), f"Duplicate {label} rows")
    return dict((row[0], row[1:]) for row in rows)


def source_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
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
            and tabs["By program"][0][:11] == ["View", "Program", "Audience", "Youth %", "Youth renewed",
                                        "Youth of", "Adult %", "Adult renewed", "Adult of", "All %", "All renewed"]
            and tabs["Districts"][0][:4] == ["View", "District", "In outreach", "Renewed"],
            "Unexpected Performance count columns")

    program_header = tabs["By program"][0]
    require(len(program_header) == 11 or program_header[11:] == ["All of"],
            "Unexpected program audience columns")
    district_rows = tabs["Districts"][1:]
    for i, row in enumerate(district_rows):
        if row and row[0] == "District dot plot (% / members in outreach)":
            district_rows = district_rows[:i]
            break
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
            if len(program_header) == 12:
                require(row[9] == row[0], "Program audience denominators disagree")
            youth = counts(row[3], row[2])
            adults = counts(row[6], row[5])
            require(sum_counts([youth, adults]) == total, "Program age counts disagree")
            return total

        audience = program_count(totals)
        require(sum_counts([program_count(row) for row in programs.values()]) == audience,
                f"{label} program totals disagree")
        districts = unique_rows([row[1:] for row in district_rows if len(row) >= 7 and row[0] == label],
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
                renewed = optional_count(council[0], row[i + 3])
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
    not_stated = []
    status_rows = tabs["Outreach status"][1:3]
    require([row[0] for row in status_rows] == list(COHORTS[:2]), "Missing outreach status cohorts")
    for row in status_rows:
        cohort = next(entry for entry in cohorts if entry["label"] == row[0])
        require(row[1] == cohort["audience"][0], "Outreach status coverage differs from audience")
        if missing_number(row[4]):
            not_stated.append(f"{row[0]} said they will")
        estimates = [row[6], row[8], row[10]]
        estimates = [optional_count(row[1], value) for value in estimates]
        require(all(value is None or type(value) is int and 0 <= value <= row[1] for value in estimates),
                "Invalid approximate outreach status")
        outreach.append([row[0], *estimates])
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
            "pin": pin_counts, "joining": joining, "not_stated": not_stated}


def render_asset(payload):
    return PREFIX + json.dumps(payload, ensure_ascii=True, allow_nan=False).replace("<", "\\u003c") + ";\n"


def validate_asset_text(text):
    require(text.startswith(PREFIX) and text.endswith(";\n"), "Invalid Performance data script")
    payload = json.loads(text[len(PREFIX):-2])
    end = datetime.fromisoformat(payload["observed_end"])
    start = datetime.fromisoformat(payload["observed_start"])
    require(start.tzinfo and end.tzinfo and start <= end <= datetime.now(CENTRAL)
            and payload["data_through"] is None, "Invalid observed date")
    require(all(label in ("Nov 30 said they will", "Dec 31 said they will")
                for label in payload.get("not_stated", [])), "Invalid missing-field labels")
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
    for row in cohorts:
        last_day = None
        for day, renewed in row["history"]:
            parsed = date.fromisoformat(day)
            require(parsed <= end.astimezone(CENTRAL).date() and (last_day is None or parsed > last_day),
                    "Published history dates disagree")
            if renewed is not None:
                counts(row["council"][0], renewed)
            last_day = parsed
    for row in payload["approximate_status"]:
        require(len(row) == 4 and row[0] in COHORTS[:2], "Invalid published approximate status")
        maximum = next(cohort["audience"][0] for cohort in cohorts if cohort["label"] == row[0])
        for value in row[1:]:
            if value is not None:
                counts(maximum, value)
    for key in ("audience", "council"):
        require(sum_counts([row[key] for row in cohorts[:2]]) == tuple(cohorts[2][key]),
                f"Published combined {key} disagrees")

    return payload


def validate_asset(path):
    return validate_asset_text(path.read_text())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("asset", type=Path)
    parser.add_argument("--workbook", type=Path)
    parser.add_argument("--page", type=Path, help="Set the staged page’s data URL to the verified asset hash")
    args = parser.parse_args()
    if args.workbook:
        result = build(json.loads(args.workbook.read_text()))
        args.asset.write_text(render_asset(result))
    validate_asset(args.asset)
    if args.page:
        revision = sha256(args.asset.read_bytes()).hexdigest()[:16]
        page = args.page.read_text()
        page, replacements = re.subn(r"(data/movo-performance-latest\.js\?v=)[a-zA-Z0-9-]+",
                                     rf"\g<1>{revision}", page)
        require(replacements == 1, "Expected one Movo Performance data script URL")
        args.page.write_text(page)
    print("Validated Movo Performance comparison, program/district counts, and trend endpoints")
