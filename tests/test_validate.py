import contextlib
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path

from scripts.validate import DATASETS, main, validate


def fixture():
    """A minimal valid snapshot: one record of each kind."""
    return {
        'clubs': [{
            'id': 'club-a', 'name': 'Club A', 'user_supplied_name': '', 'geography': 'San Francisco',
            'description': 'Test club.', 'source_url': 'https://example.org/club', 'source_type': 'club',
            'research_status': 'identified', 'checked_on': '2026-11-08',
        }],
        'sources': [{
            'id': 'src-a', 'url': 'https://example.org/events', 'authority': 'club', 'roles': ['event'],
            'access': 'public', 'last_checked': '2026-11-08', 'note': '',
        }],
        'audits': [{
            'club_id': 'club-a', 'checked_on': '2026-11-08', 'review_due': '2026-11-22',
            'result': 'dated_event_found', 'reference_source_ids': ['src-a'], 'notes': 'Checked.',
        }],
        'schedules': [{
            'id': 'sch-a', 'club_id': 'club-a', 'label': 'Tuesday run', 'days': ['tuesday'],
            'frequency': 'weekly', 'local_time': '18:30', 'timezone': 'America/Los_Angeles',
            'location': 'Ferry Building', 'source_id': 'src-a', 'evidence': 'organizer_pattern',
            'checked_on': '2026-11-08', 'review_due': '2026-11-22', 'valid_from': None,
            'valid_until': None, 'notes': '',
        }],
        'events': [{
            'id': 'evt-a', 'club_id': 'club-a', 'title': 'Morning run', 'starts_at_local': '2026-11-09T06:30',
            'timezone': 'America/Los_Angeles', 'location': 'Ferry Building', 'source_id': 'src-a',
            'source_type': 'club', 'checked_on': '2026-11-08', 'status': 'published', 'notes': '',
        }],
        'races': [{
            'id': 'race-a', 'title': 'Test 10K', 'date': '2026-11-14', 'end_date': None,
            'city': 'San Francisco', 'area': 'sf', 'location': 'Golden Gate Park',
            'distances': [{'name': '10K', 'category': '10k', 'start_time': '08:00', 'location': None}],
            'source_url': 'https://example.org/race', 'additional_sources': [],
            'checked_on': '2026-11-08', 'notes': '', 'status': 'scheduled', 'needs_review': False,
        }],
    }


