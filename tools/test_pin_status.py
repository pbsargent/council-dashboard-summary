#!/usr/bin/env python3
"""Regression tests for public BeAScout PIN display-state classification."""

from __future__ import annotations

import importlib.util
import unittest
from datetime import date, datetime
from pathlib import Path
from tempfile import NamedTemporaryFile


BUILD_SITE_PATH = Path(__file__).resolve().parents[3] / "work" / "commissioner_site" / "build_site.py"
SPEC = importlib.util.spec_from_file_location("commissioner_build_site", BUILD_SITE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {BUILD_SITE_PATH}")
BUILD_SITE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD_SITE)

from validate_site_structure import validate_unit_pin_snapshot


class PinDisplayStatusTests(unittest.TestCase):
    AS_OF = date(2026, 8, 31)

    def test_older_than_twelve_months_is_stale(self) -> None:
        row = {"lastmodifieddate": datetime(2025, 8, 30), "pinstatus": "Active"}
        self.assertEqual(BUILD_SITE.pin_display_status(row, self.AS_OF), "Stale")

    def test_exact_cutoff_retains_source_status(self) -> None:
        row = {"lastmodifieddate": datetime(2025, 8, 31), "pinstatus": "Inactive"}
        self.assertEqual(BUILD_SITE.pin_display_status(row, self.AS_OF), "Inactive")

    def test_blank_or_invalid_date_is_stale(self) -> None:
        self.assertEqual(
            BUILD_SITE.pin_display_status({"lastmodifieddate": None, "pinstatus": "Active"}, self.AS_OF),
            "Stale",
        )
        self.assertEqual(
            BUILD_SITE.pin_display_status({"lastmodifieddate": "not-a-date", "pinstatus": "Inactive"}, self.AS_OF),
            "Stale",
        )

    def test_current_record_retains_active_or_inactive(self) -> None:
        self.assertEqual(
            BUILD_SITE.pin_display_status(
                {"lastmodifieddate": "2026-08-30T00:00:00", "pinstatus": "Active"}, self.AS_OF
            ),
            "Active",
        )

    def test_unmatched_pin_record_remains_unavailable(self) -> None:
        self.assertIsNone(BUILD_SITE.pin_display_status(None, self.AS_OF))

    def test_last_updated_is_published_as_a_calendar_date(self) -> None:
        self.assertEqual(
            BUILD_SITE.pin_last_updated({"lastmodifieddate": datetime(2026, 8, 30, 23, 45)}),
            "2026-08-30",
        )
        self.assertEqual(
            BUILD_SITE.pin_last_updated({"lastmodifieddate": "2026-08-30T23:45:00"}),
            "2026-08-30",
        )
        self.assertIsNone(BUILD_SITE.pin_last_updated({"lastmodifieddate": "not-a-date"}))
        self.assertIsNone(BUILD_SITE.pin_last_updated(None))

    def test_leap_day_cutoff_uses_calendar_year(self) -> None:
        self.assertEqual(BUILD_SITE.twelve_month_cutoff(date(2024, 2, 29)), date(2023, 2, 28))

    def test_report_date_comes_from_dated_workbook_name(self) -> None:
        with NamedTemporaryFile(prefix="2026-08-31_Dashboard - CAC", suffix=".xlsx") as workbook:
            self.assertEqual(BUILD_SITE.report_date_for_path(Path(workbook.name)), self.AS_OF)


class PinFieldCompletenessTests(unittest.TestCase):
    COMPLETE_ROW = {
        "pinstatus": "Active",
        "BeAScout Contact": "Contact Name",
        "BeAScout email": "contact@example.invalid",
        "BeAScout phone#": "",
        "Meeting Location": "Community Center",
        "Meeting": "Tuesdays",
    }

    def test_complete_pin_has_all_privacy_safe_flags(self) -> None:
        self.assertEqual(
            BUILD_SITE.pin_field_completeness(self.COMPLETE_ROW),
            {
                "pin_status_complete": True,
                "pin_contact_complete": True,
                "pin_meeting_complete": True,
                "pin_details_complete": True,
            },
        )

    def test_contact_requires_name_and_at_least_one_method(self) -> None:
        no_name = {**self.COMPLETE_ROW, "BeAScout Contact": ""}
        no_method = {**self.COMPLETE_ROW, "BeAScout email": "", "BeAScout phone#": ""}
        self.assertFalse(BUILD_SITE.pin_field_completeness(no_name)["pin_contact_complete"])
        self.assertFalse(BUILD_SITE.pin_field_completeness(no_method)["pin_contact_complete"])
        self.assertFalse(BUILD_SITE.pin_field_completeness(no_name)["pin_details_complete"])

    def test_meeting_requires_location_and_details(self) -> None:
        no_location = {**self.COMPLETE_ROW, "Meeting Location": ""}
        no_details = {**self.COMPLETE_ROW, "Meeting": ""}
        self.assertFalse(BUILD_SITE.pin_field_completeness(no_location)["pin_meeting_complete"])
        self.assertFalse(BUILD_SITE.pin_field_completeness(no_details)["pin_meeting_complete"])

    def test_status_is_required(self) -> None:
        flags = BUILD_SITE.pin_field_completeness({**self.COMPLETE_ROW, "pinstatus": ""})
        self.assertFalse(flags["pin_status_complete"])
        self.assertFalse(flags["pin_details_complete"])

    def test_unmatched_pin_has_no_complete_fields(self) -> None:
        self.assertFalse(any(BUILD_SITE.pin_field_completeness(None).values()))


