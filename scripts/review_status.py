#!/usr/bin/env python3
"""Summarize research that is due for review, as Markdown or a count.

A club is due when its audit or any of its active recurring patterns has a
review_due date on or before the horizon (the as-of date plus --within days).
Upcoming events and races are queued for a source recheck, and clubs without
published events in the next two weeks are identified as coverage gaps.
Nothing here contacts a source; it only reads data/*.json.
"""
import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SAN_FRANCISCO = ZoneInfo('America/Los_Angeles')
RACE_WINDOW_DAYS = 30
RACE_CHECK_MAX_AGE_DAYS = 30
RACE_REVIEW_CADENCE_DAYS = 7
EVENT_WINDOW_DAYS = 14
EVENT_CHECK_MAX_AGE_DAYS = 14


def load(name, root=ROOT):
    return json.loads((root / 'data' / f'{name}.json').read_text())


def due_clubs(clubs, audits, schedules, today, horizon):
    """Return one row per club with anything due on or before ``horizon``.

    Each row has the club's id and name, its earliest due date, whether the
    audit is due, how many active patterns are due and the last audit check.
    Superseded patterns and patterns that expired before today are ignored;
    a pattern ending today or before the future horizon is still eligible.
    Rows are ordered by due date, then name.
    """
    audit_by_club = {audit['club_id']: audit for audit in audits}
    rows = []
    for club in clubs:
        audit = audit_by_club.get(club['id'])
        source_ids = list(audit.get('reference_source_ids', [])) if audit else []
        due_dates = []
        audit_due = bool(audit) and date.fromisoformat(audit['review_due']) <= horizon
        if audit_due:
            due_dates.append(date.fromisoformat(audit['review_due']))
        patterns_due = 0
        for pattern in schedules:
            if pattern['club_id'] != club['id'] or pattern.get('status', 'active') == 'superseded':
                continue
            if pattern.get('valid_until') and date.fromisoformat(pattern['valid_until']) < today:
                continue
            pattern_due = date.fromisoformat(pattern['review_due'])
            if pattern_due <= horizon:
                patterns_due += 1
                due_dates.append(pattern_due)
                if pattern.get('source_id') and pattern['source_id'] not in source_ids:
                    source_ids.append(pattern['source_id'])
        if due_dates:
            rows.append({
                'id': club['id'],
                'name': club['name'],
                'due': min(due_dates),
                'audit_due': audit_due,
                'patterns_due': patterns_due,
                'checked_on': audit['checked_on'] if audit else None,
                'source_ids': source_ids,
            })
    return sorted(rows, key=lambda row: (row['due'], row['name'].casefold()))


def races_due(races, today, days=RACE_WINDOW_DAYS):
    """Return scheduled races in the window with conflicts or aging checks.

    An in-progress multi-day event remains eligible through its final day. A
    check due to age before the next weekly run or race start is included now;
    for an in-progress race, assess age as of today. The age check is
    independent of the conflict flag.
    """
    last = today + timedelta(days=days)
    found = []
    for race in races:
        if (race['status'] != 'scheduled'
                or date.fromisoformat(race['end_date'] or race['date']) < today
                or date.fromisoformat(race['date']) > last):
            continue
        reasons = []
        if race['needs_review']:
            reasons.append('flagged')
        start = date.fromisoformat(race['date'])
        age_due = date.fromisoformat(race['checked_on']) + timedelta(days=RACE_CHECK_MAX_AGE_DAYS)
        age_horizon = min(max(start, today), today + timedelta(days=RACE_REVIEW_CADENCE_DAYS))
        if age_due <= today:
            reasons.append('check is 30+ days old')
        elif age_due <= age_horizon:
            reasons.append(f'check reaches 30 days on {age_due.isoformat()}')
        if reasons:
            found.append({'race': race, 'reasons': reasons})
    return sorted(found, key=lambda row: (row['race']['date'], row['race']['title'].casefold()))


