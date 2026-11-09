import csv
import io
import json
import unittest
from pathlib import Path

from scripts.build_clubs_csv import FIELDS, build_csv

ROOT = Path(__file__).resolve().parents[1]


def club(**overrides):
    row = {field: '' for field in FIELDS}
    row.update(id='club-a', name='Club A', checked_on='2026-11-08')
    row.update(overrides)
    return row


class ClubsCsvTest(unittest.TestCase):
    def test_round_trips_commas_quotes_and_unicode(self):
        clubs = [
            club(description='Runs, then "coffee" — every week.'),
            club(id='club-b', name='Club B', source_url=None),
        ]
        raw = build_csv(clubs)
        self.assertEqual(raw, build_csv(clubs))
        rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8'))))
        self.assertEqual(rows[0]['description'], clubs[0]['description'])
        self.assertEqual(rows[1]['source_url'], '')
        self.assertEqual(list(rows[0]), list(FIELDS))

    def test_unknown_fields_are_not_dropped_silently(self):
        with self.assertRaises(ValueError):
            build_csv([club(new_field='x')])

    def test_committed_csv_matches_the_json(self):
        clubs = json.loads((ROOT / 'data' / 'clubs.json').read_text())
        self.assertEqual((ROOT / 'data' / 'clubs.csv').read_bytes(), build_csv(clubs))


if __name__ == '__main__':
    unittest.main()
