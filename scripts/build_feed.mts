import fs from 'node:fs';
import path from 'node:path';
import {
  args,
  cli,
  compareKeys,
  dateParts,
  load,
  lookup,
  offsetMinutes,
  offsetText,
  ROOT,
  zonedDate,
} from './lib.mts';
import type { Club, DatedEvent, Source } from './types.mts';

const SITE_URL = 'https://mldangelo.github.io/run/';
const xml = (text: unknown) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
function buildFeed(events: DatedEvent[], clubs: Club[], sources: Source[]) {
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const lines = [
    "<?xml version='1.0' encoding='utf-8'?>",
    '<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">',
    '  <channel>',
  ];
  const tag = (name: string, value: string, indent = 4) =>
    `${' '.repeat(indent)}<${name}>${xml(value)}</${name}>`;
  lines.push(
    tag('title', 'SF Run Club Index: dated listings'),
    tag('link', SITE_URL),
    tag(
      'description',
      'Dated published listings from a research snapshot. Check the linked source before attending; this is not a live calendar.',
    ),
    tag('language', 'en-us'),
    `    <atom:link href="${SITE_URL}feed.xml" rel="self" type="application/rss+xml" />`,
  );
  const published = events
    .filter((event) => event.status === 'published')
    .sort((a, b) =>
      compareKeys([b.starts_at_local, b.id], [a.starts_at_local, a.id]),
    );
  for (const event of published) {
    const source = lookup(sourceById, event.source_id);
    if (new URL(source.url).protocol !== 'https:')
      throw new Error('Feed sources must use HTTPS');
    const start = dateParts(event.starts_at_local);
    const check = dateParts(`${event.checked_on}T00:00`);
    const checkedAt = zonedDate(`${event.checked_on}T00:00`, event.timezone);
    const title = `${start.weekday} ${start.month} ${start.day}, ${start.year} · ${lookup(clubById, event.club_id).name} · ${event.title}`;
    const description = `Starts: ${event.starts_at_local.slice(0, 10)} ${String(start.hour).padStart(2, '0')}:${start.minute} ${start.period} (${event.timezone}). Meeting place: ${event.location}. ${event.notes || 'See source for details.'} Source checked: ${event.checked_on}. Confirm changes with the organizer.`;
    const pubDate = `${check.weekday}, ${check.day} ${check.month} ${check.year} 00:00:00 ${offsetText(offsetMinutes(checkedAt, event.timezone), false)}`;
    lines.push(
      '    <item>',
      tag('title', title, 6),
      tag('link', source.url, 6),
      tag('description', description, 6),
      tag('pubDate', pubDate, 6),
      `      <guid isPermaLink="false">${xml(event.id)}</guid>`,
      '    </item>',
    );
  }
  lines.push('  </channel>', '</rss>');
  return Buffer.from(`${lines.join('\n')}\n`);
}
function main(argv?: string[], root = ROOT) {
  const options = args({ check: { type: 'boolean' } }, argv);
  if (options.help) {
    console.log(
      'Generate published dated listings only. Usage: node scripts/build_feed.mts [--check]',
    );
    return 0;
  }
  const result = buildFeed(
    load('events', root),
    load('clubs', root),
    load('sources', root),
  );
  const file = path.join(root, 'feed.xml');
  if (options.check) {
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(result)) {
      console.error('feed.xml is out of date; run npm run feed');
      return 1;
    }
    console.log('Feed is up to date.');
  } else {
    fs.writeFileSync(file, result);
    console.log('Wrote feed.xml.');
  }
  return 0;
}

export { buildFeed, main };

if (import.meta.main) cli(main);
