import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { load, ROOT } from '../scripts/lib.mts';
import {
  canonicalUrl,
  eventLinks,
  extract,
} from '../scripts/refresh/evidence.mts';
import {
  fetchPage,
  type PageResponse,
  publicAddress,
} from '../scripts/refresh/http.mts';
import { plan, type Target } from '../scripts/refresh/plan.mts';
import { type Options, run } from '../scripts/refresh/run.mts';
import { main } from '../scripts/refresh_sources.mts';

const url = 'https://example.com/events/friday';
// Synthetic fixtures reproduce observed failure modes, without saved browser data.
const html = (
  date = '2026-11-20',
  noise = '100',
) => `<html><head><title>Friday run</title>
<script type="application/ld+json">{"@type":"Event","name":"Friday run","startDate":"${date}T07:00:00-08:00"}</script></head>
<body><nav>${noise} members</nav><main><h1>Friday run</h1><p>Meet at Lafayette Park on ${date} at 7 AM. Run a 5K together, followed by coffee. All paces welcome.</p></main><footer>${noise} visitors</footer></body></html>`;
const page = (body = html(), status = 200): PageResponse => ({
  url,
  status,
  body,
  etag: '"v1"',
  contentType: 'text/html; charset=utf-8',
});
const target = (value = url): Target => ({
  url: value,
  source_ids: ['src-test'],
  club_ids: ['club-test'],
  record_ids: ['evt-test'],
  reasons: ['test'],
  access: ['public'],
});
function setup(t: { after: (fn: () => void) => void }): Options {
  const cache = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'run-refresh-test-'),
  );
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  return {
    cache,
    targets: [target()],
    asOf: '2026-11-16',
    baseRevision: 'test',
    dataHash: 'test',
    limit: 20,
    discover: 3,
    fetch: async () => page(),
  };
}

test('unchanged evidence, boilerplate churn and 304 keep the cached content hash', async (t) => {
  const options = setup(t);
  const first = await run(options);
  assert.equal(first.report.version, 2);
  assert.equal(first.report.summary.requests, 1);
  assert.equal(first.report.rows[0].fetch, 'new');
  const second = await run({
    ...options,
    fetch: async () => page(html('2026-11-20', '999')),
  });
  assert.equal(second.report.rows[0].fetch, 'unchanged');
  assert.equal(
    second.report.rows[0].content_hash,
    first.report.rows[0].content_hash,
  );
  const third = await run({
    ...options,
    fetch: async (_url, headers) => {
      assert.equal(headers['If-None-Match'], '"v1"');
      return page('', 304);
    },
  });
  assert.equal(third.report.rows[0].fetch, 'not_modified');
  assert.equal(
    third.report.rows[0].evidence_file,
    second.report.rows[0].evidence_file,
  );
  assert.equal(
    third.report.rows[0].content_hash,
    first.report.rows[0].content_hash,
  );
  assert.equal(
    new Set([first.reportFile, second.reportFile, third.reportFile]).size,
    3,
  );
});

test('pages needing a login for event details are fetched signed out after public ones; restricted pages are skipped', async (t) => {
  const options = setup(t);
  const fetched: string[] = [];
  const access = (value: string, kind: string) => ({
    ...target(value),
    access: [kind],
  });
  const { report } = await run({
    ...options,
    targets: [
      access('https://example.com/events/login', 'login_for_events'),
      access('https://example.com/events/private', 'restricted'),
      access('https://example.com/events/public', 'public'),
    ],
    fetch: async (value) => {
      fetched.push(value);
      return page();
    },
  });
  assert.deepEqual(fetched, [
    'https://example.com/events/public',
    'https://example.com/events/login',
  ]);
  assert.deepEqual(
    report.rows.map((row) => [row.target.url.split('/').at(-1), row.fetch]),
    [
      ['public', 'new'],
      ['login', 'new'],
      ['private', 'skipped'],
    ],
  );
});