def event_queue(events, today):
    """Queue flagged, unconfirmed and aging listings, without inferring changes."""
    last = today + timedelta(days=EVENT_WINDOW_DAYS)
    found = []
    for event in events:
        start = date.fromisoformat(event['starts_at_local'][:10])
        if event['status'] not in ('published', 'unconfirmed') or not today <= start <= last:
            continue
        reasons = []
        if event.get('needs_review') is True:
            reasons.append('flagged for review')
        if event['status'] == 'unconfirmed':
            reasons.append('unconfirmed')
        checked = event.get('checked_on')
        if not checked:
            reasons.append('no check date')
        else:
            age_due = date.fromisoformat(checked) + timedelta(days=EVENT_CHECK_MAX_AGE_DAYS)
            age_horizon = min(start, today + timedelta(days=RACE_REVIEW_CADENCE_DAYS))
            if age_due <= today:
                reasons.append('check is 14+ days old')
            elif age_due <= age_horizon:
                reasons.append(f'check reaches 14 days on {age_due.isoformat()}')
        if reasons:
            found.append({'event': event, 'reasons': reasons})
    return sorted(found, key=lambda row: (row['event']['starts_at_local'], row['event']['id']))


def coverage_gaps(clubs, events, audits, sources, today):
    """List clubs without a published dated event in the inclusive window."""
    last = today + timedelta(days=EVENT_WINDOW_DAYS)
    covered = {event['club_id'] for event in events if event['status'] == 'published'
               and today <= date.fromisoformat(event['starts_at_local'][:10]) <= last}
    audit_by_club = {audit['club_id']: audit for audit in audits}
    source_by_id = {source['id']: source for source in sources}
    rows = []
    for club in clubs:
        if club['id'] in covered:
            continue
        audit = audit_by_club.get(club['id'], {})
        refs = [source_by_id[source_id] for source_id in audit.get('reference_source_ids', [])
                if source_id in source_by_id]
        refs.sort(key=lambda source: (source['authority'] not in ('club', 'host'),
                                      not bool(set(source['roles']) & {'event', 'calendar', 'updates', 'schedule'})))
        rows.append({'club': club, 'sources': refs})
    return sorted(rows, key=lambda row: row['club']['name'].casefold())


def cell(value):
    return str(value).replace('|', r'\|').replace('\n', ' ')