class ValidateTest(unittest.TestCase):
    def assertErrorAbout(self, data, *fragments):
        """Assert validate() reports one error containing every fragment."""
        errors = validate(data)
        matches = [error for error in errors if all(fragment in error for fragment in fragments)]
        self.assertTrue(matches, f'no error mentions {fragments!r}; got {errors!r}')

    def test_valid_fixture_has_no_errors(self):
        self.assertEqual(validate(fixture()), [])

    def test_unknown_event_source_id(self):
        data = fixture()
        data['events'][0]['source_id'] = 'src-x'
        self.assertEqual(validate(data), ["events.json evt-a: unknown source_id 'src-x'"])

    def test_starts_at_local_with_seconds(self):
        data = fixture()
        data['events'][0]['starts_at_local'] = '2026-11-09T06:30:00'
        self.assertErrorAbout(data, 'events.json evt-a', 'starts_at_local', '2026-11-09T06:30:00')

    def test_starts_at_local_date_only(self):
        data = fixture()
        data['events'][0]['starts_at_local'] = '2026-11-09'
        self.assertErrorAbout(data, 'events.json evt-a', 'starts_at_local')

    def test_starts_at_local_rejects_spaces_offsets_and_impossible_times(self):
        for value in ('2026-11-09 06:30', '2026-11-09T06:30-08:00', '2026-11-09T06:30Z', '2026-11-31T06:30',
                      '2026-11-09T24:00', '2026-11-09T06:30\n'):
            with self.subTest(value=value):
                data = fixture()
                data['events'][0]['starts_at_local'] = value
                self.assertErrorAbout(data, 'events.json evt-a', 'starts_at_local')

    def test_ends_at_local_must_be_strict_and_after_start(self):
        data = fixture()
        data['events'][0]['ends_at_local'] = '2026-11-09T07:30:00'
        self.assertErrorAbout(data, 'events.json evt-a', 'ends_at_local')
        data['events'][0]['ends_at_local'] = '2026-11-09T06:30'
        self.assertErrorAbout(data, 'events.json evt-a', 'ends_at_local', 'must be after')

    def test_club_without_audit(self):
        data = fixture()
        data['audits'] = []
        self.assertErrorAbout(data, 'clubs.json club-a', 'no audit')

    def test_audit_for_unknown_club(self):
        data = fixture()
        data['audits'][0]['club_id'] = 'club-x'
        self.assertErrorAbout(data, 'audits.json club-x', "unknown club_id 'club-x'")

    def test_non_https_source_url(self):
        data = fixture()
        data['sources'][0]['url'] = 'http://example.org/events'
        self.assertErrorAbout(data, 'sources.json src-a', 'https')

    def test_race_end_date_before_date(self):
        data = fixture()
        data['races'][0]['end_date'] = '2026-11-13'
        self.assertErrorAbout(data, 'races.json race-a', 'end_date', 'precedes')

    def test_race_duplicate_source_urls(self):
        data = fixture()
        data['races'][0]['additional_sources'] = ['https://example.org/race']
        self.assertErrorAbout(data, 'races.json race-a', 'more than once')

    def test_race_distance_name_must_not_be_empty(self):
        data = fixture()
        data['races'][0]['distances'][0]['name'] = ' '
        self.assertErrorAbout(data, 'races.json race-a', 'distances[0].name')

    def test_review_due_before_checked_on(self):
        for name in ('audits', 'schedules'):
            with self.subTest(dataset=name):
                data = fixture()
                data[name][0]['review_due'] = '2026-11-01'
                record_id = 'club-a' if name == 'audits' else 'sch-a'
                self.assertErrorAbout(data, f'{name}.json {record_id}', 'review_due')

    def test_vocabularies(self):
        cases = [
            ('clubs', 'research_status', 'active', 'club-a'),
            ('events', 'source_type', 'organizer', 'evt-a'),
            ('events', 'status', 'confirmed', 'evt-a'),
            ('schedules', 'evidence', 'guess', 'sch-a'),
            ('races', 'area', 'la', 'race-a'),
        ]
        for name, key, value, record_id in cases:
            with self.subTest(field=f'{name}.{key}'):
                data = fixture()
                data[name][0][key] = value
                self.assertErrorAbout(data, f'{name}.json {record_id}', key, repr(value))

    def test_dates_must_be_strict(self):
        for value in ('20261108', '2026-W45-1', '2026-02-30', '2026-11-8'):
            with self.subTest(value=value):
                data = fixture()
                data['events'][0]['checked_on'] = value
                self.assertErrorAbout(data, 'events.json evt-a', 'checked_on')

    def test_local_times_must_be_zero_padded(self):
        data = fixture()
        data['schedules'][0]['local_time'] = '6:30'
        self.assertErrorAbout(data, 'schedules.json sch-a', 'local_time')

    def test_unknown_time_zone(self):
        data = fixture()
        data['schedules'][0]['timezone'] = 'America/San_Francisco'
        self.assertErrorAbout(data, 'schedules.json sch-a', 'timezone')

    def test_missing_key_is_reported_without_traceback(self):
        data = fixture()
        del data['events'][0]['source_id']
        self.assertErrorAbout(data, 'events.json evt-a', "missing required field 'source_id'")

    def test_malformed_records_are_reported_without_traceback(self):
        data = fixture()
        data['events'].append('not an object')
        data['schedules'][0]['days'] = 'tuesday'
        data['races'][0]['distances'] = [None]
        data['sources'][0]['roles'] = None
        data['clubs'][0]['name'] = 7
        data['audits'][0]['reference_source_ids'] = [['src-a']]
        errors = validate(data)
        for fragment in ('events.json [1]', 'schedules.json sch-a: days', 'races.json race-a: distances[0]',
                         'sources.json src-a: roles', 'clubs.json club-a: name', 'audits.json club-a'):
            self.assertTrue(any(fragment in error for error in errors), f'{fragment!r} not in {errors!r}')

    def test_missing_and_wrongly_typed_datasets(self):
        errors = validate({'clubs': {}})
        self.assertIn('clubs.json: expected an array of records, got object', errors)
        self.assertIn('races.json: dataset is missing', errors)

    def test_duplicate_ids(self):
        data = fixture()
        data['events'].append(copy.deepcopy(data['events'][0]))
        self.assertErrorAbout(data, 'events.json evt-a', 'duplicate id')

    def test_errors_are_grouped_by_file(self):
        data = fixture()
        data['races'][0]['area'] = 'la'
        data['clubs'][0]['research_status'] = 'active'
        data['events'][0]['source_id'] = 'src-x'
        self.assertEqual([error.split(' ', 1)[0] for error in validate(data)],
                         ['clubs.json', 'events.json', 'races.json'])


class MainTest(unittest.TestCase):
    def run_main(self, data):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'data').mkdir()
            for name in DATASETS:
                (root / 'data' / f'{name}.json').write_text(json.dumps(data[name]), encoding='utf-8')
            stdout, stderr = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = main(root)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_valid_data_prints_summary(self):
        code, out, err = self.run_main(fixture())
        self.assertEqual(code, 0)
        self.assertEqual(err, '')
        self.assertEqual(out, 'Valid: 1 clubs, 1 sources, 1 audits, 1 patterns, 1 dated events.\n'
                              'Valid: 1 race editions.\n')

    def test_invalid_data_prints_every_error_and_fails(self):
        data = fixture()
        data['events'][0]['source_id'] = 'src-x'
        data['races'][0]['end_date'] = '2026-11-13'
        code, out, err = self.run_main(data)
        self.assertEqual(code, 1)
        self.assertEqual(out, '')
        self.assertIn("events.json evt-a: unknown source_id 'src-x'", err)
        self.assertIn('races.json race-a: end_date', err)


if __name__ == '__main__':
    unittest.main()