test('changed occurrence on a rolling URL records new evidence and preserves the previous snapshot', async (t) => {
  const options = setup(t);
  const first = await run(options);
  const second = await run({
    ...options,
    fetch: async () => page(html('2026-11-27')),
  });
  assert.equal(second.report.rows[0].fetch, 'changed');
  assert.notEqual(
    second.report.rows[0].evidence_file,
    first.report.rows[0].evidence_file,
  );
  assert.equal(
    second.report.rows[0].previous_evidence_file,
    first.report.rows[0].evidence_file,
  );
  assert.notEqual(
    second.report.rows[0].content_hash,
    first.report.rows[0].content_hash,
  );
  assert.deepEqual(second.report.rows[0].target.record_ids, ['evt-test']);
  assert.match(second.report.caution, /not occurrence matches/);
});

test('fetch failure and access challenges do not reuse stale evidence or erase last usable evidence', async (t) => {
  const options = setup(t);
  const first = await run(options);
  for (const response of [
    page('', 503),
    page(
      '<h1>Just a moment</h1><p>Verify you are human before visiting this site.</p>',
    ),
  ]) {
    const failed = await run({ ...options, fetch: async () => response });
    assert.equal(failed.report.rows[0].fetch, 'failed');
    assert.equal(failed.report.rows[0].evidence_file, undefined);
    assert.equal(failed.report.rows[0].content_hash, undefined);
    assert.equal(failed.report.rows[0].observed_at, undefined);
  }
  const recovered = await run(options);
  assert.equal(recovered.report.rows[0].fetch, 'unchanged');
  assert.equal(
    recovered.report.rows[0].previous_evidence_file,
    first.report.rows[0].evidence_file,
  );
  assert.equal(
    recovered.report.rows[0].content_hash,
    first.report.rows[0].content_hash,
  );
});

test('offline replay never invokes the network, reuses cached evidence and keeps observation date', async (t) => {
  const options = setup(t);
  const original = await run({
    ...options,
    now: () => new Date('2026-11-16T00:00:00Z'),
  });
  const offline = await run({
    ...options,
    offline: true,
    targets: [target(), target('https://example.com/events/uncached')],
    fetch: async () => {
      throw new Error('network forbidden');
    },
  });
  const [cached, uncached] = [url, 'https://example.com/events/uncached'].map(
    (value) => offline.report.rows.find((row) => row.target.url === value),
  );
  assert.equal(offline.report.offline, true);
  assert.equal(cached?.fetch, 'offline');
  assert.equal(cached?.evidence_file, original.report.rows[0].evidence_file);
  assert.equal(cached?.observed_at, original.report.rows[0].observed_at);
  assert.equal(uncached?.fetch, 'failed');
  assert.match(uncached?.error || '', /No compatible cached/);
  assert.equal(offline.report.summary.requests, 0);
});

test('discovery is bounded, one hop, same-origin and does not inherit occurrence identity', async (t) => {
  const options = setup(t);
  const seen: string[] = [];
  const report = await run({
    ...options,
    limit: 2,
    discover: 1,
    targets: [target(), target('https://other.example/run')],
    fetch: async (value) => {
      seen.push(value);
      return {
        ...page(
          `${html()}<a href="/events/new">New event</a><a href="/events/second">Second event</a><a href="https://other.example/events/remote">Remote</a>`,
        ),
        url: value,
      };
    },
  });
  assert.deepEqual(seen, [url, 'https://example.com/events/new']);
  assert.equal(report.report.rows[1].target.discovered_from, url);
  assert.deepEqual(report.report.rows[1].target.record_ids, []);
  assert.equal(report.report.rows[0].discovery_omitted, 1);
  assert.equal(report.report.summary.requests, 2);
  assert.equal(report.report.summary.deferred, 1);
});

test('limited runs rotate oldest attempts and do not let restricted sources consume the first slots', async (t) => {
  const options = setup(t);
  const targets = [
    { ...target('https://a.example/'), access: ['restricted'] },
    target('https://b.example/'),
    target('https://c.example/'),
  ];
  const first = await run({
    ...options,
    targets,
    limit: 1,
    fetch: async (url) => ({ ...page(), url }),
  });
  const second = await run({
    ...options,
    targets,
    limit: 1,
    fetch: async (url) => ({ ...page(), url }),
  });
  assert.equal(first.report.rows[0].target.url, 'https://b.example/');
  assert.equal(second.report.rows[0].target.url, 'https://c.example/');
});

