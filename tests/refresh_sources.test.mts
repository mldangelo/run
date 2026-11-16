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
import {
  openaiParser,
  type ParseResult,
  validateParsed,
} from '../scripts/refresh/parser.mts';
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
const parsed = (): ParseResult => ({
  facts: {
    page_status: 'usable',
    records: [
      {
        kind: 'club_event',
        title: 'Friday run',
        claims: [
          {
            field: 'location',
            value: 'Lafayette Park',
            quote: 'Lafayette Park',
          },
        ],
      },
    ],
    warnings: [],
  },
  input_tokens: 50,
  output_tokens: 20,
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
    maxParses: 5,
    model: 'test-model',
    parser: async () => parsed(),
    fetch: async () => page(),
  };
}

test('unchanged evidence, boilerplate churn and 304 reuse the parse without model calls', async (t) => {
  const options = setup(t);
  const first = await run(options);
  assert.equal(first.report.summary.model_calls, 1);
  assert.equal(first.report.rows[0].fetch, 'new');
  const second = await run({
    ...options,
    fetch: async () => page(html('2026-11-20', '999')),
  });
  assert.equal(second.report.rows[0].fetch, 'unchanged');
  assert.equal(second.report.rows[0].parse, 'cached');
  assert.equal(second.report.summary.model_calls, 0);
  const third = await run({
    ...options,
    fetch: async (_url, headers) => {
      assert.equal(headers['If-None-Match'], '"v1"');
      return page('', 304);
    },
  });
  assert.equal(third.report.rows[0].fetch, 'not_modified');
  assert.equal(third.report.summary.model_calls, 0);
  assert.equal(
    new Set([first.reportFile, second.reportFile, third.reportFile]).size,
    3,
  );
});

test('changed occurrence on a rolling URL reparses and preserves previous evidence', async (t) => {
  const options = setup(t);
  const first = await run(options);
  const second = await run({
    ...options,
    fetch: async () => page(html('2026-11-27')),
  });
  assert.equal(second.report.rows[0].fetch, 'changed');
  assert.equal(second.report.summary.model_calls, 1);
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

test('fetch failure and access challenges do not reuse stale facts or erase last usable evidence', async (t) => {
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
    assert.equal(failed.report.rows[0].facts, undefined);
    assert.equal(failed.report.summary.model_calls, 0);
  }
  const recovered = await run(options);
  assert.equal(recovered.report.rows[0].fetch, 'unchanged');
  assert.equal(
    recovered.report.rows[0].content_hash,
    first.report.rows[0].content_hash,
  );
  assert.equal(recovered.report.summary.model_calls, 0);
});

test('parse failures and budget deferrals retry unchanged evidence, successful parses stay cached', async (t) => {
  const options = setup(t);
  const pending = await run({ ...options, maxParses: 0 });
  assert.equal(pending.report.rows[0].parse, 'pending');
  const failed = await run({
    ...options,
    parser: async () => {
      throw new Error('Parser HTTP 429');
    },
  });
  assert.equal(failed.report.rows[0].parse, 'failed');
  assert.equal(failed.report.rows[0].fetch, 'unchanged');
  const retry = await run(options);
  assert.equal(retry.report.rows[0].parse, 'parsed');
  const changedModel = await run({ ...options, model: 'different-model' });
  assert.equal(changedModel.report.summary.model_calls, 1);
});

test('offline replay never invokes source or model network and keeps observation date', async (t) => {
  const options = setup(t);
  const original = await run({
    ...options,
    now: () => new Date('2026-11-16T00:00:00Z'),
  });
  const offline = await run({
    ...options,
    offline: true,
    fetch: async () => {
      throw new Error('network forbidden');
    },
    parser: async () => {
      throw new Error('model forbidden');
    },
  });
  assert.equal(offline.report.rows[0].fetch, 'offline');
  assert.equal(offline.report.rows[0].parse, 'cached');
  assert.equal(
    offline.report.rows[0].observed_at,
    original.report.rows[0].observed_at,
  );
  assert.equal(offline.report.summary.requests, 0);
  assert.equal(offline.report.summary.model_calls, 0);
});

test('discovery is bounded, one hop, same-origin and does not inherit occurrence identity', async (t) => {
  const options = setup(t);
  const seen: string[] = [];
  const report = await run({
    ...options,
    limit: 2,
    discover: 1,
    maxParses: 1,
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
  assert.equal(report.report.summary.model_calls, 1);
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
  const result = parsed();
  result.facts.records[0].claims.push({
    field: 'date',
    value: 'November 4',
    quote: 'November 4',
  });
  result.facts.warnings.push('Structured date and visible date disagree');
  validateParsed(result.facts, evidence.text);
  result.facts.records[0].claims[0].quote = 'a fabricated meeting point';
  assert.throws(
    () => validateParsed(result.facts, evidence.text),
    /unsupported/,
  );
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
  assert.equal(result.report.summary.model_calls, 0);
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

test('OpenAI adapter sends strict schema and handles completion, refusal, truncation and unsupported quotes', async () => {
  const mock =
    (body: unknown): typeof fetch =>
    async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.store, false);
      assert.equal(request.model, 'test-model');
      assert.equal(request.text.format.strict, true);
      assert.equal(request.tools, undefined);
      return new Response(JSON.stringify(body));
    };
  const body = {
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [
          { type: 'output_text', text: JSON.stringify(parsed().facts) },
        ],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
  const result = await openaiParser(
    'test-model',
    'test-key',
    mock(body),
  )(url, extract(html(), url).text);
  assert.equal(result.input_tokens, 10);
  for (const response of [
    { ...body, status: 'incomplete' },
    { ...body, output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
  ])
    await assert.rejects(
      openaiParser(
        'test-model',
        'test-key',
        mock(response),
      )(url, extract(html(), url).text),
    );
  await assert.rejects(
    openaiParser(
      'test-model',
      'test-key',
      mock(body),
    )(url, 'Unrelated evidence'),
    /unsupported/,
  );
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

test('run lock prevents overlapping writes and is released after exceptions', async (t) => {
  const options = setup(t);
  fs.mkdirSync(path.join(options.cache, 'run.lock'));
  await assert.rejects(run(options), /locked/);
  fs.rmdirSync(path.join(options.cache, 'run.lock'));
  await run(options);
  assert.equal(fs.existsSync(path.join(options.cache, 'run.lock')), false);
});
