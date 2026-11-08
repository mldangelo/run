#!/usr/bin/env python3
"""Generate a readable view from the canonical JSON snapshot."""
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1] / 'data'
def load(n): return json.loads((ROOT / f'{n}.json').read_text())
def text(value): return str(value or 'Unknown').replace('|', r'\|').replace('\n', ' ')
def local_start(e): return datetime.fromisoformat(e['starts_at_local']).replace(tzinfo=ZoneInfo(e['timezone']))
def link(s): return f"[Source]({s['url']})"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--as-of', help='Snapshot reference time in SF, ISO local date/time; defaults to now')
parser.add_argument('--days', type=int, default=14)
args = parser.parse_args()
if args.days < 0: parser.error('--days must be non-negative')
now = datetime.fromisoformat(args.as_of) if args.as_of else datetime.now(ZoneInfo('America/Los_Angeles'))
if now.tzinfo is None: now = now.replace(tzinfo=ZoneInfo('America/Los_Angeles'))
end = now + timedelta(days=args.days)
clubs = {c['id']:c for c in load('clubs')}; sources = {s['id']:s for s in load('sources')}
events, schedules = load('events'), load('schedules')
print('# Running schedule — research snapshot')
print(f"\nView generated for {now:%B %d, %Y %I:%M %p %Z} through {end:%B %d, %Y %I:%M %p %Z}. Source data was checked on dates shown in the linked records. This is not a live calendar; check the organizer for cancellations and changes. Some event links require an account.\n")
print('Canonical structured data: [events](../data/events.json), [recurring patterns](../data/schedules.json), [sources](../data/sources.json), and [club audits](../data/audits.json). A location labeled unknown or TBD has not been established. Bay Area events outside SF are labeled.\n')
for status,title in [('published','Published dated listings'),('unconfirmed','Unconfirmed dated leads')]:
 print(f'## {title}\n')
 if status=='unconfirmed':print('These leads need verification: some are unconfirmed third-party listings and others have conflicting details.\n')
 print('| Date and time | Club and event | Meeting place | Details | Source |')
 print('| --- | --- | --- | --- | --- |')
 found=[e for e in events if e['status']==status and now <= local_start(e) <= end]
 for e in sorted(found,key=lambda x:(local_start(x),x['club_id'],x['id'])):
  options='; '.join(f"{o['local_time']} {o['location']} ({o['details']})" for o in e.get('meeting_options',[]))
  details=e.get('notes','')
  if options:details += ' Alternate starts: '+options
  print(f"| {local_start(e):%a %b %d, %-I:%M %p} | {text(clubs[e['club_id']]['name'])}: {text(e['title'])} | {text(e['location'])} | {text(details) if details else 'See source'} | {link(sources[e['source_id']])} ({e['source_type']}) |")
 if not found:print('| — | No listings recorded in this window | — | — | — |')
 print()
print('## Recurring patterns\n')
print('Patterns are not confirmations for individual dates. Locations and times may change; check the source. Patterns marked needs review are retained for comparison and are not projected by the report tool.\n')
print('| Days | Time | Club and run | Meeting place | Frequency and notes | Evidence |')
print('| --- | --- | --- | --- | --- | --- |')
for s in sorted(schedules,key=lambda s:(min(('monday','tuesday','wednesday','thursday','friday','saturday','sunday').index(d) for d in s['days']),s['local_time'] or '99:99',s['club_id'],s['id'])):
 validity=''
 if s.get('valid_from') or s.get('valid_until'):validity=f" Effective {s.get('valid_from') or '?'} to {s.get('valid_until') or '?'}."
 detail=f"{s['frequency']}.{validity} {s.get('notes','')}"
 print(f"| {text(', '.join(s['days']))} | {text(s.get('local_time'))} | {text(clubs[s['club_id']]['name'])}: {text(s['label'])} | {text(s['location'])} | {text(detail)} | {link(sources[s['source_id']])} ({s['evidence']}; {s.get('status','active')}) |")