test('conflicting metadata and prose survive extraction; recurrence stays explicit', () => {
  const evidence = extract(
    html().replace(
      'Meet at Lafayette Park on 2026-11-20',
      'Every Friday. Meet at Lafayette Park on November 4',
    ),
    url,
  );
  assert.match(evidence.text, /2026-11-20/);
  assert.match(evidence.text, /November 4/);
  assert.match(evidence.text, /Every Friday/);
});

test('truncated, empty, malformed and non-HTML evidence is never marked unchanged', async (t) => {
  assert.throws(() => extract(html(), url, 10), /exceeds/);
  assert.throws(() => extract('<div id="app"></div>', url), /Insufficient/);
  assert.throws(
    () => extract('<script type="application/ld+json">{broken}</script>', url),
    /Malformed/,
  );
  const options = setup(t);
  const result = await run({
    ...options,
    fetch: async () => ({ ...page(), contentType: 'application/pdf' }),
  });
  assert.equal(result.report.rows[0].fetch, 'failed');
  assert.match(result.report.rows[0].error || '', /HTML required/);
  assert.equal(result.report.rows[0].evidence_file, undefined);
  const bad304 = await run({ ...options, fetch: async () => page('', 304) });
  assert.match(bad304.report.rows[0].error || '', /304 without/);
});

test('source URLs reject credentials and local network targets', async () => {
  assert.equal(
    canonicalUrl('https://example.com/event?b=2&utm_source=email&a=1#top'),
    'https://example.com/event?a=1&b=2',
  );
  for (const value of [
    'file:///etc/passwd',
    'https://user:secret@example.com/',
    'https://example.com/?token=secret',
  ])
    assert.throws(() => canonicalUrl(value));
  for (const address of [
    '127.0.0.1',
    '10.1.1.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
  ])
    assert.equal(publicAddress(address), false);
  assert.equal(publicAddress('8.8.8.8'), true);
  await assert.rejects(fetchPage('http://127.0.0.1/', {}), /non-public/);
  const links = eventLinks(
    extract(
      `${html()}<a href="/events/new?token=secret">Private</a><a href="/events/public">Public</a>`,
      url,
    ),
    url,
  );
  assert.deepEqual(links, ['https://example.com/events/public']);
});

test('discovery skips calendar exports, dashboards and race utility pages', () => {
  const race = 'https://runsignup.com/Race/CA/SanFrancisco/TurkeyTrot';
  const roster = 'https://raceroster.com/events/2026/114671/new-years-eve';
  const anchors = [
    `${roster}.ics`,
    `${roster}.ics?calendar=google`,
    'https://raceroster.com/dashboard/event-organizers/event/84202/terms',
    'https://runsignup.com/Race/Donate/CA/SanFrancisco/TurkeyTrot',
    'https://runsignup.com/Race/209367/RaceInsurance',
    'https://runsignup.com/Race/209367/Sponsor',
    'https://runsignup.com/Race/FindARunner/?raceId=209367',
    'https://runsignup.com/Race/CourseMaps/CA/SanFrancisco/TurkeyTrot',
    'https://runsignup.com/Race/Events/CA/SanFrancisco/TurkeyTrot',
    'https://runsignup.com/Race/CA/SanFrancisco/HolidayRun',
  ]
    .map((href) => `<a href="${href}">link</a>`)
    .join('');
  assert.deepEqual(eventLinks(extract(`${html()}${anchors}`, race), race), [
    'https://runsignup.com/Race/CA/SanFrancisco/HolidayRun',
    'https://runsignup.com/Race/Events/CA/SanFrancisco/TurkeyTrot',
  ]);
  const rosterLinks = eventLinks(
    extract(
      `${html()}<a href="${roster}.ics">ics</a><a href="${roster}">page</a>`,
      roster,
    ),
    'https://raceroster.com/events/2026/1/other',
  );
  assert.deepEqual(rosterLinks, [roster]);
});

