#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


API_URL = "https://api.monday.com/v2"
DASHBOARD_NAME = "Cub Scout JSN Dashboard"
DASHBOARD_URL = "https://capitolareacouncil564.monday.com/overviews/32299792"
BOARD_ID = 18420720719
BOARD_NAME = "2026 Fall Recruitment Tracking"
BOARD_URL = "https://capitolareacouncil564.monday.com/boards/18420720719"
DEFAULT_TOKEN_FILE = Path(
    "/Users/petersargent/Documents/06 Personal, Legal, and Sensitive/"
    "Sensitive - Move to Password Manager/Monday-Com-API-Token.txt"
)
CENTRAL = ZoneInfo("America/Chicago")

COLUMNS = {
    "district": "color_mm50b1tc",
    "cub_target": "mirror_cub_target",
    "jsn_date": "date_mm50t60z",
    "time": "formula_mm5qmv3h",
    "location": "color_mm50c0e3",
    "fliers": "numeric_mm505ha1",
    "sticker_sheets": "numeric_mm50nn2r",
    "p2p": "numeric_mm50p7cv",
    "unit_associated": "board_relation_mm55dgty",
    "no_recruitment_plans": "boolean_mm63ddc4",
}

DISTRICT_ORDER = [
    "Waterloo",
    "Thunderbird",
    "Bee Cave",
    "San Gabriel",
    "Live Oak",
    "Armadillo",
    "Chisholm Trail",
    "Sacred Springs",
    "North Shore",
    "Hill Country",
    "Colorado River",
]

TARGETS = {"Core", "Partial"}
NO_PACK_DISTRICTS = set(DISTRICT_ORDER) - {"North Shore", "Waterloo"}
NO_PLAN_DISTRICTS = set(DISTRICT_ORDER) - {"Waterloo"}
DASHBOARD_DISTRICTS = set(DISTRICT_ORDER) - {"Waterloo"}

COLORS = {
    "Bee Cave": "#00c875",
    "North Shore": "#00854a",
    "Thunderbird": "#737990",
    "Armadillo": "#fdab3d",
    "San Gabriel": "#cab641",
    "Waterloo": "#bb3354",
    "Chisholm Trail": "#007eb5",
    "Sacred Springs": "#ffcb00",
    "Live Oak": "#9d50dd",
    "Hill Country": "#579bfc",
    "Colorado River": "#df2f4a",
    "Exploring": "#ff007f",
    "Unassigned": "#8b93aa",
}

TIME_ORDER = [
    "1:00 PM",
    "3:30 PM",
    "4:15 PM",
    "4:30 PM",
    "5:00 PM",
    "9:30 AM",
    "9:00 AM",
    "6:00 PM",
    "6:30 PM",
    "6:45 PM",
]


