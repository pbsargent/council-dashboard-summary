#!/usr/bin/env python3

from __future__ import annotations

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sanitize_public_person_names import (
    find_violations,
    format_person_list,
    format_person_name,
    sanitize_tree,
)


class PersonNamePrivacyTests(unittest.TestCase):
    def test_formats_first_last_and_middle_names(self) -> None:
        self.assertEqual(format_person_name("Olga Mikheeva"), "Olga M.")
        self.assertEqual(format_person_name("Anne Daly Hagan"), "Anne H.")
        self.assertEqual(format_person_name("Bobby Williams Sr"), "Bobby W.")
        self.assertEqual(format_person_name("Stacy Lasater,"), "Stacy L.")

    def test_formats_last_comma_first_source_names(self) -> None:
        self.assertEqual(format_person_name("Agostinelli, Darryl Thomas"), "Darryl A.")

    def test_normalizes_existing_initial_and_lists(self) -> None:
        self.assertEqual(format_person_name("Audrey E"), "Audrey E.")
        self.assertEqual(
            format_person_list("Jim Behrens , Sadia Ali"),
            "Jim B., Sadia A.",
        )

    def test_preserves_operational_placeholders(self) -> None:
        self.assertEqual(format_person_name("Unassigned"), "Unassigned")
        self.assertEqual(format_person_name("Vacant"), "Vacant")

    def test_sanitizes_all_supported_public_paths(self) -> None:
        payload = {
            "dashboard": {
                "districts": [{"field_exec": "Amara Davis"}],
                "priority_units": [{"commissioners": ["Dale Clay"]}],
                "training_people": [
                    {
                        "name": "Agostinelli, Darryl Thomas",
                        "member_name": "Darryl Agostinelli",
                    }
                ],
                "syt_people": [{"name": "Mikesh, Billy J"}],
                "commissioners": [{"name": "Aronson, David Floyd"}],
            },
            "units": [
                {
                    "name": "Crew 3",
                    "commissioner": "Olga Mikheeva",
                    "renewal_records": {"members": [{"name": "Audrey E"}]},
                }
            ],
            "rows": [
                {
                    "name": "Troop 0003",
                    "owner": "Amara Davis",
                    "commissioner": "Olga Mikheeva, Susan Robinson Kruemcke",
                    "unitLeader": "Kimberly Lanicek",
                    "beAScoutContact": "Kimberly Lanicek",
                }
            ],
        }

        sanitize_tree(payload)

        self.assertEqual(payload["dashboard"]["districts"][0]["field_exec"], "Amara D.")
        self.assertEqual(payload["dashboard"]["priority_units"][0]["commissioners"], ["Dale C."])
        self.assertEqual(payload["dashboard"]["training_people"][0]["name"], "Darryl A.")
        self.assertEqual(payload["dashboard"]["syt_people"][0]["name"], "Billy M.")
        self.assertEqual(payload["dashboard"]["commissioners"][0]["name"], "David A.")
        self.assertEqual(payload["units"][0]["name"], "Crew 3")
        self.assertEqual(payload["units"][0]["renewal_records"]["members"][0]["name"], "Audrey E.")
        self.assertEqual(payload["rows"][0]["name"], "Troop 0003")
        self.assertEqual(payload["rows"][0]["commissioner"], "Olga M., Susan K.")
        self.assertEqual(find_violations(payload), [])


if __name__ == "__main__":
    unittest.main()