test('queue integrates live schema, due races and their distance registration sources without writes', async (t) => {
  const data = {
    clubs: load('clubs'),
    audits: load('audits'),
    sources: load('sources'),
    events: load('events'),
    schedules: load('schedules'),
    races: load('races'),
  };
  data.events[0].run_details = {
    sources: ['https://example.com/practical-details'],
  };
  const before = JSON.stringify(data);
  const targets = plan(data, '2026-11-16', 7, true);
  assert.ok(
    targets.some(
      (target) =>
        target.url === 'https://example.com/practical-details' &&
        target.record_ids.includes(data.events[0].id),
    ),
  );
  assert.equal(
    new Set(targets.map((target) => target.url)).size,
    targets.length,
  );
  for (const race of data.races)
    for (const registration of [
      race.registration,
      ...race.distances.map((distance) => distance.registration),
    ])
      if (registration)
        assert.ok(
          targets.some(
            (target) =>
              target.url === canonicalUrl(registration.source_url) &&
              target.record_ids.includes(race.id),
          ),
        );
  assert.equal(JSON.stringify(data), before);
  const options = setup(t);
  const hashes = Object.fromEntries(
    fs
      .readdirSync(path.join(ROOT, 'data'))
      .filter((name) => name.endsWith('.json'))
      .map((name) => [
        name,
        fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'),
      ]),
  );
  assert.equal(
    await main([
      '--cache',
      options.cache,
      '--url',
      url,
      '--offline',
      '--as-of',
      '2026-11-16',
    ]),
    2,
  );
  for (const [name, text] of Object.entries(hashes))
    assert.equal(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'), text);
  await assert.rejects(
    main(['--cache', path.join(ROOT, 'data'), '--limit', '0']),
    /cache must be/,
  );
});

test('CLI rejects the removed parsing flags and exits 0 when every source is read', async (t) => {
  for (const flag of [
    ['--model', 'test-model'],
    ['--parser', 'codex'],
    ['--max-parses', '0'],
  ])
    await assert.rejects(main(flag), /Unknown option/);
  const options = setup(t);
  await run(options);
  assert.equal(
    await main([
      '--cache',
      options.cache,
      '--url',
      url,
      '--offline',
      '--as-of',
      '2026-11-16',
    ]),
    0,
  );
});

test('run lock prevents overlapping writes and is released after exceptions', async (t) => {
  const options = setup(t);
  fs.mkdirSync(path.join(options.cache, 'run.lock'));
  await assert.rejects(run(options), /locked/);
  fs.rmdirSync(path.join(options.cache, 'run.lock'));
  await run(options);
  assert.equal(fs.existsSync(path.join(options.cache, 'run.lock')), false);
});

test('discovered links rotate across runs even when page and discovery budgets defer most links', async (t) => {
  const options = setup(t);
  const visited: string[] = [];
  const links = ['a', 'b', 'c', 'd']
    .map((id) => `<a href="/events/${id}">${id}</a>`)
    .join('');
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await run({
      ...options,
      limit: 2,
      discover: 3,
      now: () => new Date(`2026-11-16T00:0${attempt}:00Z`),
      fetch: async (value) => ({ ...page(`${html()}${links}`), url: value }),
    });
    assert.equal(result.report.rows.length, 2);
    assert.equal(result.report.rows[1].target.discovered_from, url);
    visited.push(result.report.rows[1].target.url);
  }
  assert.deepEqual(
    visited,
    ['a', 'b', 'c', 'd'].map((id) => `https://example.com/events/${id}`),
  );
});

// Event platforms embed their event in a Next.js data island. These synthetic
// islands keep the observed nesting and field names, plus unrelated state
// (guests, host IDs, build IDs) that must never reach the evidence.
const platform = (title: string, visible: string, data: unknown, head = '') =>
  `<html><head><title>${title}</title>${head}</head><body><main><h1>${title}</h1><p>${visible}</p><p>Register below to join. Hosted by the club; all runners and paces are welcome.</p></main><script id="__NEXT_DATA__" type="application/json">${typeof data === 'string' ? data : JSON.stringify(data)}</script><script src="/_next/static/chunks/app.js"></script></body></html>`;
const eventData = (text: string) =>
  text
    .split('\n')
    .filter((line) => line.startsWith('EVENT-DATA '))
    .map((line) => JSON.parse(line.slice('EVENT-DATA '.length)));

