import contextlib
import io
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.review_status import due_clubs, flagged_races, main

CLUBS = [{'id': 'a', 'name': 'Alpha'}, {'id': 'b', 'name': 'Bravo'}, {'id': 'c', 'name': 'Charlie'}]
AUDITS = [
    {'club_id': 'a', 'checked_on': '2026-11-01', 'review_due': '2026-11-15'},
    {'club_id': 'b', 'checked_on': '2026-11-08', 'review_due': '2026-12-31'},
    {'club_id': 'c', 'checked_on': '2026-11-08', 'review_due': '2026-12-31'},
]
SCHEDULES = [
    {'id': 's1', 'club_id': 'b', 'review_due': '2026-11-20'},
    {'id': 's2', 'club_id': 'c', 'review_due': '2026-11-01', 'status': 'superseded'},
]


def race(**overrides):
    row = {'id': 'r', 'title': 'Race', 'date': '2026-11-20', 'end_date': None, 'status': 'scheduled',
           'needs_review': True, 'checked_on': '2026-11-08'}
    row.update(overrides)
    return row


class ReviewStatusTest(unittest.TestCase):
    def test_audits_and_active_patterns_make_a_club_due(self):
        rows = due_clubs(CLUBS, AUDITS, SCHEDULES, date(2026, 11, 20))
        self.assertEqual([(row['id'], row['audit_due'], row['patterns_due']) for row in rows],
                         [('a', True, 0), ('b', False, 1)])
        self.assertEqual(rows[0]['due'], date(2026, 11, 15))

    def test_nothing_due_before_the_horizon(self):
        self.assertEqual(due_clubs(CLUBS, AUDITS, SCHEDULES, date(2026, 11, 14)), [])

    def test_flagged_races_are_upcoming_scheduled_and_within_the_window(self):
        today = date(2026, 11, 10)
        races = [
            race(id='soon'),
            race(id='past', date='2026-11-01'),
            race(id='weekend-in-progress', date='2026-11-09', end_date='2026-11-11'),
            race(id='far', date='2027-02-01'),
            race(id='fine', needs_review=False),
            race(id='cancelled', status='cancelled'),
        ]
        self.assertEqual([item['id'] for item in flagged_races(races, today)], ['weekend-in-progress', 'soon'])

    def test_main_prints_markdown_or_a_count(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            for name, rows in [('clubs', CLUBS), ('audits', AUDITS), ('schedules', SCHEDULES), ('races', [race()])]:
                (root / 'data' / f'{name}.json').write_text(json.dumps(rows))
            for argv, expected in [(['--as-of', '2026-11-16', '--count'], '2\n'),
                                   (['--as-of', '2026-10-01', '--count'], '0\n')]:
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    main(argv, root)
                self.assertEqual(out.getvalue(), expected, argv)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                main(['--as-of', '2026-11-16'], root)
            report = out.getvalue()
            self.assertIn('**1 clubs** need a review (1 overdue)', report)
            self.assertIn('| Alpha (`a`) | 2026-11-15 (overdue) | yes | 0 | 2026-11-01 |', report)
            self.assertIn('Race (`r`)', report)


if __name__ == '__main__':
    unittest.main()