class PinSourceWorksheetTests(unittest.TestCase):
    def test_pin_lookup_rejects_empty_duplicate_or_incomplete_sources(self) -> None:
        with self.assertRaisesRegex(ValueError, "no data rows"):
            BUILD_SITE.build_pin_lookup([])
        with self.assertRaisesRegex(ValueError, "missing required fields"):
            BUILD_SITE.build_pin_lookup([{"unitid": 1}])

        complete = {field: "value" for field in BUILD_SITE.PIN_SOURCE_FIELDS}
        complete["unitid"] = 1
        with self.assertRaisesRegex(ValueError, "duplicate unitid"):
            BUILD_SITE.build_pin_lookup([complete, dict(complete)])

    def test_pin_lookup_keeps_one_valid_row_per_unit_id(self) -> None:
        row = {field: "value" for field in BUILD_SITE.PIN_SOURCE_FIELDS}
        row["unitid"] = 371266
        self.assertEqual(BUILD_SITE.build_pin_lookup([row]), {"371266": row})


class PublishedPinBundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.latest = {
            "generated_date": "2026-09-10",
            "dashboard": {
                "council": {"units": 2, "pin_pct": 0.5},
                "districts": [{"district": "Armadillo", "units": 2, "pin_pct": 0.5}],
                "unit_pin_statuses": [{
                    "district": "Armadillo",
                    "unit": "Pack 14 F",
                    "unit_type": "Pack",
                    "pin_status": "Active",
                    "pin_last_updated": "2026-09-09",
                    "pin_status_complete": True,
                    "pin_contact_complete": True,
                    "pin_meeting_complete": False,
                    "pin_details_complete": False,
                }],
            },
        }
        self.unit_level = {
            "data_date": "2026-09-10",
            "units": [{
                "district": "Armadillo 02",
                "unit_type": "Pack",
                "number": 14,
                "gender": "F",
                "name": "Pack 14 F",
            }, {
                "district": "Armadillo 02",
                "unit_type": "Troop",
                "number": 3,
                "gender": "B",
                "name": "Troop 3 B",
            }],
        }

    def test_valid_bundle_allows_explicitly_unmatched_units(self) -> None:
        self.assertEqual(validate_unit_pin_snapshot(self.latest, self.unit_level), [])

    def test_mixed_date_or_empty_pin_bundle_fails(self) -> None:
        self.unit_level["data_date"] = "2026-09-09"
        self.latest["dashboard"]["unit_pin_statuses"] = []
        errors = validate_unit_pin_snapshot(self.latest, self.unit_level)
        self.assertTrue(any("same report date" in error for error in errors))
        self.assertTrue(any("cannot be empty" in error for error in errors))

    def test_duplicate_unknown_or_private_pin_rows_fail(self) -> None:
        row = dict(self.latest["dashboard"]["unit_pin_statuses"][0])
        self.latest["dashboard"]["unit_pin_statuses"] = [row, dict(row)]
        errors = validate_unit_pin_snapshot(self.latest, self.unit_level)
        self.assertTrue(any("duplicates unit identity" in error for error in errors))

        private_row = dict(row, contact_name="Private Person")
        self.latest["dashboard"]["unit_pin_statuses"] = [private_row]
        errors = validate_unit_pin_snapshot(self.latest, self.unit_level)
        self.assertTrue(any("privacy-safe" in error for error in errors))

    def test_membership_summary_rate_cannot_replace_pin_currency(self) -> None:
        self.latest["dashboard"]["council"]["pin_pct"] = 1.0
        self.latest["dashboard"]["districts"][0]["pin_pct"] = 1.0
        errors = validate_unit_pin_snapshot(self.latest, self.unit_level)
        self.assertEqual(
            sum("current PIN rows divided by all tracked units" in error for error in errors),
            2,
        )

    def test_last_updated_must_be_a_valid_iso_calendar_date(self) -> None:
        row = self.latest["dashboard"]["unit_pin_statuses"][0]
        row["pin_last_updated"] = "09/09/2026"
        errors = validate_unit_pin_snapshot(self.latest, self.unit_level)
        self.assertTrue(any("pin_last_updated must be an ISO calendar date" in error for error in errors))

        row["pin_last_updated"] = None
        errors = validate_unit_pin_snapshot(self.latest, self.unit_level)
        self.assertTrue(any("may be null only when pin_status is Stale" in error for error in errors))

        row["pin_status"] = "Stale"
        self.latest["dashboard"]["council"]["pin_pct"] = 0.0
        self.latest["dashboard"]["districts"][0]["pin_pct"] = 0.0
        self.assertEqual(validate_unit_pin_snapshot(self.latest, self.unit_level), [])

    def test_last_updated_must_reconcile_to_stale_status(self) -> None:
        row = self.latest["dashboard"]["unit_pin_statuses"][0]
        row["pin_last_updated"] = "2025-09-09"
        errors = validate_unit_pin_snapshot(self.latest, self.unit_level)
        self.assertTrue(any("must reconcile to pin_last_updated freshness" in error for error in errors))

        row["pin_status"] = "Stale"
        self.latest["dashboard"]["council"]["pin_pct"] = 0.0
        self.latest["dashboard"]["districts"][0]["pin_pct"] = 0.0
        self.assertEqual(validate_unit_pin_snapshot(self.latest, self.unit_level), [])


if __name__ == "__main__":
    unittest.main()