const lumaUrl = 'https://luma.com/k5woffsv';
const luma = (
  event: Record<string, unknown> = {},
  state: Record<string, unknown> = {},
  kind = 'event',
) => ({
  props: {
    pageProps: {
      initialData: {
        kind,
        data: {
          event: {
            api_id: 'evt-test',
            url: 'k5woffsv',
            name: 'Hot Trot',
            start_at: '2026-11-21T16:00:00.000Z',
            end_at: '2026-11-21T19:00:00.000Z',
            timezone: 'America/Los_Angeles',
            location_type: 'offline',
            geo_address_visibility: 'public',
            geo_address_info: {
              address: '500 Marina Blvd',
              full_address: '500 Marina Blvd, San Francisco, CA 94123, USA',
              mode: 'shown',
            },
            ...event,
          },
          featured_guests: [{ name: 'Guest Person', timezone: 'Asia/Seoul' }],
          guest_count: 246,
          ...state,
        },
      },
    },
  },
  buildId: 'build-1',
});
const lumaText = 'Hot Trot Marina Run Club 500 Marina Blvd San Francisco, CA';

test('Luma adapter states the embedded event time with year, offset and zone, without guest data or build churn', () => {
  const evidence = extract(platform('Hot Trot', lumaText, luma()), lumaUrl);
  assert.deepEqual(eventData(evidence.text), [
    {
      adapter: 'luma',
      from: 'embedded page data',
      title: 'Hot Trot',
      start: '2026-11-21T08:00:00-08:00',
      end: '2026-11-21T11:00:00-08:00',
      timezone: 'America/Los_Angeles',
      start_utc: '2026-11-21T16:00:00.000Z',
      end_utc: '2026-11-21T19:00:00.000Z',
      location_type: 'offline',
      location: '500 Marina Blvd, San Francisco, CA 94123, USA',
    },
  ]);
  assert.doesNotMatch(evidence.text, /Guest Person|Asia\/Seoul|build-1/);
  const churned = luma({}, { guest_count: 300 });
  churned.buildId = 'build-2';
  assert.equal(
    extract(platform('Hot Trot', lumaText, churned), lumaUrl).text,
    evidence.text,
  );
  assert.equal(
    eventData(
      extract(platform('Hot Trot', lumaText, luma()), 'https://lu.ma/k5woffsv')
        .text,
    )[0].start,
    '2026-11-21T08:00:00-08:00',
  );
  const summer = eventData(
    extract(
      platform(
        'Anniversary',
        lumaText,
        luma({
          start_at: '2024-07-20T16:30:13.754Z',
          end_at: '2024-07-20T18:00:13.754Z',
        }),
      ),
      lumaUrl,
    ).text,
  )[0];
  assert.equal(summer.start, '2024-07-20T09:30:13-07:00');
  assert.equal(summer.start_utc, '2024-07-20T16:30:13.754Z');
});

test('Luma adapter omits missing or invalid fields, skips calendars and reports malformed data', () => {
  const read = (data: unknown, url = lumaUrl) =>
    eventData(extract(platform('Hot Trot', lumaText, data), url).text);
  const hidden = read(
    luma({
      timezone: undefined,
      end_at: undefined,
      geo_address_visibility: 'guests-only',
      geo_address_info: {
        city_state: 'San Francisco, California',
        mode: 'obfuscated',
      },
    }),
  )[0];
  assert.deepEqual(hidden, {
    adapter: 'luma',
    from: 'embedded page data',
    title: 'Hot Trot',
    start_utc: '2026-11-21T16:00:00.000Z',
    location_type: 'offline',
    location: 'San Francisco, California',
    address_visibility: 'guests-only',
    omitted: ['end', 'timezone'],
  });
  const invalid = read(
    luma({ start_at: '2026-02-30T16:00:00Z', timezone: 'Not/AZone' }),
  )[0];
  assert.deepEqual(invalid.omitted, ['start', 'timezone']);
  assert.equal(invalid.start, undefined);
  assert.equal(invalid.end_utc, '2026-11-21T19:00:00.000Z');
  assert.deepEqual(read(luma({}, {}, 'calendar'), 'https://luma.com/pnr'), []);
  assert.equal(
    read(luma({ url: 'zzzzzzzz' }))[0].unavailable,
    'embedded event does not match this page',
  );
  const malformed = extract(
    platform('Hot Trot', lumaText, '{"props":'),
    lumaUrl,
  );
  assert.equal(
    eventData(malformed.text)[0].unavailable,
    'embedded page data is not valid JSON',
  );
  assert.match(malformed.text, /Page text: Hot Trot/);
  assert.throws(
    () =>
      extract(
        platform(
          'Hot Trot',
          lumaText,
          luma({ geo_address_info: { full_address: 'x'.repeat(70_000) } }),
        ),
        lumaUrl,
      ),
    /exceeds/,
  );
});

