#!/usr/bin/env python3
"""Regression tests for the September 3 missing-TAY publication."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import refresh_monday_data as refresh
from tools.validate_monday_snapshot import validate_snapshot
from openpyxl import Workbook


def api_item(board, identity="1"):
    texts = {"district": "Armadillo", "tay": "1,200", "grades": "'KG-05", "commitment": "Committed"}
    return {
        "id": identity, "name": "Pack 123" if board == "popcorn" else "Example",
        "updated_at": "2026-09-03T12:00:00Z", "group": {"title": "Current"},
        "column_values": [
            {"id": column, "text": texts.get(field, ""), "value": None}
            for field, column in refresh.BOARDS[board]["columns"].items()
        ] + [{"id": "private_contact", "text": "PRIVATE VALUE"}],
    }


def api_snapshot():
    ids = {value["id"]: key for key, value in refresh.BOARDS.items()}
    with patch.object(refresh, "fetch_board_items", side_effect=lambda token, board, columns: [api_item(ids[board])]):
        return refresh.build_snapshot("test-token")


class MondayTayTests(unittest.TestCase):
    def test_fallback_has_full_public_detail_and_denominator(self):
        snapshot = api_snapshot()
        validate_snapshot(snapshot)
        compactors = {"schools": refresh.compact_school_rows, "prospects": refresh.compact_prospect_rows, "renewals": refresh.compact_renewal_rows}
        for board, compactor in compactors.items():
            row = snapshot["boards"][board]["rows"][0]
            self.assertEqual(set(row), set(compactor([{}])[0]))
        school = snapshot["boards"]["schools"]["rows"][0]
        self.assertEqual(school["tay"], "1,200")
        self.assertEqual(school["grades"], "'KG-05")
        self.assertNotIn("PRIVATE VALUE", json.dumps(snapshot))

    def test_missing_api_tay_column_rejected(self):
        item = api_item("schools")
        item["column_values"] = [v for v in item["column_values"] if v["id"] != refresh.BOARDS["schools"]["columns"]["tay"]]
        with self.assertRaisesRegex(RuntimeError, "missing required"):
            refresh.compact_detail_items([item], "schools")

    def test_school_relation_display_value(self):
        item = api_item("schools")
        relation = next(v for v in item["column_values"] if v["id"] == refresh.BOARDS["schools"]["columns"]["unit_associated"])
        relation["display_value"] = "Pack 123"
        self.assertEqual(refresh.compact_detail_items([item], "schools")[0]["unit_associated"], "Pack 123")

    def test_pagination_keeps_all_schools(self):
        pages = [
            {"boards": [{"items_page": {"cursor": "next", "items": [api_item("schools", str(i)) for i in range(500)]}}]},
            {"boards": [{"items_page": {"cursor": None, "items": [api_item("schools", str(i)) for i in range(500, 738)]}}]},
        ]
        with patch.object(refresh, "monday_query", side_effect=pages) as query, patch.object(refresh.time, "sleep"):
            rows = refresh.fetch_board_items("test-token", refresh.BOARDS["schools"]["id"], list(refresh.BOARDS["schools"]["columns"].values()))
        self.assertEqual(len(rows), 738)
        self.assertEqual(query.call_args_list[1].args[2]["cursor"], "next")

    def test_summary_only_and_bad_denominators_fail_closed(self):
        original = api_snapshot()
        for bad in (None, "", "0", "NaN", "Infinity", "-10", "unavailable"):
            snapshot = copy.deepcopy(original)
            if bad is None:
                del snapshot["boards"]["schools"]["rows"]
            else:
                snapshot["boards"]["schools"]["rows"][0]["tay"] = bad
            with self.subTest(value=bad), self.assertRaises(ValueError):
                validate_snapshot(snapshot)
        snapshot = copy.deepcopy(original)
        snapshot["boards"]["schools"]["items"] = 2
        with self.assertRaisesRegex(ValueError, "item count"):
            validate_snapshot(snapshot)

    def test_failed_refresh_preserves_existing_output(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "monday.json"
            output.write_text("previous verified payload")
            bad = api_snapshot()
            del bad["boards"]["schools"]["rows"]
            with patch.object(sys, "argv", ["refresh", "--output", str(output)]), patch.object(refresh, "latest_workbook", return_value=None), patch.object(refresh, "read_token", return_value="test-token"), patch.object(refresh, "build_snapshot", return_value=bad):
                with self.assertRaises(ValueError):
                    refresh.main()
            self.assertEqual(output.read_text(), "previous verified payload")

    def test_current_and_legacy_workbook_sheet_names(self):
        for popcorn_name in ("Popcorn Details", "Popcorn Committments", "Popcorn Commitments"):
            with self.subTest(sheet=popcorn_name), tempfile.TemporaryDirectory() as directory:
                workbook = Workbook()
                workbook.remove(workbook.active)
                for name, headers, values in (
                    ("New unit Hot Prospects", ["Item ID", "Item Name", "Step 11"], ["1", "Example", "Complete"]),
                    ("2026 Unit Renewal", ["Item ID", "Item Name"], ["2", "Pack 123"]),
                    ("CAC Schools", ["Item ID", "Item Name", "TAY", "Grades", "Scouting District"], ["3", "School", "1,200", "'KG-05", "Armadillo"]),
                    (popcorn_name, ["Item ID", "Item Name", "District", "2026 Commitment Status"], ["4", "Pack 123", "Armadillo", "Committed"]),
                ):
                    sheet = workbook.create_sheet(name)
                    for _ in range(3):
                        sheet.append(["metadata"])
                    sheet.append(headers)
                    sheet.append(values)
                path = Path(directory) / "source.xlsx"
                workbook.save(path)
                snapshot = refresh.build_snapshot_from_workbook(path)
                validate_snapshot(snapshot)
                self.assertEqual(snapshot["boards"]["schools"]["rows"][0]["tay"], "1,200")
                self.assertEqual(snapshot["boards"]["prospects"]["rows"][0]["posted"], "Complete")


if __name__ == "__main__":
    unittest.main()
