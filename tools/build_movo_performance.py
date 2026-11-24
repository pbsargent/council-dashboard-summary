"""Reconcile Tracker's Performance workbook before generating public aggregates.

DRAFT 2026-11-23 (Scout, for Peter's review; NOT INSTALLED). Versioned copy of
build_movo_performance.py (SHA-256
358bfc88f52704f0c946e6dd818ff07a4f209fc6f2a7cc212c3bacabceaa729b, unchanged).
It also accepts Tracker's WORKBOOK MODE: FILE workbook (built from Movo's daily
extended performance xlsx, files-primary-procedure-2026-11-23-r2.md section 4a).
Page-sourced workbooks are validated by the original rules and produce
byte-identical assets. A value the source does not print is "not stated"; a
check that depends on it is "not checkable" and is listed in the asset, never
silently passed or failed. Real mismatches between stated values still fail.
"""
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
PAGE_URL = "https://app.trymovo.ai/performance"
PAGE_WINDOW = r"(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2}) ([AP]M) (CST|CDT)"
# r2 4a About r4 / r6 wording (Tracker): the source names the posted file and its
# post clock; the window is the earliest-latest tab Data-as-of plus the post clock.
FILE_SOURCE = (r"Movo daily performance file \(Ask Movo thread\): "
               r"(Capitol_Area_Council_Movo_performance_(\d{4}-\d{2}-\d{2})_extended\.xlsx), "
               r"posted (\d{1,2}:\d{2}) ([AP]M) (CST|CDT)")
FILE_WINDOW = (r"MOVO FILE data as of (\d{1,2}:\d{2})(?: ([AP]M))?(?:[–-](\d{1,2}:\d{2}))? ([AP]M) (CST|CDT); "
               r"posted (\d{1,2}:\d{2}) ([AP]M) (CST|CDT)")
# DECISION FOR PETER (line-127 rule). "fail" = production behaviour.
# "previous_day" (draft default, matches Tracker's clarification section 9.4) = when
# the last stored Daily history row is exactly one day before the capture date,
# the trend endpoint is "not checkable" instead of a failure; older is still a failure.
# "not_checkable" = any missing capture-date row is "not checkable".
ENDPOINT_MISSING_POLICY = "previous_day"
ALLOWED_NOT_STATED = (r"(Nov 30|Dec 31) said they will",
                      r"(Nov 30|Dec 31|All) By program view",
                      r"(Nov 30|Dec 31|All) program [A-Za-z ()]{1,40}",
                      r"(Nov 30|Dec 31|All) program youth/adult split",
                      r"Joining all-councils comparisons")
ALLOWED_NOT_CHECKABLE = (r"(Nov 30|Dec 31|All) program totals \([A-Za-z0-9 ,;:()/-]{1,160}\)",
                         r"(Nov 30|Dec 31|All) By program total vs Districts total \([A-Za-z0-9 ,;:()/-]{1,160}\)",
                         r"(Nov 30|Dec 31) trend endpoint \([A-Za-z0-9 ,;:()/-]{1,160}\)")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def counts(total, renewed):
    require(type(total) is int and type(renewed) is int and 0 <= renewed <= total,
            "Invalid due or renewed count")
    return total, renewed


def missing_number(value):
    return value is None or (isinstance(value, str) and value.strip().lower() in ("", "not stated"))


def stated(*values):
    return not any(missing_number(value) for value in values)


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


def clock(day, value, meridiem):
    return datetime.combine(day, datetime.strptime(f"{value} {meridiem}", "%I:%M %p").time(), CENTRAL)


def observation(about, observed_date):
    """Return (kind, start, end, posted). Page wording keeps the original rules."""
    source = about["Source"][0]
    text = about["Capture window (CST)"][0]
    if isinstance(source, str) and PAGE_URL in source:
        window = re.fullmatch(PAGE_WINDOW, text)
        require(window is not None, "Invalid Performance observation window")
        start, end = (clock(observed_date, value, window[3]) for value in window.group(1, 2))
        require(start <= end <= datetime.now(CENTRAL) and start.tzname() == end.tzname() == window[4],
                "Invalid Performance observation clock")
        return "performance_page", start, end, None
    named = re.fullmatch(FILE_SOURCE, source) if isinstance(source, str) else None
    require(named is not None, "Unexpected Performance source, council, or data-through metadata")
    require(date.fromisoformat(named[2]) == observed_date, "MOVO FILE name date differs from capture date")
    window = re.fullmatch(FILE_WINDOW, text) if isinstance(text, str) else None
    require(window is not None, "Invalid MOVO FILE observation window")
    start = clock(observed_date, window[1], window[2] or window[4])
    end = clock(observed_date, window[3] or window[1], window[4])
    posted = clock(observed_date, window[6], window[7])
    require((window[6], window[7]) == (named[3], named[4]), "MOVO FILE post clock differs from Source")
    require(start <= end <= posted <= datetime.now(CENTRAL)
            and start.tzname() == end.tzname() == window[5]
            and posted.tzname() == window[8] == named[5], "Invalid MOVO FILE observation clock")
    return "movo_file", start, end, posted


