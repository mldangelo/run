#!/usr/bin/env python3
"""Generate a readable view from the canonical JSON snapshot."""
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1] / 'data'
SAN_FRANCISCO = ZoneInfo('America/Los_Angeles')
WEEKDAYS = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
DATED_SECTIONS = [('published', 'Published dated listings'), ('unconfirmed', 'Unconfirmed dated leads')]

INTRO = (
    'Source data was checked on dates shown in the linked records. This is not a live calendar; '
    'check the organizer for cancellations and changes. Some event links require an account.'
)
CANONICAL_DATA = (
    'Canonical structured data: [events](../data/events.json), [recurring patterns](../data/schedules.json), '
    '[sources](../data/sources.json), and [club audits](../data/audits.json). A location labeled unknown or TBD '
    'has not been established. Bay Area events outside SF are labeled.\n'
)
UNCONFIRMED_NOTE = (
    'These leads need verification: some are unconfirmed third-party listings and others have '
    'conflicting details.\n'
)
PATTERNS_NOTE = (
    'Patterns are not confirmations for individual dates. Locations and times may change; check the source. '
    'Patterns marked needs review are retained for comparison and are not projected by the report tool.\n'
)


def load(name):
    return json.loads((ROOT / f'{name}.json').read_text())


def text(value):
    """Make a value safe for a Markdown table cell."""
    return str(value or 'Unknown').replace('|', r'\|').replace('\n', ' ')


def local_start(event):
    return datetime.fromisoformat(event['starts_at_local']).replace(tzinfo=ZoneInfo(event['timezone']))


def link(source):
    return f"[Source]({source['url']})"


def event_details(event):
    options = '; '.join(
        f"{option['local_time']} {option['location']} ({option['details']})"
        for option in event.get('meeting_options', [])
    )
    details = event.get('notes', '')
    if options:
        details += ' Alternate starts: ' + options
    return details


def print_dated_section(status, title, events, clubs, sources, now, end):
    print(f'## {title}\n')
    if status == 'unconfirmed':
        print(UNCONFIRMED_NOTE)
    print('| Date and time | Club and event | Meeting place | Details | Source |')
    print('| --- | --- | --- | --- | --- |')
    found = [event for event in events if event['status'] == status and now <= local_start(event) <= end]
    for event in sorted(found, key=lambda item: (local_start(item), item['club_id'], item['id'])):
        details = event_details(event)
        print(f"| {local_start(event):%a %b %d, %-I:%M %p} "
              f"| {text(clubs[event['club_id']]['name'])}: {text(event['title'])} "
              f"| {text(event['location'])} "
              f"| {text(details) if details else 'See source'} "
              f"| {link(sources[event['source_id']])} ({event['source_type']}) |")
    if not found:
        print('| — | No listings recorded in this window | — | — | — |')
    print()


def pattern_sort_key(schedule):
    first_day = min(WEEKDAYS.index(day) for day in schedule['days'])
    return first_day, schedule['local_time'] or '99:99', schedule['club_id'], schedule['id']


def print_patterns(schedules, clubs, sources):
    print('## Recurring patterns\n')
    print(PATTERNS_NOTE)
    print('| Days | Time | Club and run | Meeting place | Frequency and notes | Evidence |')
    print('| --- | --- | --- | --- | --- | --- |')
    for schedule in sorted(schedules, key=pattern_sort_key):
        validity = ''
        if schedule.get('valid_from') or schedule.get('valid_until'):
            validity = f" Effective {schedule.get('valid_from') or '?'} to {schedule.get('valid_until') or '?'}."
        detail = f"{schedule['frequency']}.{validity} {schedule.get('notes', '')}"
        print(f"| {text(', '.join(schedule['days']))} "
              f"| {text(schedule.get('local_time'))} "
              f"| {text(clubs[schedule['club_id']]['name'])}: {text(schedule['label'])} "
              f"| {text(schedule['location'])} "
              f"| {text(detail)} "
              f"| {link(sources[schedule['source_id']])} ({schedule['evidence']}; {schedule.get('status', 'active')}) |")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--as-of', help='Snapshot reference time in SF, ISO local date/time; defaults to now')
    parser.add_argument('--days', type=int, default=14)
    args = parser.parse_args()
    if args.days < 0:
        parser.error('--days must be non-negative')
    now = datetime.fromisoformat(args.as_of) if args.as_of else datetime.now(SAN_FRANCISCO)
    if now.tzinfo is None:
        now = now.replace(tzinfo=SAN_FRANCISCO)
    end = now + timedelta(days=args.days)

    clubs = {club['id']: club for club in load('clubs')}
    sources = {source['id']: source for source in load('sources')}
    events, schedules = load('events'), load('schedules')

    print('# Running schedule — research snapshot')
    print(f'\nView generated for {now:%B %d, %Y %I:%M %p %Z} through {end:%B %d, %Y %I:%M %p %Z}. {INTRO}\n')
    print(CANONICAL_DATA)
    for status, title in DATED_SECTIONS:
        print_dated_section(status, title, events, clubs, sources, now, end)
    print_patterns(schedules, clubs, sources)


if __name__ == '__main__':
    main()
