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


if __name__ == "__main__":
    unittest.main()
