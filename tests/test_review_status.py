import contextlib
import io
import json
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

from scripts.review_status import SAN_FRANCISCO, due_clubs, main, races_due

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

    def test_races_due_apply_window_age_and_status_without_duplicates(self):
        today = date(2026, 11, 10)
        races = [
            race(id='soon', checked_on='2026-10-11'),
            race(id='past', date='2026-11-01'),
            race(id='weekend-in-progress', date='2026-11-09', end_date='2026-11-11'),
            race(id='final-day', date='2026-11-08', end_date='2026-11-10'),
            race(id='finished-weekend', date='2026-11-07', end_date='2026-11-09'),
            race(id='far', date='2027-02-01'),
            race(id='fine', needs_review=False),
            race(id='cancelled', status='cancelled'),
            race(id='postponed', status='postponed'),
            race(id='old', needs_review=False, checked_on='2026-10-11'),
            race(id='recent', needs_review=False, checked_on='2026-10-12'),
            race(id='last-day', needs_review=False, date='2026-12-10', checked_on='2026-10-10'),
            race(id='too-far', needs_review=False, date='2026-12-11', checked_on='2026-10-10'),
        ]
        rows = races_due(races, today)
        self.assertEqual([(row['race']['id'], row['reasons']) for row in rows], [
            ('final-day', ['flagged']),
            ('weekend-in-progress', ['flagged']),
            ('soon', ['flagged', 'check is 30+ days old']),
            ('old', ['check is 30+ days old']),
            ('last-day', ['check is 30+ days old']),
        ])

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
            self.assertIn('| Race (`r`) | 2026-11-20 | 2026-11-08 | flagged |', report)

    def test_stale_and_flagged_race_is_counted_once(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            for name, rows in [('clubs', []), ('audits', []), ('schedules', []),
                               ('races', [race(checked_on='2026-10-01')])]:
                (root / 'data' / f'{name}.json').write_text(json.dumps(rows))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                main(['--as-of', '2026-11-10', '--count'], root)
            self.assertEqual(out.getvalue(), '1\n')

    def test_default_date_uses_san_francisco_time(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            for name in ('clubs', 'audits', 'schedules', 'races'):
                (root / 'data' / f'{name}.json').write_text('[]')
            out = io.StringIO()
            with patch('scripts.review_status.datetime') as clock, contextlib.redirect_stdout(out):
                clock.now.return_value = datetime(2026, 11, 9, 23, 59, tzinfo=SAN_FRANCISCO)
                main([], root)
            clock.now.assert_called_once_with(SAN_FRANCISCO)
            self.assertIn('as of 2026-11-09 (San Francisco)', out.getvalue())


if __name__ == '__main__':
    unittest.main()
