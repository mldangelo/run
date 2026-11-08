#!/usr/bin/env python3
"""Print dated events or a per-club view of the local research snapshot."""
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1] / 'data'
def load(name): return json.loads((ROOT / (name + '.json')).read_text())
clubs, sources, audits, schedules, events = [load(x) for x in ('clubs','sources','audits','schedules','events')]
club_by_id = {x['id']: x for x in clubs}; source_by_id = {x['id']: x for x in sources}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--club', help='Case-insensitive name or id substring')
parser.add_argument('--days', type=int, default=14, help='Future event window, default 14')
parser.add_argument('--as-of', help='Reference time in local ISO format, default now in San Francisco')
args = parser.parse_args()
if args.days < 0: parser.error('--days must be non-negative')
now = datetime.fromisoformat(args.as_of) if args.as_of else datetime.now(ZoneInfo('America/Los_Angeles'))
if now.tzinfo is None: now = now.replace(tzinfo=ZoneInfo('America/Los_Angeles'))
end = now + timedelta(days=args.days)
selected = [c for c in clubs if not args.club or args.club.casefold() in (c['name']+' '+c['id']+' '+c['user_supplied_name']).casefold()]
if not selected: parser.error('No matching clubs')
print('Snapshot, not a live calendar. Verify dates, location, and cancellations with the organizer.')
if args.club:
 for c in selected:
  a = next(x for x in audits if x['club_id'] == c['id'])
  print(f"\n{c['name']} — {a['result']} (checked {a['checked_on']}; review by {a['review_due']})")
  print(a['notes'])
  for s in schedules:
   if s['club_id'] == c['id']:
    print(f"  Pattern: {', '.join(s['days'])} {s['local_time'] or 'time unknown'}; {s['frequency']}; {s['location']} [{s['evidence']}]")
    if s['valid_from'] or s['valid_until']: print(f"    Effective: {s['valid_from'] or '?'} to {s['valid_until'] or '?'}")
    print(f"    Source: {source_by_id[s['source_id']]['url']}")
  for sid in a['reference_source_ids']:
   s = source_by_id[sid]
   print(f"  Source: {s['url']} ({s['authority']}; {', '.join(s['roles'])}; {s['access']})")
print(f'\nDated events between {now.isoformat(timespec="minutes")} and {end.isoformat(timespec="minutes")}:')
found = []
for e in events:
 if e['club_id'] not in {c['id'] for c in selected} or e['status'] != 'published': continue
 start = datetime.fromisoformat(e['starts_at_local']).replace(tzinfo=ZoneInfo(e['timezone']))
 if now <= start <= end: found.append((start,e))
for start,e in sorted(found,key=lambda pair: pair[0]):
 print(f"  {start:%a %b %d %I:%M %p}: {club_by_id[e['club_id']]['name']} — {e['title']} — {e['location']}")
 print(f"    {source_by_id[e['source_id']]['url']}")
if not found: print('  None recorded in this snapshot; that does not mean no runs are scheduled.')
