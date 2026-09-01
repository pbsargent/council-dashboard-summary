#!/usr/bin/env python3
"""Regression tests for public BeAScout PIN display-state classification."""

from __future__ import annotations

import importlib.util
import unittest
from datetime import date, datetime
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
