#!/usr/bin/env python3
"""Build the Unit Level Dashboard JSON from the Unit Level Metrics workbook.

This follows the Council dashboard's source pattern: read the locally available
workbook with openpyxl/data_only, publish a compact JSON snapshot, and keep the
browser independent from Excel and OneDrive.
"""

from __future__ import annotations

import argparse
import json
import re
import os
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from openpyxl import load_workbook
from beascout_links import enrich, expected_source_ids


def clean(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if value in (None, ""):
        return None
    return value


def yes(value):
    return str(value or "").strip().lower() == "yes"


def records(sheet, header_row=1):
    headers = [cell.value for cell in sheet[header_row]]
    for values in sheet.iter_rows(min_row=header_row + 1, values_only=True):
        if not any(value not in (None, "") for value in values):
            continue
        yield {str(headers[index]).strip(): value for index, value in enumerate(values) if index < len(headers) and headers[index]}


def working_copy_rows(workbook):
    """Map the working copy's native tables without mixing another generation."""
    required = {'Units', 'Unit Metrics', 'MembersDueToRenew'}
    if not required <= set(workbook.sheetnames):
        raise ValueError('Working copy is missing required Unit-Level source tabs')
    unit_rows = list(records(workbook['Units']))
    keys = {}
    for row in unit_rows:
        uid, key = row.get('Unit_ID'), clean(row.get('Unique_ID'))
        if not isinstance(uid, (int, float)) or not key or key in keys:
            raise ValueError('Working-copy Units requires unique unit IDs and exact join keys')
        keys[key] = int(uid)
    if len(set(keys.values())) != len(keys):
        raise ValueError('Working-copy Units contains duplicate unit IDs')
    training = [{**row, 'UnitID': row['Unit_ID'], 'BALOO Trained': row.get('Baloo Trained'),
                 'SYT 0-30': row.get('SYT\n0-30'), 'SYT 31-90': row.get('SYT\n31-90')}
                for row in unit_rows]
    metric_rows = []
    for row in records(workbook['Unit Metrics'], header_row=2):
        metric_rows.append({**row, 'Youth Prev Yr': row.get('Youth Prev_Yr'),
                            'Exceed Small Unit Threshold': row.get('Exceed_Small Unit_Threshold'),
                            'Connection': row.get('Connect Date'),
                            'Chartered Organization': row.get('Chartered_Organization')})
    # Read only the native query table's first 12 columns. Later calculated
    # columns repeat the Renewal header and must not overwrite its source date.
    source = workbook['MembersDueToRenew'].iter_rows(values_only=True)
    headers = list(next(source))[:12]
    due_rows = []
    unmatched = 0
    for values in source:
        row = dict(zip(headers, values[:12]))
        if not any(v not in (None, '') for v in values[:12]): continue
        uid = keys.get(clean(row.get('Key')))
        if uid is None:
            unmatched += 1
            continue  # Retain unavailable unit coverage; never guess a join.
        due_rows.append({**row, 'UnitID': uid})
    return training, metric_rows, due_rows, unmatched


def unit_name(row):
    name = str(row.get("Name") or "").strip()
    if name:
        return name
    parts = [str(row.get("Unit") or "").strip(), str(row.get("#") or "").strip(), str(row.get("Gender") or "").strip()]
    return " ".join(part for part in parts if part)


def workbook_report_date(path):
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})_CAC - Unit Metric Scorecard\.xlsx", Path(path).name)
    if not match:
        raise ValueError("Unit Level source requires a dated CAC - Unit Metric Scorecard filename")
    return date.fromisoformat(match[1]).isoformat()