const stravaUrl = 'https://www.strava.com/clubs/2328/group_events/1546960';
const dawn = {
  occurrenceDateTime: '2026-11-24T05:45:00',
  title: 'Dawn Patrol',
  skillLevel: 'Beginner',
  terrain: 'Flat',
  sportTypes: ['Run'],
  address: 'John F Kennedy Dr San Francisco CA 94117 United States',
  description: 'Park loop at conversational pace!',
  route: null,
};
const strava = (occurrences: unknown[], id = '1546960') => ({
  props: {
    initialI18nStore: {
      en: { views: { clubs: { events: { meet_up_spot: 'Meet Up Spot' } } } },
    },
    pageProps: {
      event: {
        id,
        parentEntity: {
          name: 'Excelsior Running Club',
          id: '2328',
          location: { city: 'San Francisco', state: 'California' },
        },
        occurrences,
      },
      userAgent: 'test-agent',
    },
  },
});
const stravaText =
  'Nov 24 Tue 5:45 AM Tuesday Meet Up Spot John F Kennedy Dr San Francisco CA 94117 United States Beginner / Flat';

test('Strava adapter labels the series next occurrence as local time without inventing an offset', () => {
  const read = (data: unknown) =>
    extract(platform('Dawn Patrol', stravaText, data), stravaUrl).text;
  const text = read(strava([dawn]));
  assert.doesNotMatch(text.split('\n').at(-1) || '', /2026/);
  const [line] = eventData(text);
  assert.deepEqual(line, {
    adapter: 'strava',
    from: 'embedded page data',
    scope:
      'next occurrence shown by Strava; a recurring series advances to its next date, so this is not a confirmed date for a specific run',
    title: 'Dawn Patrol',
    start_local: '2026-11-24T05:45:00',
    location: 'John F Kennedy Dr San Francisco CA 94117 United States',
    omitted: ['timezone'],
  });
  assert.doesNotMatch(text, /test-agent|initialI18nStore/);
  assert.notEqual(
    read(strava([{ ...dawn, occurrenceDateTime: '2026-12-01T05:45:00' }])),
    text,
  );
  const missing = eventData(
    read(
      strava([
        { ...dawn, occurrenceDateTime: 'Tue 5:45 AM', address: undefined },
      ]),
    ),
  )[0];
  assert.deepEqual(missing.omitted, ['start_local', 'timezone', 'location']);
  assert.equal(missing.start_local, undefined);
  assert.equal(
    eventData(read(strava([dawn], '999')))[0].unavailable,
    'no event for this page in embedded page data',
  );
  assert.equal(
    eventData(read(strava([])))[0].unavailable,
    'no occurrence in embedded page data',
  );
  assert.equal(
    eventData(read('<!-- not json -->'))[0].unavailable,
    'embedded page data is not valid JSON',
  );
});

