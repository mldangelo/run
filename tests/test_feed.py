import unittest
import xml.etree.ElementTree as ET
from scripts.build_feed import build_feed


class FeedTests(unittest.TestCase):
    def test_feed_includes_only_published_events_with_stable_ids_and_escaped_data(self):
        events = [
            {'id': 'evt-1', 'club_id': 'club', 'title': 'A & B', 'starts_at_local': '2026-11-09T06:30', 'timezone': 'America/Los_Angeles', 'location': '18th & Church', 'source_id': 'source', 'checked_on': '2026-11-08', 'status': 'published'},
            {'id': 'evt-2', 'club_id': 'club', 'title': 'Not confirmed', 'starts_at_local': '2026-11-10T06:30', 'timezone': 'America/Los_Angeles', 'location': 'TBD', 'source_id': 'source', 'checked_on': '2026-11-08', 'status': 'unconfirmed'},
        ]
        sources = [{'id': 'source', 'url': 'https://example.org/event?a=1&b=2'}]
        clubs = [{'id': 'club', 'name': 'Runners'}]
        raw = build_feed(events, clubs, sources)
        self.assertEqual(raw, build_feed(events, clubs, sources))
        root = ET.fromstring(raw)
        items = root.findall('./channel/item')
        self.assertEqual(len(items), 1)
        self.assertIn('A & B', items[0].findtext('title'))
        self.assertIn('18th & Church', items[0].findtext('description'))
        self.assertEqual(items[0].findtext('guid'), 'evt-1')
        self.assertEqual(items[0].findtext('link'), sources[0]['url'])
        self.assertTrue(items[0].findtext('pubDate').endswith('-0800'))


if __name__ == '__main__':
    unittest.main()
