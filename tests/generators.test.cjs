const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildFeed } = require('../scripts/build_feed.cjs');
const { buildCsv, FIELDS } = require('../scripts/build_clubs_csv.cjs');
const snapshot = require('./fixtures/snapshot.json');
const root = path.resolve(__dirname, '..');
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
    ...['unconfirmed', 'cancelled', 'postponed'].map((status) => ({
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
test('CSV preserves field order, UTF-8, CRLF, quoted commas, quotes, newlines and nulls', () => {
  const club = {
    id: 'club-a',
    name: 'Club A',
    description: 'Runs, then "coffee" — every week.\nNext line',
    source_url: null,
  };
  const expected = `${FIELDS.join(',')}\r\nclub-a,Club A,,,"Runs, then ""coffee"" — every week.\nNext line",,,,\r\n`;
  assert.equal(buildCsv([club]).toString(), expected);
  assert.deepEqual(buildCsv([club]), buildCsv([club]));
  assert.throws(
    () => buildCsv([{ ...club, new_field: 'x' }]),
    /Unknown club fields/,
  );
});
test('committed feed and CSV are byte-for-byte exports of the canonical JSON', () => {
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`)));
  assert.deepEqual(
    buildFeed(read('events'), read('clubs'), read('sources')),
    fs.readFileSync(path.join(root, 'feed.xml')),
  );
  assert.deepEqual(
    buildCsv(read('clubs')),
    fs.readFileSync(path.join(root, 'data/clubs.csv')),
  );
});
for (const name of ['build_feed', 'build_clubs_csv'])
  test(`${name} CLI writes output and rejects missing or stale files`, (t) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-generate-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(temp, 'data'));
    for (const key of ['events', 'clubs', 'sources'])
      fs.writeFileSync(
        path.join(temp, 'data', `${key}.json`),
        JSON.stringify(snapshot[key]),
      );
    const file = path.join(
      temp,
      name === 'build_feed' ? 'feed.xml' : 'data/clubs.csv',
    );
    const run = (check) =>
      spawnSync(
        process.execPath,
        [
          '-e',
          'process.exitCode = require(process.argv[1]).main(JSON.parse(process.argv[3]), process.argv[2])',
          path.join(root, 'scripts', `${name}.cjs`),
          temp,
          JSON.stringify(check ? ['--check'] : []),
        ],
        { encoding: 'utf8' },
      );
    assert.equal(run(true).status, 1);
    assert.equal(run(false).status, 0);
    assert.equal(run(true).status, 0);
    const bytes = fs.readFileSync(file);
    fs.appendFileSync(file, 'stale');
    const result = run(true);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /out of date/);
    assert.deepEqual(
      fs.readFileSync(file),
      Buffer.concat([bytes, Buffer.from('stale')]),
    );
  });