def read_token(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        if "=" in text:
            text = text.split("=", 1)[1].strip()
        return text.strip("\"'")
    raise ValueError(f"No monday.com API token found in {path}")


def monday_query(token: str, query: str, variables: dict[str, Any]) -> dict[str, Any]:
    request = Request(
        API_URL,
        data=json.dumps({"query": query, "variables": variables}).encode("utf-8"),
        headers={
            "Authorization": token,
            "Content-Type": "application/json",
            "API-Version": "2025-04",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=45) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"monday.com API HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"monday.com API connection failed: {error}") from error
    if parsed.get("errors"):
        raise RuntimeError(f"monday.com API returned errors: {parsed['errors']}")
    return parsed["data"]


def fetch_items(token: str) -> list[dict[str, Any]]:
    query = """
    query FallRecruitment($boardId: [ID!], $columnIds: [String!], $cursor: String) {
      boards(ids: $boardId) {
        items_page(limit: 500, cursor: $cursor) {
          cursor
          items {
            id
            name
            updated_at
            column_values(ids: $columnIds) {
              id
              text
              value
              ... on MirrorValue { display_value }
              ... on BoardRelationValue { display_value linked_item_ids }
              ... on FormulaValue { display_value }
            }
          }
        }
      }
    }
    """
    items: list[dict[str, Any]] = []
    cursor = None
    while True:
        data = monday_query(
            token,
            query,
            {
                "boardId": [str(BOARD_ID)],
                "columnIds": list(COLUMNS.values()),
                "cursor": cursor,
            },
        )
        boards = data.get("boards") or []
        if not boards:
            raise RuntimeError(f"Board {BOARD_ID} was not returned by monday.com")
        page = boards[0]["items_page"]
        items.extend(page.get("items") or [])
        cursor = page.get("cursor")
        if not cursor:
            return items
        time.sleep(0.15)


def values_by_id(item: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {value["id"]: value for value in item.get("column_values", [])}


def parse_number(value: dict[str, Any] | None) -> float:
    text = str((value or {}).get("text") or "").replace(",", "").strip()
    try:
        return float(text) if text else 0.0
    except ValueError:
        return 0.0


def parse_jsn_datetime(value: dict[str, Any] | None) -> datetime | None:
    raw = (value or {}).get("value")
    if raw:
        try:
            parsed = raw if isinstance(raw, dict) else json.loads(raw)
            day = parsed.get("date")
            clock = parsed.get("time") or "00:00:00"
            if day:
                return datetime.fromisoformat(f"{day}T{clock}").replace(tzinfo=timezone.utc).astimezone(CENTRAL)
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    text = str((value or {}).get("text") or "").strip()
    for pattern in ("%Y-%m-%d %H:%M", "%Y-%m-%d %I:%M %p", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, pattern).replace(tzinfo=CENTRAL)
        except ValueError:
            continue
    return None


def has_explicit_time(value: dict[str, Any] | None) -> bool:
    raw = (value or {}).get("value")
    if not raw:
        return False
    try:
        parsed = raw if isinstance(raw, dict) else json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return False
    return bool(parsed.get("time"))


def parse_checkbox(value: dict[str, Any] | None) -> bool:
    raw = (value or {}).get("value")
    if not raw:
        return False
    try:
        parsed = raw if isinstance(raw, dict) else json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return False
    return str(parsed.get("checked") or "").lower() in {"true", "1"}


def time_label(value: datetime) -> str:
    return value.strftime("%I:%M %p").lstrip("0")


def day_label(value: date) -> str:
    return f"{value:%b} {value.day}"


def week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def week_label(value: date) -> str:
    return f"{value:%b} {value.day}, ’{value:%y}"


def ordered_counts(
    buckets: dict[Any, Counter[str]],
    keys: list[Any],
    label,
) -> dict[str, dict[str, int]]:
    return {
        label(key): dict(buckets[key])
        for key in keys
        if buckets.get(key)
    }


def integer_or_float(value: float) -> int | float:
    return int(value) if value.is_integer() else value


def build_dashboard(items: list[dict[str, Any]]) -> dict[str, Any]:
    district_counts: Counter[str] = Counter()
    district_all_counts: Counter[str] = Counter()
    district_date_buckets: dict[str, Counter[str]] = defaultdict(Counter)
    location_buckets: dict[str, Counter[str]] = defaultdict(Counter)
    time_buckets: dict[str, Counter[str]] = defaultdict(Counter)
    week_buckets: dict[date, Counter[str]] = defaultdict(Counter)
    month_buckets: dict[date, Counter[str]] = defaultdict(Counter)
    day_buckets: dict[date, Counter[str]] = defaultdict(Counter)
    materials = {"fliers": 0.0, "stickers": 0.0, "p2p": 0.0}
    no_cub_packs: Counter[str] = Counter()
    no_recruitment_plans: Counter[str] = Counter()
    scheduled = 0
    eligible_items = 0

    for item in items:
        values = values_by_id(item)
        district = str(values.get(COLUMNS["district"], {}).get("text") or "").strip()
        cub_target = str(values.get(COLUMNS["cub_target"], {}).get("display_value") or "").strip()
        no_plans = parse_checkbox(values.get(COLUMNS["no_recruitment_plans"]))
        unit_associated = str(values.get(COLUMNS["unit_associated"], {}).get("display_value") or "").strip()

        # The four material widgets on monday.com sum the entire connected board.
        materials["fliers"] += parse_number(values.get(COLUMNS["fliers"]))
        materials["stickers"] += parse_number(values.get(COLUMNS["sticker_sheets"]))
        materials["p2p"] += parse_number(values.get(COLUMNS["p2p"]))

        # These two widgets intentionally use their own monday.com filters.
        if cub_target in TARGETS and not unit_associated and district:
            if not no_plans and district in NO_PACK_DISTRICTS:
                no_cub_packs[district] += 1
            if no_plans and district in NO_PLAN_DISTRICTS:
                no_recruitment_plans[district] += 1

        when = parse_jsn_datetime(values.get(COLUMNS["jsn_date"]))

        # The district widget uses its own two filters and includes No Date.
        if cub_target in TARGETS and not no_plans:
            eligible_items += 1
            if district:
                district_all_counts[district] += 1
                if when is None:
                    district_date_buckets[district]["No Date"] += 1
                else:
                    district_date_buckets[district][day_label(when.date())] += 1

        # Location, time, day, week, and month widgets use only the monday.com
        # Scouting District selection. Location does not require a JSN date.
        location = str(values.get(COLUMNS["location"], {}).get("text") or "").strip()
        if district in DASHBOARD_DISTRICTS and location:
            location_buckets[location][district] += 1
        if district not in DASHBOARD_DISTRICTS or when is None:
            continue
        scheduled += 1
        if district:
            district_counts[district] += 1
        if has_explicit_time(values.get(COLUMNS["jsn_date"])):
            time_buckets[time_label(when)][district] += 1
        day = when.date()
        day_buckets[day][district] += 1
        week_buckets[week_start(day)][district] += 1
        month_buckets[day.replace(day=1)][district] += 1

    extra_times = sorted(
        (label for label in time_buckets if label not in TIME_ORDER),
        key=lambda label: datetime.strptime(label, "%I:%M %p").time(),
    )
    active_districts = set(district_all_counts)
    district_order = [district for district in DISTRICT_ORDER if district in active_districts]
    district_order.extend(sorted(active_districts - set(district_order)))
    location_order = [
        label
        for label in ("Library", "Classroom", "Outside on campus", "Outside on campu", "Not at School", "Cafeteria")
        if label in location_buckets
    ]
    location_order.extend(sorted(set(location_buckets) - set(location_order)))
    normalized_materials = {
        key: integer_or_float(value)
        for key, value in materials.items()
    }
    district_all_order = sorted(
        district_all_counts,
        key=lambda district: (-district_all_counts[district], district),
    )
    date_order = [day_label(day) for day in sorted(day_buckets)]
    date_order.append("No Date")
    no_pack_order = sorted(no_cub_packs, key=lambda district: (-no_cub_packs[district], district))
    no_plan_order = sorted(no_recruitment_plans, key=lambda district: (-no_recruitment_plans[district], district))

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "dashboardName": DASHBOARD_NAME,
        "dashboardUrl": DASHBOARD_URL,
        "boardName": BOARD_NAME,
        "boardUrl": BOARD_URL,
        "sourceItems": len(items),
        "totalItems": eligible_items,
        "scheduled": scheduled,
        "eligibility": {
            "cubTargets": sorted(TARGETS),
            "noRecruitmentPlans": False,
            "dashboardDistricts": sorted(DASHBOARD_DISTRICTS),
        },
        "districtCounts": dict(district_counts),
        "districtAllCounts": dict(district_all_counts),
        "districtAllOrder": district_all_order,
        "districtDateBuckets": {district: dict(district_date_buckets[district]) for district in district_all_order},
        "districtDateOrder": date_order,
        "locationBuckets": ordered_counts(location_buckets, location_order, lambda value: "Outside on campus" if value == "Outside on campu" else value),
        "timeBuckets": ordered_counts(time_buckets, [*TIME_ORDER, *extra_times], str),
        "weekBuckets": ordered_counts(week_buckets, sorted(week_buckets), week_label),
        "monthBuckets": ordered_counts(month_buckets, sorted(month_buckets), lambda value: value.strftime("%B %Y")),
        "dayBuckets": ordered_counts(day_buckets, sorted(day_buckets), day_label),
        "materials": normalized_materials,
        "totalMaterials": integer_or_float(sum(materials.values())),
        "districtOrder": district_order,
        "noCubPacks": dict(no_cub_packs),
        "noCubPacksOrder": no_pack_order,
        "noRecruitmentPlans": dict(no_recruitment_plans),
        "noRecruitmentPlansOrder": no_plan_order,
        "expense": {"spent": 0, "budgeted": 19500},
        "gaugeMaximums": {"fliers": 63000, "stickers": 40000, "p2p": 11000},
        "colors": COLORS,
    }


def write_javascript(path: Path, dashboard: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(dashboard, ensure_ascii=False, indent=2)
    path.write_text(f"window.FALL_RECRUITMENT_DATA = {payload};\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the public Cub Scout JSN Dashboard data bundle.")
    parser.add_argument("--token-file", type=Path, default=DEFAULT_TOKEN_FILE)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    dashboard = build_dashboard(fetch_items(read_token(args.token_file)))
    write_javascript(args.output, dashboard)
    print(json.dumps({
        "output": str(args.output),
        "items": dashboard["totalItems"],
        "scheduled": dashboard["scheduled"],
        "materials": dashboard["totalMaterials"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
