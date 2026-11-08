import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from forecast import candidates

TZ = ZoneInfo('America/Los_Angeles')
def dt(s): return datetime.fromisoformat(s).replace(tzinfo=TZ)
def pattern(**kw):
    return {'days': ['tuesday'], 'frequency':'weekly', 'local_time':'07:00', 'timezone':'America/Los_Angeles', 'valid_from':None, 'valid_until':None, **kw}

class ForecastTest(unittest.TestCase):
    def test_weekly_respects_window_and_season(self):
        p=pattern(valid_from='2026-11-21',valid_until='2026-12-01')
        self.assertEqual(candidates(p,dt('2026-11-08T12:00'),dt('2026-12-10T12:00')),[dt('2026-11-24T07:00'),dt('2026-12-01T07:00')])
    def test_monthly_ordinal_and_fifth_saturday(self):
        p=pattern(days=['saturday'],frequency='fifth Saturday')
        self.assertEqual(candidates(p,dt('2026-11-01T00:00'),dt('2027-02-01T00:00')),[dt('2027-01-30T07:00')])
    def test_first_and_third(self):
        p=pattern(days=['thursday'],frequency='first and third Thursday')
        self.assertEqual(candidates(p,dt('2026-11-01T00:00'),dt('2026-11-30T00:00')),[dt('2026-11-05T07:00'),dt('2026-11-19T07:00')])
    def test_ambiguous_frequency_and_unknown_time_are_not_projected(self):
        self.assertEqual(candidates(pattern(frequency='2–3 per month'),dt('2026-11-01T00:00'),dt('2026-11-30T00:00')),[])
        self.assertEqual(candidates(pattern(local_time=None),dt('2026-11-01T00:00'),dt('2026-11-30T00:00')),[])
    def test_superseded_pattern_is_not_projected(self):
        self.assertEqual(candidates(pattern(status='superseded'),dt('2026-11-01T00:00'),dt('2026-11-30T00:00')),[])
    def test_dst_is_local_time(self):
        p=pattern(days=['sunday'],local_time='10:00')
        result=candidates(p,dt('2026-10-25T00:00'),dt('2026-11-09T00:00'))
        self.assertEqual([x.strftime('%H:%M %z') for x in result],['10:00 -0700','10:00 -0800','10:00 -0800'])

if __name__ == '__main__': unittest.main()
