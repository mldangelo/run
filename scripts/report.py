#!/usr/bin/env python3
"""Print dated events or a per-club view of the local research snapshot."""
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from forecast import candidates

ROOT = Path(__file__).resolve().parents[1] / 'data'
SAN_FRANCISCO = ZoneInfo('America/Los_Angeles')


def load(name):
    return json.loads((ROOT / (name + '.json')).read_text())


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--club', help='Case-insensitive name or id substring')
    parser.add_argument('--days', type=int, default=14, help='Future event window, default 14')
    parser.add_argument('--include-patterns', action='store_true',
                        help='Also show unconfirmed candidates projected from supported recurring patterns')
    parser.add_argument('--include-unconfirmed', action='store_true',
                        help='Also show unconfirmed dated listings from third-party sources')
    parser.add_argument('--as-of', help='Reference time in local ISO format, default now in San Francisco')
    return parser


def report_window(as_of, days):
    """Return (now, end); a naive --as-of value is San Francisco time."""
    now = datetime.fromisoformat(as_of) if as_of else datetime.now(SAN_FRANCISCO)
    if now.tzinfo is None:
        now = now.replace(tzinfo=SAN_FRANCISCO)
    return now, now + timedelta(days=days)


def matches_club(club, query):
    searchable = club['name'] + ' ' + club['id'] + ' ' + club['user_supplied_name']
    return query.casefold() in searchable.casefold()


def local_start(event):
    return datetime.fromisoformat(event['starts_at_local']).replace(tzinfo=ZoneInfo(event['timezone']))


def events_in_window(events, club_ids, status, now, end):
    """Return (start, event) pairs with this status, sorted by start time."""
    found = []
    for event in events:
        if event['club_id'] not in club_ids or event['status'] != status:
            continue
        start = local_start(event)
        if now <= start <= end:
            found.append((start, event))
    return sorted(found, key=lambda pair: pair[0])


def print_club(club, audit, schedules, source_by_id):
    if audit is None:
        # validate.py requires an audit for every club; do not crash without one.
        print(f"\n{club['name']} — no audit recorded")
    else:
        print(f"\n{club['name']} — {audit['result']} (checked {audit['checked_on']}; review by {audit['review_due']})")
        print(audit['notes'])
        for entry in audit.get('research_log', []):
            print(f"  Research {entry['checked_on']}: {entry['summary']}")
            print(f"    Next: {entry['next_steps']}")
            for check in entry['source_checks']:
                source = source_by_id.get(check['source_id'])
                print(f"    {source['url'] if source else check['source_id']} [{check['method']}]: {check['notes']}")
    for schedule in schedules:
        if schedule['club_id'] != club['id']:
            continue
        print(f"  Pattern: {', '.join(schedule['days'])} {schedule['local_time'] or 'time unknown'}; "
              f"{schedule['frequency']}; {schedule['location']} "
              f"[{schedule['evidence']}; {schedule.get('status', 'active')}]")
        if schedule['valid_from'] or schedule['valid_until']:
            print(f"    Effective: {schedule['valid_from'] or '?'} to {schedule['valid_until'] or '?'}")
        print(f"    Source: {source_by_id[schedule['source_id']]['url']}")
    reference_ids = audit['reference_source_ids'] if audit else []
    for source_id in reference_ids:
        source = source_by_id[source_id]
        print(f"  Source: {source['url']} ({source['authority']}; {', '.join(source['roles'])}; {source['access']})")


def event_line(start, event, club_by_id):
    return f"  {start:%a %b %d %I:%M %p}: {club_by_id[event['club_id']]['name']} — {event['title']} — {event['location']}"


def print_published(published, club_by_id, source_by_id):
    for start, event in published:
        print(event_line(start, event, club_by_id))
        print(f"    {source_by_id[event['source_id']]['url']} ({event['source_type']}; checked {event['checked_on']})")
        if event.get('notes'):
            print(f"    Details: {event['notes']}")
        for option in event.get('meeting_options', []):
            print(f"    Alternate start: {option['local_time']} — {option['location']} — {option['details']}")
    if not published:
        print('  None recorded in this snapshot; that does not mean no runs are scheduled.')


def print_patterns(schedules, club_ids, now, end, club_by_id, source_by_id):
    print('\nUnconfirmed candidates projected from recurring patterns:')
    print('These are NOT individually scheduled events; verify holidays, changes, access and cancellations.')
    projected = []
    for schedule in schedules:
        if schedule['club_id'] not in club_ids:
            continue
        for instant in candidates(schedule, now, end):
            projected.append((instant, schedule))
    projected.sort(key=lambda pair: (pair[0], pair[1]['club_id'], pair[1]['label']))
    for instant, schedule in projected:
        print(f"  {instant:%a %b %d %I:%M %p}: {club_by_id[schedule['club_id']]['name']} — {schedule['label']} — "
              f"{schedule['location']} [{schedule['evidence']}; check {schedule['checked_on']}]")
        print(f"    {source_by_id[schedule['source_id']]['url']}")
        if schedule.get('notes'):
            print(f"    Details: {schedule['notes']}")
    if not projected:
        print('  No supported patterns projected for this window.')
    print('  Patterns with no time or an ambiguous frequency are omitted; use --club to inspect them.')


def print_unconfirmed(unconfirmed, club_by_id, source_by_id):
    print('\nUnconfirmed dated listings:')
    print('These require verification: some are unconfirmed third-party listings and others have conflicting details.')
    for start, event in unconfirmed:
        print(event_line(start, event, club_by_id))
        print(f"    {source_by_id[event['source_id']]['url']} ({event['source_type']})")
        if event.get('notes'):
            print(f"    Details: {event['notes']}")
    if not unconfirmed:
        print('  None recorded in this snapshot.')


def main():
    clubs, sources, audits, schedules, events = [
        load(name) for name in ('clubs', 'sources', 'audits', 'schedules', 'events')
    ]
    club_by_id = {club['id']: club for club in clubs}
    source_by_id = {source['id']: source for source in sources}
    audit_by_club = {}
    for audit in audits:
        audit_by_club.setdefault(audit['club_id'], audit)  # first audit wins, as before

    parser = build_parser()
    args = parser.parse_args()
    if args.days < 0:
        parser.error('--days must be non-negative')
    now, end = report_window(args.as_of, args.days)
    selected = [club for club in clubs if not args.club or matches_club(club, args.club)]
    if not selected:
        parser.error('No matching clubs')
    selected_ids = {club['id'] for club in selected}

    print('Snapshot, not a live calendar. Verify dates, location, and cancellations with the organizer.')
    if args.club:
        for club in selected:
            print_club(club, audit_by_club.get(club['id']), schedules, source_by_id)

    print(f'\nDated events between {now.isoformat(timespec="minutes")} and {end.isoformat(timespec="minutes")}:')
    print_published(events_in_window(events, selected_ids, 'published', now, end), club_by_id, source_by_id)
    if args.include_patterns:
        print_patterns(schedules, selected_ids, now, end, club_by_id, source_by_id)
    if args.include_unconfirmed:
        unconfirmed = events_in_window(events, selected_ids, 'unconfirmed', now, end)
        print_unconfirmed(unconfirmed, club_by_id, source_by_id)


if __name__ == '__main__':
    main()
