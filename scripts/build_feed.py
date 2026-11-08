#!/usr/bin/env python3
"""Generate an RSS feed from published dated events, without inventing occurrences."""
import argparse
import json
import sys
from datetime import date, datetime, time
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = 'https://mldangelo.github.io/run/'
ATOM = 'http://www.w3.org/2005/Atom'
ET.register_namespace('atom', ATOM)


def build_feed(events, clubs, sources):
    club_lookup = {club['id']: club for club in clubs}
    source_lookup = {source['id']: source for source in sources}
    rss = ET.Element('rss', {'version': '2.0'})
    channel = ET.SubElement(rss, 'channel')
    for tag, text in [('title', 'SF Run Club Index: dated listings'), ('link', SITE_URL),
                      ('description', 'Dated published listings from a research snapshot. Check the linked source before attending; this is not a live calendar.'),
                      ('language', 'en-us')]:
        ET.SubElement(channel, tag).text = text
    ET.SubElement(channel, f'{{{ATOM}}}link', {'href': SITE_URL + 'feed.xml', 'rel': 'self', 'type': 'application/rss+xml'})
    for event in sorted((event for event in events if event['status'] == 'published'), key=lambda item: (item['starts_at_local'], item['id']), reverse=True):
        club = club_lookup[event['club_id']]
        source = source_lookup[event['source_id']]
        if urlparse(source['url']).scheme != 'https':
            raise ValueError('Feed sources must use HTTPS')
        start = datetime.fromisoformat(event['starts_at_local'])
        check = date.fromisoformat(event['checked_on'])
        item = ET.SubElement(channel, 'item')
        title = f"{start.strftime('%a %b %d, %Y')} · {club['name']} · {event['title']}"
        # Date-only checks have no observed time; midnight is used for RSS ordering.
        checked_at = datetime.combine(check, time.min, ZoneInfo(event['timezone']))
        details = event.get('notes') or 'See source for details.'
        description = f"Starts: {start.strftime('%Y-%m-%d %I:%M %p')} ({event['timezone']}). Meeting place: {event['location']}. {details} Source checked: {check.isoformat()}. Confirm changes with the organizer."
        for tag, value in [('title', title), ('link', source['url']), ('description', description), ('pubDate', format_datetime(checked_at))]:
            ET.SubElement(item, tag).text = value
        ET.SubElement(item, 'guid', {'isPermaLink': 'false'}).text = event['id']
    ET.indent(rss, space='  ')
    return ET.tostring(rss, encoding='utf-8', xml_declaration=True) + b'\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if the committed feed is stale')
    args = parser.parse_args()
    data = [json.loads((ROOT / 'data' / f'{name}.json').read_text()) for name in ('events', 'clubs', 'sources')]
    result = build_feed(*data)
    path = ROOT / 'feed.xml'
    if args.check:
        if not path.exists() or path.read_bytes() != result:
            print('feed.xml is out of date; run npm run feed', file=sys.stderr)
            return 1
        print('Feed is up to date.')
    else:
        path.write_bytes(result)
        print(f'Wrote {path.name}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
