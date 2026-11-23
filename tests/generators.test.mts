import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildCsv, FIELDS } from '../scripts/build_clubs_csv.mts';
import { buildFeed } from '../scripts/build_feed.mts';
import type { Snapshot } from '../scripts/types.mts';
import rawSnapshot from './fixtures/snapshot.json' with { type: 'json' };

const snapshot = rawSnapshot as Snapshot;
const root = path.resolve(import.meta.dirname, '..');
test('feed contains published events, stable IDs, source links, checked dates and escaped text', () => {
  const event = {
    ...snapshot.events[0],
    title: 'A & B <run>',
    location: '18th & Church',
    checked_on: '2026-11-08',
  };
  const source = {
    ...snapshot.sources[0],
    url: 'https://example.org/event?a=1&b=2',
  };
  const events = [
    event,
    ...(['unconfirmed', 'cancelled', 'postponed'] as const).map((status) => ({
      ...event,
      id: status,
      status,
    })),
  ];
  const raw = buildFeed(events, snapshot.clubs, [source]);
  assert.deepEqual(raw, buildFeed(events, snapshot.clubs, [source]));
  const xml = raw.toString();
  assert.equal((xml.match(/<item>/g) || []).length, 1);
  assert.match(xml, /A &amp; B &lt;run&gt;/);
  assert.match(xml, /18th &amp; Church/);
  assert.match(xml, /<guid isPermaLink="false">evt-a<\/guid>/);
  assert.match(xml, /<link>https:\/\/example.org\/event\?a=1&amp;b=2<\/link>/);
  assert.match(xml, /<pubDate>Sun, 08 Nov 2026 00:00:00 -0800<\/pubDate>/);
  assert.throws(
    () =>
      buildFeed([event], snapshot.clubs, [
        { ...source, url: 'http://example.org' },
      ]),
    /HTTPS/,
  );
  const summer = buildFeed(
    [{ ...event, checked_on: '2026-07-01' }],
    snapshot.clubs,
    [source],
  ).toString();
  assert.match(summer, /Wed, 01 Jul 2026 00:00:00 -0700/);
});
test('CSV derives source, result and check date from the audit and preserves CSV escaping', () => {
  const club = {
    ...snapshot.clubs[0],
    user_supplied_name: '',
    geography: '',
    description: 'Runs, then "coffee" — every week.\nNext line',
  };
  const expected = `${FIELDS.join(',')}\r\nclub-a,Club A,,,"Runs, then ""coffee"" — every week.\nNext line",https://example.org/events,club,dated_event_found,2026-11-08\r\n`;
  const csv = buildCsv([club], snapshot.audits, snapshot.sources);
  assert.equal(csv.toString(), expected);
  assert.match(
    buildCsv([{ ...club, id: 'no-audit' }], [], []).toString(),
    /\r\nno-audit,Club A,,,".*",,,,\r\n$/s,
  );
});
for (const name of ['build_feed', 'build_clubs_csv'])
  test(`${name} CLI writes its output from the JSON`, (t) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-generate-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(temp, 'data'));
    for (const key of ['events', 'clubs', 'sources', 'audits'] as const)
      fs.writeFileSync(
        path.join(temp, 'data', `${key}.json`),
        JSON.stringify(snapshot[key]),
      );
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        'process.exitCode = require(process.argv[1]).main([], process.argv[2])',
        path.join(root, 'scripts', `${name}.mts`),
        temp,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const file = path.join(
      temp,
      name === 'build_feed' ? 'feed.xml' : 'data/clubs.csv',
    );
    assert.ok(fs.readFileSync(file).length > 0);
  });

test('site data derives source check dates from page checks and leaves out what the site never shows', async () => {
  const { siteAudits, siteRaces, siteSources, sourceCheckDates } = await import(
    '../scripts/build_site_data.mts'
  );
  const audits = structuredClone(snapshot.audits);
  audits[0].research_log = [
    {
      checked_on: '2026-11-09',
      summary: 'First pass.',
      next_steps: 'Recheck.',
      source_checks: [{ source_id: 'src-a', method: 'page', notes: 'Read.' }],
    },
    {
      checked_on: '2026-11-23',
      summary: 'Second pass.',
      next_steps: 'Recheck.',
      source_checks: [
        // A cached fetch from the night before keeps its own date.
        {
          source_id: 'src-a',
          method: 'page',
          notes: 'Cached copy.',
          observed_on: '2026-11-22',
        },
        { source_id: 'src-b', method: 'restricted', notes: 'Sign-in wall.' },
      ],
    },
  ];
  assert.deepEqual([...sourceCheckDates(audits)], [['src-a', '2026-11-22']]);
  const sources = siteSources(
    [
      ...snapshot.sources,
      { ...snapshot.sources[0], id: 'src-b', url: 'https://example.org/b' },
    ],
    audits,
  );
  assert.deepEqual(
    sources.map((source) => [source.id, source.last_checked]),
    [
      ['src-a', '2026-11-22'],
      ['src-b', null],
    ],
  );
  assert.equal('roles' in sources[0], false);
  const { research_log: _log, review_due: _due, ...shown } = audits[0];
  assert.deepEqual(siteAudits(audits), [shown]);
  // Registration evidence notes stay out of the race and each distance; the
  // organizer's notes and the race's research notes stay in.
  const registration = {
    status: 'open',
    source_url: 'https://example.org/race',
    checked_on: '2026-11-08',
    review_due: '2026-11-15',
    access_method: 'web',
    notes: 'Open.',
    evidence_notes: 'Read the signed-out page.',
  } as const;
  const { evidence_notes: _notes, ...kept } = registration;
  const race = {
    ...snapshot.races[0],
    research_notes: 'Listed twice.',
    registration,
    distances: [
      { ...snapshot.races[0].distances[0], registration },
      snapshot.races[0].distances[0],
    ],
  };
  assert.deepEqual(siteRaces([race, snapshot.races[0]]), [
    {
      ...race,
      registration: kept,
      distances: [
        { ...race.distances[0], registration: kept },
        race.distances[1],
      ],
    },
    snapshot.races[0],
  ]);
});
test('build_site_data CLI writes the one file the site loads', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-generate-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temp, 'data'));
  for (const [key, records] of Object.entries(snapshot))
    fs.writeFileSync(
      path.join(temp, 'data', `${key}.json`),
      JSON.stringify(records),
    );
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      'process.exitCode = require(process.argv[1]).main([], process.argv[2])',
      path.join(root, 'scripts', 'build_site_data.mts'),
      temp,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const site = JSON.parse(
    fs.readFileSync(path.join(temp, 'data', 'site.json'), 'utf8'),
  );
  assert.deepEqual(Object.keys(site), [
    'clubs',
    'events',
    'schedules',
    'sources',
    'audits',
    'races',
  ]);
  for (const key of ['clubs', 'events', 'schedules', 'races'] as const)
    assert.deepEqual(site[key], snapshot[key]);
  assert.equal(site.sources[0].last_checked, null);
  assert.deepEqual(
    fs
      .readdirSync(path.join(temp, 'data'))
      .filter((file) => /^site/.test(file)),
    ['site.json'],
  );
});