def markdown(today, horizon, clubs_due, races_to_review, events_to_review, gaps, clubs, sources):
    lines = [f'Research review status as of {today.isoformat()} (San Francisco). Club review horizon: {horizon.isoformat()}.', '']
    source_by_id = {source['id']: source for source in sources}
    overdue = sum(1 for row in clubs_due if row['due'] < today)
    if clubs_due:
        lines += [
            f'**{len(clubs_due)} clubs** need a review ({overdue} overdue). Recheck each club\'s own channels, then update '
            '`checked_on` and `review_due` in `data/audits.json` and `data/schedules.json`.',
            '',
            '| Club | Due | Audit | Patterns due | Last checked | Sources |',
            '| --- | --- | --- | --- | --- | --- |',
        ]
        for row in clubs_due:
            status = 'overdue' if row['due'] < today else 'due'
            links = '; '.join(f"[source]({source_by_id[source_id]['url']}) ({cell(source_by_id[source_id]['access'])})"
                              for source_id in row['source_ids'] if source_id in source_by_id) or 'none recorded'
            lines.append(
                f"| {cell(row['name'])} (`{row['id']}`) | {row['due'].isoformat()} ({status}) | "
                f"{'yes' if row['audit_due'] else 'no'} | {row['patterns_due']} | {row['checked_on'] or 'never'} | {links} |"
            )
    else:
        lines.append('No club reviews are due.')
    lines.append('')
    if races_to_review:
        lines += [
            f'**{len(races_to_review)} upcoming races** starting within {RACE_WINDOW_DAYS} days or in progress '
            f'are flagged `needs_review` or their checks reach {RACE_CHECK_MAX_AGE_DAYS} days old by race day '
            f'or the next weekly reminder, whichever comes first. '
            'Confirm their details with the organizer before race day; checking a stale record does not by itself resolve a flag.',
            '',
            '| Race | Date | Checked | Why | Source |',
            '| --- | --- | --- | --- | --- |',
        ]
        for row in races_to_review:
            race = row['race']
            link = f"[open]({race['source_url']})" if race.get('source_url') else 'not recorded'
            lines.append(f"| {cell(race['title'])} (`{race['id']}`) | {race['date']} | {race['checked_on']} | {', '.join(row['reasons'])} | {link} |")
        lines.append('')
    club_by_id = {club['id']: club for club in clubs}
    lines += [f'**{len(events_to_review)} upcoming run listings** need a source check within {EVENT_WINDOW_DAYS} days.',
              'Review the source for cancellations, time and meeting-point changes; a check date alone cannot detect them.', '']
    if events_to_review:
        lines += ['| Run | Starts (local) | Checked | Why | Source |', '| --- | --- | --- | --- | --- |']
        for row in events_to_review:
            event = row['event']
            source_ids = dict.fromkeys([event['source_id'], *event.get('additional_source_ids', [])])
            link = '; '.join(f"[source]({source_by_id[source_id]['url']}) "
                             f"({cell(source_by_id[source_id]['authority'])}; {cell(source_by_id[source_id]['access'])})"
                             for source_id in source_ids if source_id in source_by_id) or 'not recorded'
            lines.append(f"| {cell(club_by_id[event['club_id']]['name'])}: {cell(event['title'])} (`{event['id']}`) | "
                         f"{event['starts_at_local']} | {event.get('checked_on') or 'never'} | {', '.join(row['reasons'])} | {link} |")
        lines.append('')
    lines += [f'**{len(gaps)} clubs** have no published dated run in the next {EVENT_WINDOW_DAYS} days.',
              'This is an index coverage gap, not evidence that a club has no runs or is inactive. '
              'Check organizer channels first; recurring patterns are leads, not dated confirmations.', '']
    if gaps:
        lines += ['| Club | Known sources (authority; access) |', '| --- | --- |']
        for row in gaps:
            refs = '; '.join(f"[source]({source['url']}) ({cell(source['authority'])}; {cell(source['access'])})"
                             for source in row['sources']) or 'none recorded'
            lines.append(f"| {cell(row['club']['name'])} (`{row['club']['id']}`) | {refs} |")
        lines.append('')
    lines.append('This queue reads the local snapshot only; it does not contact sources or detect changes. '
                 'After a human checks the evidence and updates data, run `npm run generate` and `npm run verify`. '
                 'See `research/tracking.md` for the process.')
    return '\n'.join(lines) + '\n'


def main(argv=None, root=ROOT):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--as-of', help='Date in San Francisco as YYYY-MM-DD; defaults to today')
    parser.add_argument('--within', type=int, default=0, help='Also include reviews due within this many days')
    parser.add_argument('--count', action='store_true', help='Print the total number of queue entries (a club may appear in more than one section)')
    args = parser.parse_args(argv)
    if args.within < 0:
        parser.error('--within must be non-negative')
    today = date.fromisoformat(args.as_of) if args.as_of else datetime.now(SAN_FRANCISCO).date()
    horizon = today + timedelta(days=args.within)
    clubs, audits, events, sources = [load(name, root) for name in ('clubs', 'audits', 'events', 'sources')]
    clubs_due = due_clubs(clubs, audits, load('schedules', root), today, horizon)
    races_to_review = races_due(load('races', root), today)
    events_to_review = event_queue(events, today)
    gaps = coverage_gaps(clubs, events, audits, sources, today)
    if args.count:
        print(len(clubs_due) + len(races_to_review) + len(events_to_review) + len(gaps))
    else:
        print(markdown(today, horizon, clubs_due, races_to_review, events_to_review, gaps, clubs, sources), end='')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