def complete_unit_population(units, council, report_date, training_by_id, renewals):
    """Keep source Units identities when the scorecard has no usable metric."""
    dashboard = council.get("dashboard", {})
    if dashboard.get("report_date") != report_date:
        raise ValueError("Council/Unit-Level source dates differ")
    population = dashboard.get("membership_operations", {}).get("units")
    if not isinstance(population, list) or not population:
        raise ValueError("Council snapshot lacks authoritative Units population")
    source_ids = [int(row["unit_id"]) for row in population]
    existing_ids = [row["unit_id"] for row in units]
    if len(source_ids) != len(set(source_ids)) or len(existing_ids) != len(set(existing_ids)) or not set(existing_ids) <= set(source_ids):
        raise ValueError("Duplicate or unmatched Unit-Level identity")
    population_by_id = {int(row["unit_id"]): row for row in population}
    for unit in units:
        unit["district"] = population_by_id[unit["unit_id"]]["district"]
    for row in population:
        uid = int(row["unit_id"])
        if uid in existing_ids:
            continue
        match = re.fullmatch(r"(Pack|Troop|Crew|Ship|Post)\s+(\d+(?:\.0+)?)(?:\s+(.+))?", row["unit"], flags=re.I)
        if not match:
            raise ValueError("Authoritative unit display identity is invalid")
        due = renewals.get(uid, {"records": 0, "youth": 0, "adults": 0, "opt_outs": 0, "dates": {}, "members": []})
        units.append({"unit_id":uid,"district":row["district"],"name":row["unit"],"unit_type":row["unit_type"],
                      "number":int(match[2].split('.')[0]),"gender":match[3],"metric":None,"youth":row["youth"],
                      "youth_prior":None,"youth_change":None,"retention_pct":None,"advancement_pct":None,
                      "last_outdoor_date":None,"last_connection":None,"commissioner":None,"chartered_organization":None,
                      "drivers":{key:None for key in ("ul_cc_trained","size","growth","advancement_or_officers","outdoor")},
                      "unit_leader_trained":None,"committee_chair_trained":None,"training":training_by_id.get(uid, {}),
                      "renewal_records":{"total":due["records"],"youth":due["youth"],"adults":due["adults"],
                                         "opt_outs":due["opt_outs"],"by_date":dict(due["dates"]),"members":due["members"]}})
    return units


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/unit-level-latest.json"))
    parser.add_argument("--js-output", type=Path, default=Path("data/unit-level-latest.js"))
    parser.add_argument("--council-snapshot", type=Path, help="Same-day Council JSON with complete source Units identities")
    parser.add_argument("--beascout-pin-report", type=Path, help="Same-day raw PIN CSV used only to resolve public listing URLs")
    parser.add_argument("--beascout-audit", type=Path, help="Private link-resolution audit outside the public site")
    parser.add_argument('--working-copy-receipt', type=Path, help='Verified Ranger source receipt for this exact workbook')
    args = parser.parse_args()
    if args.council_snapshot and not args.beascout_pin_report:
        parser.error("Council builds require --beascout-pin-report")
    if args.beascout_audit and "pages-stage" in args.beascout_audit.parts:
        parser.error("BeAScout audit must remain outside the public staging tree")

    workbook = load_workbook(args.workbook, read_only=True, data_only=True)
    working = args.working_copy_receipt is not None
    if working:
        sys.path.insert(0, str(Path(os.environ['CAC_DASHBOARD_ROOT']) / 'tools'))
        from working_copy_source import validate_captured
        proof = validate_captured(args.workbook, args.working_copy_receipt)
        training_rows, metric_rows, due_rows, unmatched_due = working_copy_rows(workbook)
    else:
        training_rows = records(workbook['Units']) if 'Units' in workbook.sheetnames else []
        metric_rows = records(workbook['Unit_Metrics']) if 'Unit_Metrics' in workbook.sheetnames else []
        due_rows = records(workbook['MembersDueToRenew']) if 'MembersDueToRenew' in workbook.sheetnames else []
    required = {"Unit Metrics" if working else "Unit_Metrics", "Units", "MembersDueToRenew"}
    missing = sorted(required.difference(workbook.sheetnames))
    if missing:
        raise RuntimeError(f"Workbook is missing required sheets: {', '.join(missing)}")

    training_by_id = {}
    for row in training_rows:
        unit_id = row.get("UnitID")
        if unit_id in (None, ""):
            continue
        training_by_id[int(unit_id)] = {
            "direct_contact_trained_rate": clean(row.get("Direct Contact Trained")),
            "all_leaders_trained_rate": clean(row.get("All Ldr Trained")),
            "baloo_trained": clean(row.get("BALOO Trained")),
            "syt_compliance_rate": clean(row.get("SYT")),
            "syt_0_30": clean(row.get("SYT 0-30")) or 0,
            "syt_31_90": clean(row.get("SYT 31-90")) or 0,
        }

    renewals = defaultdict(lambda: {"records": 0, "youth": 0, "adults": 0, "opt_outs": 0, "dates": defaultdict(int), "members": []})
    for row in due_rows:
        unit_id = row.get("UnitID")
        if not isinstance(unit_id, (int, float)):
            continue
        summary = renewals[int(unit_id)]
        summary["records"] += 1
        if str(row.get("Youth") or "").strip().lower() == "yes":
            summary["youth"] += 1
        else:
            summary["adults"] += 1
        if str(row.get("Opt_Out") or "").strip().lower() == "yes":
            summary["opt_outs"] += 1
        renewal = row.get("Renewal")
        renewal_date = None
        if isinstance(renewal, (datetime, date)):
            renewal_date = renewal.date().isoformat() if isinstance(renewal, datetime) else renewal.isoformat()
            summary["dates"][renewal_date] += 1
        summary["members"].append({
            "name": clean(row.get("Name")),
            "renewal_date": renewal_date,
            "type": "Youth" if str(row.get("Youth") or "").strip().lower() == "yes" else "Adult",
            "opt_out": str(row.get("Opt_Out") or "").strip().lower() == "yes",
        })

    units = []
    for row in metric_rows:
        unit_id = row.get("Unit_ID")
        metric = row.get("Unit Metric")
        if not isinstance(unit_id, (int, float)) or not isinstance(metric, (int, float)):
            continue
        unit_id = int(unit_id)
        youth = row.get("Youth") if isinstance(row.get("Youth"), (int, float)) else None
        prior = row.get("Youth Prev Yr") if isinstance(row.get("Youth Prev Yr"), (int, float)) else None
        due = renewals.get(unit_id, {"records": 0, "youth": 0, "adults": 0, "opt_outs": 0, "dates": {}, "members": []})
        units.append({
            "unit_id": unit_id,
            "district": clean(row.get("District")),
            "name": unit_name(row),
            "unit_type": clean(row.get("Unit")),
            "number": clean(row.get("#")),
            "gender": clean(row.get("Gender")),
            "metric": metric,
            "youth": youth,
            "youth_prior": prior,
            "youth_change": youth - prior if youth is not None and prior is not None else None,
            "retention_pct": clean(row.get("Retention")),
            "advancement_pct": clean(row.get("Advancement")),
            "last_outdoor_date": clean(row.get("Super Activity")),
            "last_connection": clean(row.get("Connection")),
            "commissioner": clean(row.get("Commissioner")),
            "chartered_organization": clean(row.get("Chartered Organization")),
            "drivers": {
                "ul_cc_trained": yes(row.get("UL-CC Trained")),
                "size": yes(row.get("Exceed Small Unit Threshold")),
                "growth": yes(row.get("YOY Growth")),
                "advancement_or_officers": yes(row.get("Advancement OR Officers")),
                "outdoor": yes(row.get("Outdoor")),
            },
            "unit_leader_trained": yes(row.get("UL Trained")),
            "committee_chair_trained": yes(row.get("CC Trained")),
            "training": training_by_id.get(unit_id, {}),
            "renewal_records": {
                "total": due["records"],
                "youth": due["youth"],
                "adults": due["adults"],
                "opt_outs": due["opt_outs"],
                "by_date": dict(sorted(due["dates"].items())),
                "members": sorted(due["members"], key=lambda member: (member["renewal_date"] or "", member["name"] or "")),
            },
        })

    snapshot_date = proof['report_date'] if working else workbook_report_date(args.workbook)
    if args.council_snapshot:
        council = json.loads(args.council_snapshot.read_text())
        complete_unit_population(units, council, snapshot_date, training_by_id, renewals)
    units.sort(key=lambda row: (row["district"] or "", row["name"] or ""))
    output = {
        "generated_at": datetime.now(ZoneInfo("America/Chicago")).isoformat(timespec="seconds"),
        "data_date": snapshot_date,
        "source": {
            "name": args.workbook.name,
            "method": "openpyxl read_only=True, data_only=True; compact JSON snapshot",
            "sheets": ["Unit Metrics" if working else "Unit_Metrics", "Units", "MembersDueToRenew"],
            "population_source": "Same-day Council Units via membership_operations" if args.council_snapshot else "Scorecard metric rows only",
        },
        "default_unit_id": 258381 if any(row["unit_id"] == 258381 for row in units) else (units[0]["unit_id"] if units else None),
        "units": units,
    }
    if working:
        output['source']['generation'] = 'Ranger verified working copy; all Unit-Level fields from the same captured workbook'
        output['source']['unmatched_renewal_rows'] = unmatched_due

    if args.beascout_pin_report:
        expected_ids = expected_source_ids(units, council) if args.council_snapshot else None
        try:
            summary, audit = enrich(units, args.beascout_pin_report, snapshot_date, expected_ids=expected_ids)
        except Exception as error:
            if args.beascout_audit:
                args.beascout_audit.parent.mkdir(parents=True, exist_ok=True)
                args.beascout_audit.write_text(json.dumps(getattr(error, "audit", [{"result": "Build failed: " + type(error).__name__}]), indent=2) + "\n")
            raise
        output["source"]["beascout_links"] = summary
        if args.beascout_audit:
            args.beascout_audit.parent.mkdir(parents=True, exist_ok=True)
            args.beascout_audit.write_text(json.dumps(audit, indent=2) + "\n")
        print("BeAScout links: " + json.dumps(summary))

    if working:
        validate_captured(args.workbook, args.working_copy_receipt, snapshot_date)
    workbook.close()
    payload = json.dumps(output, indent=2, ensure_ascii=False)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(payload, encoding="utf-8")
    args.js_output.parent.mkdir(parents=True, exist_ok=True)
    args.js_output.write_text(f"window.UNIT_LEVEL_DATA = {payload};\n", encoding="utf-8")
    print(f"Wrote {len(units)} units to {args.output} and {args.js_output}")


if __name__ == "__main__":
    main()
