"""Expand explicit recurring patterns into *unconfirmed* candidates.

This is a planning aid, not a source of event confirmations. Patterns with
ambiguous frequencies are skipped; callers must show that caveat.
"""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

WEEKDAYS = ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
ORDINAL = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5}

def occurrence_allowed(day, pattern):
    """True only for frequencies that can be calculated without guessing."""
    if WEEKDAYS[day.weekday()] not in pattern['days']:
        return False
    if pattern.get('valid_from') and day < date.fromisoformat(pattern['valid_from']):
        return False
    if pattern.get('valid_until') and day > date.fromisoformat(pattern['valid_until']):
        return False
    frequency = pattern['frequency'].strip().lower()
    if frequency == 'weekly':
        return True
    if frequency in ('first and third thursday',):
        return (day.day - 1) // 7 + 1 in (1, 3)
    words = frequency.split()
    if len(words) == 2 and words[0] in ORDINAL and words[1] in WEEKDAYS:
        return words[1] == WEEKDAYS[day.weekday()] and (day.day - 1) // 7 + 1 == ORDINAL[words[0]]
    return False

def candidates(pattern, start, end):
    """Return bounded, timezone-aware datetimes for predictable patterns.

    Unknown times and unsupported frequencies return no results. The output
    does not represent individual published events or account for exceptions.
    """
    if pattern.get('status', 'active') != 'active' or not pattern.get('local_time'):
        return []
    local_zone = ZoneInfo(pattern['timezone'])
    start_local, end_local = start.astimezone(local_zone), end.astimezone(local_zone)
    local_time = time.fromisoformat(pattern['local_time'])
    cursor = start_local.date()
    found = []
    while cursor <= end_local.date():
        if occurrence_allowed(cursor, pattern):
            instant = datetime.combine(cursor, local_time, local_zone)
            if start <= instant <= end:
                found.append(instant)
        cursor += timedelta(days=1)
    return found