def build(tabs):
    about = unique_rows(tabs["About"][1:], "About")
    observed_date = datetime.strptime(about["Capture date"][0], "%A, %b %d, %Y").date()
    kind, start, end, posted = observation(about, observed_date)
    movo_file = kind == "movo_file"
    require(about["Council"][0] == "Capitol Area Council, Scouting America (Round Rock, TX)"
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
    not_stated, not_checkable = [], []
    cohorts = []
    for label in COHORTS:
        raw = summary["All deadlines" if label == "All" else label]
        council = counts(*raw[:2])
        programs = unique_rows([row[1:] for row in tabs["By program"][1:] if row and row[0] == label],
                               f"{label} program")
        totals = programs.pop("All programs", None)
        age_missing = []

        def program_count(name, row):
            # None = the row's own figures are "not stated" (never zero-filled).
            if not stated(row[0], row[8]):
                return None
            total = counts(row[0], row[8])
            if len(program_header) == 12 and stated(row[9]):
                require(row[9] == row[0], "Program audience denominators disagree")
            if stated(row[2], row[3], row[5], row[6]):
                youth = counts(row[3], row[2])
                adults = counts(row[6], row[5])
                require(sum_counts([youth, adults]) == total, "Program age counts disagree")
            else:
                age_missing.append(name)
            return total

        audience_programs = program_count("All programs", totals) if totals is not None else None
        program_counts = {name: program_count(name, row) for name, row in programs.items()}
        published_programs = [[name, *program_counts[name],
                               *((row[2], row[3], row[5], row[6]) if name not in age_missing else (None,) * 4)]
                              for name, row in programs.items() if program_counts[name] is not None]
        missing_rows = [name for name, value in program_counts.items() if value is None]
        if audience_programs is None and not published_programs:
            not_stated.append(f"{label} By program view")
        else:
            not_stated.extend(f"{label} program {name}" for name in missing_rows)
            if age_missing:
                not_stated.append(f"{label} program youth/adult split")
        parts = [value for value in program_counts.values() if value is not None]
        if audience_programs is not None and not missing_rows and not movo_file:
            # Production rule, unchanged when every row is stated on a page workbook.
            require(sum_counts(parts) == audience_programs, f"{label} program totals disagree")
        elif audience_programs is not None:
            if parts:
                require(all(a <= b for a, b in zip(sum_counts(parts), audience_programs)),
                        f"{label} program totals disagree")
            reasons = ([f"not stated: {', '.join(missing_rows)}"] if missing_rows else []) + \
                      (["Post (Exploring) has no workbook row"] if movo_file else [])
            not_checkable.append(f"{label} program totals ({'; '.join(reasons)})")

        districts = unique_rows([row[1:] for row in district_rows if len(row) >= 7 and row[0] == label],
                                f"{label} district")
        district_total = counts(*districts.pop("All districts")[:2])
        district_parts = [counts(*row[:2]) for row in districts.values()]
        require(sum_counts(district_parts) == district_total, f"{label} audience, district or council counts disagree")
        if movo_file:
            # r2 4a: Districts come from the Renewals tab, By program from the By program tab;
            # their Data-as-of clocks can differ (sample: 922 at 4:02-4:12 PM vs 926 at 4:35 PM)
            # and the workbook carries no per-tab clock, so the cross-tab equality is not checkable.
            audience = district_total
            if audience_programs is not None and audience_programs != district_total:
                not_checkable.append(f"{label} By program total vs Districts total "
                                     f"(different Movo file tabs; per-tab Data-as-of not in workbook)")
        elif audience_programs is None:
            audience = district_total
            not_checkable.append(f"{label} By program total vs Districts total (By program total not stated)")
        else:
            audience = audience_programs
            require(district_total == audience, f"{label} audience, district or council counts disagree")
        require(all(value <= maximum for value, maximum in zip(audience, council, strict=True)),
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
            endpoint = [observed_date.isoformat(), council[1]]
            last = date.fromisoformat(history[-1][0]) if history else None
            if last == observed_date or ENDPOINT_MISSING_POLICY == "fail":
                require(history and history[-1] == endpoint, f"{label} trend endpoint differs from Summary")
            else:
                require(ENDPOINT_MISSING_POLICY == "not_checkable"
                        or (last is not None and last == observed_date - timedelta(days=1)),
                        f"{label} trend endpoint differs from Summary")
                not_checkable.append(f"{label} trend endpoint (no Daily history row for the capture date)")
        cohorts.append({"label": label, "audience": audience, "council": council, "history": history,
                        "programs": published_programs,
                        "districts": [[name, *counts(*row[:2])] for name, row in districts.items()]})
    for key in ("audience", "council"):
        require(sum_counts([row[key] for row in cohorts[:2]]) == cohorts[2][key], f"Combined {key} disagrees")

    outreach = []
    status_rows = tabs["Outreach status"][1:3]
    require([row[0] for row in status_rows] == list(COHORTS[:2]), "Missing outreach status cohorts")
    said_they_will = []
    for row in status_rows:
        cohort = next(entry for entry in cohorts if entry["label"] == row[0])
        require(row[1] == cohort["audience"][0], "Outreach status coverage differs from audience")
        if missing_number(row[4]):
            said_they_will.append(f"{row[0]} said they will")
        estimates = [row[6], row[8], row[10]]
        estimates = [optional_count(row[1], value) for value in estimates]
        require(all(value is None or type(value) is int and 0 <= value <= row[1] for value in estimates),
                "Invalid approximate outreach status")
        outreach.append([row[0], *estimates])
    pin = unique_rows(tabs["Pin data"][1:6], "PIN metric")
    pin_counts = [pin[name][0] for name in ("Reachable units", "Units contacted", "Updated their pin")]
    require(all(type(value) is int for value in pin_counts) and 0 <= pin_counts[2] <= pin_counts[1] <= pin_counts[0],
            "Invalid PIN outreach counts")
    joining = [list(row[:6]) for row in tabs["Joining"][1:3]]
    share = lambda value: isinstance(value, (int, float)) and 0 <= value <= 1
    require([row[0] for row in joining] == ["National", "Council"] and
            all(type(row[1]) is int and row[1] >= 0 and share(row[2]) and share(row[4])
                and all(missing_number(value) or share(value) for value in (row[3], row[5]))
                for row in joining), "Invalid Joining summary")
    if any(missing_number(row[index]) for row in joining for index in (3, 5)):
        not_stated.append("Joining all-councils comparisons")
        for row in joining:
            row[3], row[5] = (None if missing_number(value) else value for value in (row[3], row[5]))
    payload = {"observed_start": start.isoformat(), "observed_end": end.isoformat(),
               "data_through": None, "cohorts": cohorts, "approximate_status": outreach,
               "pin": pin_counts, "joining": joining, "not_stated": said_they_will + not_stated}
    if movo_file:
        payload["source_kind"] = "movo_file"
        payload["posted_at"] = posted.isoformat()
    if not_checkable:
        payload["not_checkable"] = not_checkable
    return payload


def render_asset(payload):
    return PREFIX + json.dumps(payload, ensure_ascii=True, allow_nan=False).replace("<", "\\u003c") + ";\n"


def validate_asset_text(text):
    require(text.startswith(PREFIX) and text.endswith(";\n"), "Invalid Performance data script")
    payload = json.loads(text[len(PREFIX):-2])
    end = datetime.fromisoformat(payload["observed_end"])
    start = datetime.fromisoformat(payload["observed_start"])
    require(start.tzinfo and end.tzinfo and start <= end <= datetime.now(CENTRAL)
            and payload["data_through"] is None, "Invalid observed date")
    require(all(any(re.fullmatch(p, label) for p in ALLOWED_NOT_STATED)
                for label in payload.get("not_stated", [])), "Invalid missing-field labels")
    unchecked = payload.get("not_checkable", [])
    require(isinstance(unchecked, list) and all(isinstance(label, str) and any(re.fullmatch(p, label)
            for p in ALLOWED_NOT_CHECKABLE) for label in unchecked), "Invalid not-checkable labels")
    require(payload.get("source_kind", "movo_file") == "movo_file"
            and (("source_kind" in payload) == ("posted_at" in payload)), "Invalid source kind")
    if "posted_at" in payload:
        posted = datetime.fromisoformat(payload["posted_at"])
        require(posted.tzinfo and end <= posted <= datetime.now(CENTRAL), "Invalid post clock")
    cohorts = payload["cohorts"]
    require(tuple(row["label"] for row in cohorts) == COHORTS, "Missing comparison cohorts")
    for row in cohorts:
        council = counts(*row["council"])
        audience = counts(*row["audience"])
        loose = any(label.startswith(f"{row['label']} program totals (") for label in unchecked)
        cross = any(label.startswith(f"{row['label']} By program total vs Districts total (") for label in unchecked)
        for name in ("programs", "districts"):
            parts = [counts(*entry[1:3]) for entry in row[name]]
            if name == "programs" and cross:
                continue  # programs come from a different Movo file tab than the audience
            if name == "programs" and loose:
                require(not parts or all(a <= b for a, b in zip(sum_counts(parts), audience)),
                        f"Published {name} counts disagree")
            elif name == "programs" and not parts and f"{row['label']} By program view" in payload.get("not_stated", []):
                continue
            else:
                require(sum_counts(parts) == audience, f"Published {name} counts disagree")
        if row["label"] != "All":
            if any(label.startswith(f"{row['label']} trend endpoint (") for label in unchecked):
                require(not row["history"] or date.fromisoformat(row["history"][-1][0]) < end.astimezone(CENTRAL).date(),
                        "Published history endpoint differs")
            else:
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
