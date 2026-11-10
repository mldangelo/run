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