const heyloId = 'f74711ed-0975-4325-a96f-47a3df16b140';
const heyloUrl = `https://www.heylo.com/event/${heyloId}?context=group-page&redirect=0`;
const heylo = (event: Record<string, unknown> = {}) => ({
  props: {
    pageProps: {
      dehydratedState: {
        queries: [
          {
            queryKey: ['event', heyloId],
            state: {
              status: 'success',
              data: {
                event: {
                  eventId: heyloId,
                  name: '5k & 10k Run',
                  timestamp: 1796491800000,
                  timestampEnd: 1796499000000,
                  timezone: 'America/Los_Angeles',
                  recurrenceId: '-P5xyj3skGIVlTQWaZCc',
                  recurrenceInterval: 1,
                  recurrenceUnits: 'weeks',
                  location: '',
                  locationHidden: false,
                  locationData: {
                    label: 'Murphy Windmill, San Francisco, CA, USA',
                    lat: 37.7649078,
                    long: -122.5087051,
                  },
                  hostUserIds: { hostUser1: true },
                  ownerId: 'ownerUser1',
                  registrationTypes: {
                    going: { name: 'Going', registrationCount: 3 },
                  },
                  ...event,
                },
              },
            },
          },
          {
            queryKey: ['groupPage', 'group-1'],
            state: {
              data: {
                communityProfile: { timezone: 'America/Los_Angeles' },
                events: [{ name: '5k & 10k Run', timestamp: 1795887000000 }],
              },
            },
          },
        ],
      },
      eventId: heyloId,
    },
  },
});
// Heylo's JSON-LD dates carry no offset; they are the UTC instant.
const heyloLd =
  '<script type="application/ld+json">{"@type":"Event","name":"5k & 10k Run","startDate":"2026-12-05T17:30:00","endDate":"2026-12-05T19:30:00"}</script>';
const heyloText =
  'Sat, Dec 5, 9:30 AM - 11:30 AM Murphy Windmill, San Francisco, CA, USA';

test('Heylo adapter resolves the UTC timestamp in the event zone and keeps the offset-free JSON-LD', () => {
  const read = (data: unknown) =>
    extract(platform('5k & 10k Run', heyloText, data, heyloLd), heyloUrl).text;
  const text = read(heylo());
  assert.deepEqual(eventData(text), [
    {
      adapter: 'heylo',
      from: 'embedded page data',
      title: '5k & 10k Run',
      start: '2026-12-05T09:30:00-08:00',
      end: '2026-12-05T11:30:00-08:00',
      timezone: 'America/Los_Angeles',
      start_utc: '2026-12-05T17:30:00.000Z',
      end_utc: '2026-12-05T19:30:00.000Z',
      repeats: { every: 1, unit: 'weeks' },
      location: 'Murphy Windmill, San Francisco, CA, USA',
    },
  ]);
  assert.match(text, /"startDate":"2026-12-05T17:30:00"/);
  assert.doesNotMatch(text, /hostUser1|ownerUser1|registrationCount/);
  assert.equal(
    read(
      heylo({
        registrationTypes: { going: { name: 'Going', registrationCount: 9 } },
      }),
    ),
    text,
  );
  const hidden = eventData(read(heylo({ locationHidden: true })))[0];
  assert.equal(hidden.location, undefined);
  assert.equal(hidden.location_hidden, true);
  const missing = eventData(
    read(heylo({ timezone: undefined, timestamp: 1796491800 })),
  )[0];
  assert.deepEqual(missing.omitted, ['start', 'timezone']);
  assert.equal(missing.start, undefined);
  assert.equal(missing.end_utc, '2026-12-05T19:30:00.000Z');
  assert.equal(
    eventData(read(heylo({ eventId: 'another-event' })))[0].unavailable,
    'no event for this page in embedded page data',
  );
  assert.equal(
    eventData(read('{"props": {'))[0].unavailable,
    'embedded page data is not valid JSON',
  );
});

test('only supported event pages read embedded data, and a missing island is reported', () => {
  const data = luma();
  const other = extract(platform('Hot Trot', lumaText, data), url);
  assert.deepEqual(eventData(other.text), []);
  assert.doesNotMatch(other.text, /2026-11-21T16/);
  assert.deepEqual(
    eventData(
      extract(
        platform('Club', lumaText, heylo()),
        'https://www.heylo.com/g/group-1',
      ).text,
    ),
    [],
  );
  const bare = extract(
    `<main><h1>Dawn Patrol</h1><p>${stravaText}. Sign up to join this club event.</p></main>`,
    stravaUrl,
  );
  assert.equal(eventData(bare.text)[0].unavailable, 'no embedded page data');
  assert.equal(bare.version, 'html-evidence-v2');
});
