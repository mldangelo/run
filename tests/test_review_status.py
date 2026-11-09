import contextlib
import io
import json
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

from scripts.review_status import SAN_FRANCISCO, coverage_gaps, due_clubs, event_queue, main, markdown, races_due

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
    def test_upcoming_run_queue_includes_unconfirmed_and_checks_due_before_run_or_reminder(self):
        def event(id, start, checked, status='published'):
            return {'id': id, 'club_id': 'a', 'starts_at_local': f'{start}T18:00',
                    'checked_on': checked, 'status': status}
        rows = event_queue([
            event('old', '2026-11-12', '2026-10-27'),
            event('aging-before-run', '2026-11-15', '2026-11-01'),
            event('after-run', '2026-11-11', '2026-11-01'),
            event('unconfirmed', '2026-11-13', '2026-11-10', 'unconfirmed'),
            dict(event('flagged', '2026-11-14', '2026-11-10'), needs_review=True),
            dict(event('false-flag', '2026-11-14', '2026-11-10'), needs_review=False),
            dict(event('flagged-and-unconfirmed', '2026-11-14', '2026-11-10', 'unconfirmed'), needs_review=True),
            event('missing-check', '2026-11-24', None),
            event('outside-window', '2026-11-25', None),
            event('cancelled', '2026-11-11', None, 'cancelled'),
        ], date(2026, 11, 10))
        self.assertEqual([(row['event']['id'], row['reasons']) for row in rows], [
            ('old', ['check is 14+ days old']), ('unconfirmed', ['unconfirmed']),
            ('flagged', ['flagged for review']), ('flagged-and-unconfirmed', ['flagged for review', 'unconfirmed']),
            ('aging-before-run', ['check reaches 14 days on 2026-11-15']),
            ('missing-check', ['no check date']),
        ])

    def test_coverage_gaps_are_not_filled_by_unconfirmed_or_past_events(self):
        events = [
            {'club_id': 'a', 'status': 'published', 'starts_at_local': '2026-11-24T08:00'},
            {'club_id': 'b', 'status': 'unconfirmed', 'starts_at_local': '2026-11-12T08:00'},
            {'club_id': 'c', 'status': 'published', 'starts_at_local': '2026-11-09T08:00'},
        ]
        sources = [
            {'id': 'directory', 'authority': 'secondary', 'roles': ['schedule'], 'access': 'public', 'url': 'https://example.com'},
            {'id': 'club', 'authority': 'club', 'roles': ['event'], 'access': 'login_for_events', 'url': 'https://example.org'},
        ]
        rows = coverage_gaps(CLUBS, events, [{'club_id': 'b', 'reference_source_ids': ['directory', 'club']}],
                             sources, date(2026, 11, 10))
        self.assertEqual([row['club']['id'] for row in rows], ['b', 'c'])
        self.assertEqual([source['id'] for source in rows[0]['sources']], ['club', 'directory'])

    def test_coverage_gap_uses_most_recent_research_next_step(self):
        audits = [{'club_id': 'a', 'reference_source_ids': [], 'research_log': [
            {'checked_on': '2026-11-09', 'next_steps': 'Check Instagram'},
            {'checked_on': '2026-10-01', 'next_steps': 'Older advice'},
            {'checked_on': '2026-11-09', 'next_steps': 'Check current event'},
        ]}]
        rows = coverage_gaps(CLUBS[:1], [], audits, [], date(2026, 11, 10))
        self.assertEqual(rows[0]['next_steps'], 'Check current event')
        report = markdown(date(2026, 11, 10), date(2026, 11, 10), [], [], [], rows, CLUBS, [])
        self.assertIn('Check current event', report)

    def test_flagged_event_report_links_conflicting_sources(self):
        event = {'id': 'e', 'club_id': 'a', 'title': 'Run', 'starts_at_local': '2026-11-11T08:00',
                 'checked_on': '2026-11-10', 'status': 'published', 'needs_review': True,
                 'source_id': 'one', 'additional_source_ids': ['two', 'one']}
        sources = [{'id': 'one', 'url': 'https://example.org/one', 'authority': 'club', 'access': 'public'},
                   {'id': 'two', 'url': 'https://example.org/two', 'authority': 'secondary', 'access': 'restricted'}]
        today = date(2026, 11, 10)
        report = markdown(today, today, [], [], event_queue([event], today), [], CLUBS, sources)
        self.assertIn('flagged for review', report)
        self.assertIn('[source](https://example.org/one) (club; public)', report)
        self.assertIn('[source](https://example.org/two) (secondary; restricted)', report)
        self.assertEqual(report.count('https://example.org/one'), 1)

    def test_audits_and_active_patterns_make_a_club_due(self):
        rows = due_clubs(CLUBS, AUDITS, SCHEDULES, date(2026, 11, 10), date(2026, 11, 20))
        self.assertEqual([(row['id'], row['audit_due'], row['patterns_due']) for row in rows],
                         [('a', True, 0), ('b', False, 1)])
        self.assertEqual(rows[0]['due'], date(2026, 11, 15))

    def test_nothing_due_before_the_horizon(self):
        self.assertEqual(due_clubs(CLUBS, AUDITS, SCHEDULES, date(2026, 11, 10), date(2026, 11, 14)), [])

    def test_expired_patterns_do_not_create_reminders_but_current_ones_do(self):
        patterns = [
            {'club_id': 'a', 'review_due': '2026-11-01', 'valid_until': '2026-11-09'},
            {'club_id': 'b', 'review_due': '2026-11-15', 'valid_until': '2026-11-10'},
            {'club_id': 'b', 'review_due': '2026-11-16', 'valid_until': '2026-11-12'},
            {'club_id': 'b', 'review_due': '2026-11-17', 'valid_until': None},
            {'club_id': 'c', 'review_due': '2026-11-01', 'valid_until': '2026-11-09'},
        ]
        audits = [{'club_id': 'c', 'checked_on': '2026-10-01', 'review_due': '2026-11-08'}]
        rows = due_clubs(CLUBS, audits, patterns, date(2026, 11, 10), date(2026, 11, 17))
        self.assertEqual([(row['id'], row['audit_due'], row['patterns_due']) for row in rows],
                         [('c', True, 0), ('b', False, 3)])

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
            race(id='recent', needs_review=False, date='2026-11-10', checked_on='2026-10-12'),
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

    def test_age_reminder_looks_ahead_only_through_start_or_next_week(self):
        today = date(2026, 12, 7)
        races = [
            race(id='missed-without-lookahead', date='2026-12-12', checked_on='2026-11-08', needs_review=False),
            race(id='before-stale', date='2026-12-07', checked_on='2026-11-08', needs_review=False),
            race(id='on-stale', date='2026-12-08', checked_on='2026-11-08', needs_review=False),
            race(id='next-reminder', date='2026-12-20', checked_on='2026-11-14', needs_review=False),
            race(id='after-next-reminder', date='2026-12-20', checked_on='2026-11-15', needs_review=False),
            race(id='in-progress', date='2026-12-06', end_date='2026-12-09',
                 checked_on='2026-11-08', needs_review=False),
            race(id='window-limit', date='2027-01-06', checked_on='2026-11-08', needs_review=False),
            race(id='outside-window', date='2027-01-07', checked_on='2026-11-08', needs_review=False),
        ]
        self.assertEqual([(row['race']['id'], row['reasons']) for row in races_due(races, today)], [
            ('on-stale', ['check reaches 30 days on 2026-12-08']),
            ('missed-without-lookahead', ['check reaches 30 days on 2026-12-08']),
            ('next-reminder', ['check reaches 30 days on 2026-12-14']),
            ('window-limit', ['check reaches 30 days on 2026-12-08']),
        ])

    def test_main_prints_markdown_or_a_count(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            for name, rows in [('clubs', CLUBS), ('audits', AUDITS), ('schedules', SCHEDULES), ('races', [race()]),
                               ('events', []), ('sources', [])]:
                (root / 'data' / f'{name}.json').write_text(json.dumps(rows))
            for argv, expected in [(['--as-of', '2026-11-16', '--count'], '5\n'),
                                   (['--as-of', '2026-10-01', '--count'], '3\n')]:
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    main(argv, root)
                self.assertEqual(out.getvalue(), expected, argv)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                main(['--as-of', '2026-11-16'], root)
            report = out.getvalue()
            self.assertIn('**1 clubs** need a review (1 overdue)', report)
            self.assertIn('| Alpha (`a`) | 2026-11-15 (overdue) | yes | 0 | 2026-11-01 | none recorded |', report)
            self.assertIn('Race (`r`)', report)
            self.assertIn('| Race (`r`) | 2026-11-20 | 2026-11-08 | flagged | not recorded |', report)
            self.assertIn('**3 clubs** have no published dated run', report)
            self.assertIn('does not contact sources or detect changes', report)

    def test_stale_and_flagged_race_is_counted_once(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            for name, rows in [('clubs', []), ('audits', []), ('schedules', []),
                               ('races', [race(checked_on='2026-10-01')]), ('events', []), ('sources', [])]:
                (root / 'data' / f'{name}.json').write_text(json.dumps(rows))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                main(['--as-of', '2026-11-10', '--count'], root)
            self.assertEqual(out.getvalue(), '1\n')

    def test_default_date_uses_san_francisco_time(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            for name in ('clubs', 'audits', 'schedules', 'races', 'events', 'sources'):
                (root / 'data' / f'{name}.json').write_text('[]')
            out = io.StringIO()
            with patch('scripts.review_status.datetime') as clock, contextlib.redirect_stdout(out):
                clock.now.return_value = datetime(2026, 11, 9, 23, 59, tzinfo=SAN_FRANCISCO)
                main([], root)
            clock.now.assert_called_once_with(SAN_FRANCISCO)
            self.assertIn('as of 2026-11-09 (San Francisco)', out.getvalue())


if __name__ == '__main__':
    unittest.main()
