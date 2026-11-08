#!/usr/bin/env python3
"""Check the integrity of the research snapshot. No network access required."""
import json
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
data = {n: json.loads((ROOT / 'data' / f'{n}.json').read_text()) for n in ('clubs','sources','audits','schedules','events')}

def unique(rows, key):
    values = [r[key] for r in rows]
    assert len(values) == len(set(values)), f'duplicate {key}'
    return set(values)

clubs = unique(data['clubs'], 'id')
sources = unique(data['sources'], 'id')
unique(data['audits'], 'club_id')
unique(data['schedules'], 'id')
unique(data['events'], 'id')
assert {a['club_id'] for a in data['audits']} == clubs, 'every club needs one audit'
for s in data['sources']:
    assert urlparse(s['url']).scheme == 'https', s['url']
    assert s['roles'] and s['authority'] in {'club', 'host', 'secondary'}
    assert s['access'] in {'public', 'restricted', 'login_for_events', 'unknown'}
    if s['last_checked']: date.fromisoformat(s['last_checked'])
for a in data['audits']:
    assert set(a['reference_source_ids']) <= sources
    assert a['result'] in {'identity_unresolved','no_current_details','pattern_found','dated_event_found'}
    date.fromisoformat(a['checked_on']); date.fromisoformat(a['review_due'])
    assert a['notes']
for s in data['schedules']:
    assert s['club_id'] in clubs and s['source_id'] in sources
    assert s['days'] and set(s['days']) <= {'monday','tuesday','wednesday','thursday','friday','saturday','sunday'}
    assert s['evidence'] in {'organizer_pattern', 'secondary_pattern'}
    ZoneInfo(s['timezone'])
    if s['local_time']: datetime.strptime(s['local_time'], '%H:%M')
    for field in ('checked_on','review_due'):
        date.fromisoformat(s[field])
    for field in ('valid_from','valid_until'):
        if s[field]: date.fromisoformat(s[field])
    if s['valid_from'] and s['valid_until']: assert s['valid_from'] <= s['valid_until']
for e in data['events']:
    assert e['club_id'] in clubs and e['source_id'] in sources
    assert e['status'] in {'published','cancelled','postponed'}
    assert datetime.fromisoformat(e['starts_at_local']).tzinfo is None
    ZoneInfo(e['timezone']); date.fromisoformat(e['checked_on'])
    assert e['location'] and e['notes'] is not None
print(f"Valid: {len(clubs)} clubs, {len(sources)} sources, {len(data['audits'])} audits, {len(data['schedules'])} patterns, {len(data['events'])} dated events.")
