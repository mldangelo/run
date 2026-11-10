const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validate, DATASETS } = require('../scripts/validate.mts');
const snapshot = require('./fixtures/snapshot.json');

function changed(fields) {
  const data = structuredClone(snapshot);
  for (const [field, value] of Object.entries(fields)) {
    const keys = field.split('.');
    const parent = keys.slice(0, -1).reduce((row, key) => row[key], data);
    if (value === undefined) delete parent[keys.at(-1)];
    else parent[keys.at(-1)] = value;
  }
  return data;
}
function hasError(fields, ...fragments) {
  const errors = validate(changed(fields));
  assert.ok(
    errors.some((error) => fragments.every((part) => error.includes(part))),
    JSON.stringify(errors),
  );
}
test('a minimal snapshot is valid; references identify the file and record', () => {
  assert.deepEqual(validate(structuredClone(snapshot)), []);
  assert.deepEqual(validate(changed({ 'events.0.source_id': 'src-x' })), [
    "events.json evt-a: unknown source_id 'src-x'",
  ]);
  hasError({ audits: [] }, 'clubs.json club-a', 'no audit');
  hasError(
    { 'audits.0.club_id': 'unknown' },
    'audits.json unknown',
    'unknown club_id',
  );
});
for (const [field, values] of Object.entries({
  'events.0.starts_at_local': [
    '2026-11-09',
    '2026-11-09T06:30:00',
    '2026-11-09 06:30',
    '2026-11-09T06:30Z',
    '2026-11-09T06:30-08:00',
    '2026-11-31T06:30',
    '2026-11-09T24:00',
    '2026-11-09T06:30\n',
  ],
  'events.0.checked_on': ['20261108', '2026-W45-1', '2026-02-30', '2026-11-8'],
  'schedules.0.local_time': ['6:30', '06:30\n'],
}))
  test(`strict date/time shapes: ${field}`, () => {
    for (const value of values)
      hasError({ [field]: value }, field.split('.').at(-1), 'must be a valid');
  });
for (const [name, fields, fragments] of [
  [
    'end time is strict',
    { 'events.0.ends_at_local': '2026-11-09T07:30:00' },
    ['ends_at_local'],
  ],
  [
    'end time follows start',
    { 'events.0.ends_at_local': '2026-11-09T06:30' },
    ['ends_at_local', 'must be after'],
  ],
  [
    'HTTPS sources',
    { 'sources.0.url': 'http://example.org' },
    ['sources.json src-a', 'https'],
  ],
  [
    'race ends follow starts',
    { 'races.0.end_date': '2026-11-13' },
    ['end_date', 'precedes'],
  ],
  [
    'race source deduplication',
    { 'races.0.additional_sources': ['https://example.org/race'] },
    ['more than once'],
  ],
  [
    'named race distances',
    { 'races.0.distances.0.name': ' ' },
    ['distances[0].name'],
  ],
  [
    'schedule review dates',
    { 'schedules.0.review_due': '2026-11-01' },
    ['review_due', 'is before'],
  ],
  [
    'audit review dates',
    { 'audits.0.review_due': '2026-11-01' },
    ['review_due', 'is before'],
  ],
  [
    'known time zones',
    { 'schedules.0.timezone': 'America/San_Francisco' },
    ['timezone', 'IANA'],
  ],
  [
    'canonical time zone spelling',
    { 'events.0.timezone': 'america/los_angeles' },
    ['timezone', 'IANA'],
  ],
  [
    'required keys',
    { 'events.0.source_id': undefined },
    ["missing required field 'source_id'"],
  ],
  [
    'structured run details',
    { 'events.0.run_details': null },
    ['run_details must be an object'],
  ],
  [
    'nonempty distances',
    { 'schedules.0.run_details': { distances: [] } },
    ['run_details.distances must not be empty'],
  ],
  [
    'structured location',
    { 'schedules.0.location_info': [] },
    ['location_info must be an object'],
  ],
  [
    'sourced details links',
    { 'events.0.run_details': { sources: ['http://example.org'] } },
    ['run_details.sources[0]', 'https'],
  ],
  [
    'sourced details dates',
    { 'events.0.run_details': { checked_on: 'bad' } },
    ['run_details.checked_on', 'valid date'],
  ],
  [
    'nonempty details sources',
    { 'events.0.run_details': { sources: [] } },
    ['run_details.sources must not be empty'],
  ],
])
  test(name, () => hasError(fields, ...fragments));
test('vocabularies reject unsupported values', () => {
  for (const [field, value] of Object.entries({
    'clubs.0.research_status': 'active',
    'events.0.source_type': 'organizer',
    'events.0.status': 'confirmed',
    'schedules.0.evidence': 'guess',
    'races.0.area': 'la',
  }))
    hasError({ [field]: value }, field.split('.').at(-1), value);
});
test('optional sourced run details and open-ended distances are valid', () => {
  const details = {
    distances: [{ label: '3 to 5 miles', min_miles: 3, max_miles: 5 }],
    pace: 'All paces',
    beginner_friendly: true,
    no_drop: false,
    cost: 'Free',
    rsvp: 'Required',
    access: 'Open to all',
    sources: ['https://example.org/details'],
    checked_on: '2026-11-09',
  };
  assert.deepEqual(
    validate(
      changed({
        'events.0.run_details': details,
        'schedules.0.run_details': details,
        'events.0.location_info': {
          area: 'sf',
          neighborhood: 'Mission',
          directions_query: '500 Guerrero Street',
        },
        'schedules.0.location_info': { area: 'bay' },
      }),
    ),
    [],
  );
  const distance = { label: '10+ miles', min_miles: 10, max_miles: null };
  assert.deepEqual(
    validate(changed({ 'events.0.run_details': { distances: [distance] } })),
    [],
  );
  delete distance.max_miles;
  hasError(
    { 'events.0.run_details': { distances: [distance] } },
    'missing required field',
    'max_miles',
  );
});
test('bad distance ranges, flags and labels produce all diagnostics on both kinds of run', () => {
  for (const dataset of ['events', 'schedules']) {
    const errors = validate(
      changed({
        [`${dataset}.0.run_details`]: {
          beginner_friendly: 'yes',
          no_drop: null,
          distances: [
            { label: ' ', min_miles: 5, max_miles: 3 },
            { label: 'Bad', min_miles: true, max_miles: 0 },
          ],
        },
      }),
    ).join('\n');
    for (const fragment of [
      'beginner_friendly must be true or false',
      'no_drop must be true or false',
      'distances[0].label must not be empty',
      'must not exceed',
      'distances[1].min_miles must be a finite positive number',
      'distances[1].max_miles must be a finite positive number',
    ])
      assert.ok(errors.includes(fragment), errors);
  }
});
test('Marin towns must use the marin area; Marin landmarks may too', () => {
  const sausalito = { name: 'Sausalito', area: 'bay', includes: 'Sausalito.' };
  const errors = validate(
    changed({
      'races.0.city': 'Mill Valley',
      'races.0.area': 'bay',
      neighborhoods: [...snapshot.neighborhoods, sausalito],
    }),
  );
  assert.deepEqual(errors.sort(), [
    "neighborhoods.json Sausalito: name 'Sausalito' is in Marin County, so area must be 'marin', got 'bay'",
    "races.json race-a: city 'Mill Valley' is in Marin County, so area must be 'marin', got 'bay'",
  ]);
  const marin = {
    'races.0.city': 'Mill Valley',
    'races.0.area': 'marin',
    neighborhoods: [...snapshot.neighborhoods, { ...sausalito, area: 'marin' }],
    'events.0.location_info': { area: 'marin', neighborhood: 'Sausalito' },
  };
  assert.deepEqual(validate(changed(marin)), []);
  assert.deepEqual(
    validate(changed({ ...marin, 'races.0.city': 'Marin Headlands' })),
    [],
  );
});
test('neighborhoods must be listed and match their area without duplicate diagnostics', () => {
  assert.deepEqual(
    validate(
      changed({
        'events.0.location_info': { area: 'sf', neighborhood: 'Mision' },
        'schedules.0.location_info': { area: 'sf', neighborhood: 'Oakland' },
      }),
    ),
    [
      "schedules.json sch-a: location_info.area must be 'bay' to match neighborhood 'Oakland', got 'sf'",
      "events.json evt-a: location_info.neighborhood 'Mision' is not listed in neighborhoods.json",
    ],
  );
  hasError(
    { 'events.0.location_info': { neighborhood: 'Mission' } },
    "must be 'sf'",
    'got None',
  );
  const errors = validate(
    changed({
      'events.0.location_info': { area: ['sf'], neighborhood: 'Mission' },
    }),
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /location_info.area/);
  assert.deepEqual(validate(changed({ neighborhoods: { Mission: 'sf' } })), [
    'neighborhoods.json: expected an array of records, got object',
  ]);
  const neighborhoods = [
    ...snapshot.neighborhoods,
    { name: 'Mission', area: 'la', includes: '' },
  ];
  for (const field of ['duplicate name', 'area', 'includes'])
    hasError({ neighborhoods }, 'neighborhoods.json Mission', field);
  hasError(
    {
      'events.0.location_info': {
        area: 'unknown',
        neighborhood: '',
        directions_query: null,
      },
    },
    'location_info.directions_query must be a string',
  );
});
test('published Meetup events need a durable event permalink', () => {
  const data = changed({
    'sources.0.url': 'https://www.meetup.com/find/us--ca--alameda/running/',
  });
  assert.match(
    validate(data).join('\n'),
    /event permalink, not a changing search page/,
  );
  data.events[0].status = 'unconfirmed';
  assert.deepEqual(validate(data), []);
  data.events[0].status = 'published';
  data.sources[0].url = 'https://www.meetup.com/club/events/123/';
  assert.deepEqual(validate(data), []);
});
test('text checks recurse into nested records and distinguish short repeated fragments', () => {
  hasError(
    { 'schedules.0.notes': ' Leading space.' },
    'notes has leading or trailing whitespace',
  );
  hasError(
    { 'races.0.distances.0.name': '5K ' },
    'distances[0].name has leading or trailing whitespace',
  );
  const sentence = 'Confirm the start with the organizer.';
  assert.deepEqual(
    validate(
      changed({
        'races.0.notes': `Flat course. ${sentence} ${sentence}`,
        'events.0.notes': 'TBD. TBD.',
      }),
    ),
    [`races.json race-a: notes repeats the sentence '${sentence}'`],
  );
});
test('malformed rows, missing datasets, duplicate IDs and file order remain explicit', () => {
  for (const [field, value, fragment] of [
    ['events', [...snapshot.events, 'bad'], 'events.json [1]'],
    ['schedules.0.days', 'tuesday', 'days'],
    ['races.0.distances', [null], 'distances[0]'],
    ['sources.0.roles', null, 'roles'],
    ['clubs.0.name', 7, 'name'],
    ['audits.0.reference_source_ids', [['src-a']], 'reference_source_ids'],
  ])
    hasError({ [field]: value }, fragment);
  hasError(
    { events: [snapshot.events[0], structuredClone(snapshot.events[0])] },
    'duplicate id',
  );
  assert.ok(validate({ clubs: {} }).includes('races.json: dataset is missing'));
  const errors = validate(
    changed({
      'races.0.area': 'la',
      'clubs.0.research_status': 'active',
      'events.0.source_id': 'src-x',
    }),
  );
  assert.deepEqual(
    errors.map((error) => error.split(' ')[0]),
    ['clubs.json', 'events.json', 'races.json'],
  );
});
test('validation CLI summarizes valid data and prints every error for invalid data', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-validate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  const write = (data) => {
    for (const name of DATASETS)
      fs.writeFileSync(
        path.join(root, 'data', `${name}.json`),
        JSON.stringify(data[name]),
      );
  };
  const run = () =>
    spawnSync(
      process.execPath,
      [
        '-e',
        'process.exitCode = require(process.argv[1]).main(process.argv[2])',
        path.resolve(__dirname, '../scripts/validate.mts'),
        root,
      ],
      { encoding: 'utf8' },
    );
  write(snapshot);
  let result = run();
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(
    result.stdout,
    'Valid: 1 clubs, 1 sources, 1 audits, 1 patterns, 1 dated events.\nValid: 1 race editions, 2 neighborhoods.\nValid: 1 club merchandise research records.\n',
  );
  const data = structuredClone(snapshot);
  data.events[0].source_id = 'src-x';
  data.races[0].end_date = '2026-11-13';
  write(data);
  result = run();
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /events.json evt-a: unknown source_id 'src-x'/);
  assert.match(result.stderr, /races.json race-a: end_date/);
  assert.match(result.stderr, /2 validation error\(s\) found/);
  fs.writeFileSync(path.join(root, 'data/events.json'), '{bad json');
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /events.json: could not be read as JSON/);
  fs.unlinkSync(path.join(root, 'data/events.json'));
  assert.equal(run().status, 1);
});
test('validation handles wrong JSON types and missing fields across every dataset', () => {
  for (const value of [null, false, 1, 'bad', []])
    assert.ok(validate(value).length);
  for (const name of DATASETS) {
    for (const value of [null, false, 1, 'bad', {}, []]) {
      const data = structuredClone(snapshot);
      data[name] = value;
      assert.doesNotThrow(() => validate(data));
    }
    for (const key of Object.keys(snapshot[name][0])) {
      for (const value of [null, false, 1, ' ', [], {}]) {
        const data = structuredClone(snapshot);
        data[name][0][key] = value;
        assert.doesNotThrow(
          () => validate(data),
          `${name}.${key}: ${JSON.stringify(value)}`,
        );
      }
    }
  }
});

test('merchandise keeps unavailable stores with evidence and rejects missing evidence', () => {
  const fields = {
    'merchandise.0.result': 'store_found',
    'merchandise.0.links': [
      {
        label: 'Club A Store',
        url: 'https://example.org/store',
        kind: 'store',
        scope: 'club',
        availability: 'closed',
        authority: 'club',
        items: ['tees'],
        evidence_urls: ['https://example.org/club'],
        notes: 'Store states orders are closed.',
      },
    ],
  };
  assert.deepEqual(validate(changed(fields)), []);
  fields['merchandise.0.links'][0].evidence_urls = [];
  hasError(
    fields,
    'merchandise.json club-a',
    'evidence_urls',
    'must not be empty',
  );
});
test('merchandise identity leads cannot be classified as found stores', () => {
  for (const [key, value] of [
    ['authority', 'secondary'],
    ['scope', 'other_chapter'],
  ]) {
    const link = {
      label: 'Store lead',
      url: 'https://example.org/store',
      kind: 'store',
      scope: 'club',
      availability: 'not_verified',
      authority: 'club',
      items: [],
      evidence_urls: ['https://example.org/lead'],
      notes: 'Affiliation unresolved.',
      [key]: value,
    };
    const fields = {
      'merchandise.0.result': 'store_found',
      'merchandise.0.links': [link],
    };
    hasError(fields, 'merchandise.json club-a', 'must remain lead_only');
    fields['merchandise.0.result'] = 'lead_only';
    assert.deepEqual(validate(changed(fields)), []);
  }
});
test('merchandise rejects bad references, duplicate records and insecure URLs', () => {
  const record = {
    ...snapshot.merchandise[0],
    club_id: 'unknown-club',
    checked_urls: ['http://example.org/shop'],
  };
  const fields = { merchandise: [record, structuredClone(record)] };
  for (const fragments of [
    ['unknown club_id'],
    ['duplicate club_id'],
    ['checked_urls[0]', 'must use https'],
  ])
    hasError(fields, 'merchandise.json unknown-club', ...fragments);
});
test('merchandise requires search provenance and consistent results', () => {
  const fields = {
    'merchandise.0.search_queries': [],
    'merchandise.0.links': [{ label: 'A lead' }],
  };
  hasError(
    fields,
    'merchandise.json club-a',
    'search_queries',
    'must not be empty',
  );
  hasError(
    fields,
    'merchandise.json club-a',
    'no_public_link_found must not contain',
  );
  fields['merchandise.0.result'] = 'merch_info_only';
  fields['merchandise.0.links'] = [];
  hasError(fields, 'merchandise.json club-a', 'links must not be empty');
});

test('race registration requires provenance and valid local boundaries, including distance overrides', () => {
  const registration = {
    status: 'open',
    source_url: 'https://example.org/registration',
    url: 'https://example.org/enter',
    access_method: 'http',
    checked_on: '2026-11-09',
    review_due: '2026-11-16',
    opens_at: '2026-10-01',
    closes_at: '2026-11-13T22:00',
    notes:
      'Current-edition event card offers registration; no conflicts observed.',
  };
  const data = changed({
    'races.0.registration': registration,
    'races.0.distances.0.registration': structuredClone(registration),
  });
  assert.deepEqual(validate(data), []);
  for (const [key, value, message] of [
    ['status', 'available', 'registration.status'],
    ['source_url', 'http://example.org', 'must use https'],
    ['closes_at', '2026-11-13T22:00Z', 'valid local date and time'],
    ['opens_at', '2026-02-30', 'valid date'],
    ['closes_at', '2026-09-30', 'closes_at precedes opens_at'],
    ['review_due', '2026-11-08', 'is before'],
    ['review_due', '2026-12-01', 'within 14 days'],
  ]) {
    const original = registration[key];
    registration[key] = value;
    assert.ok(
      validate(data).some((error) => error.includes(message)),
      message,
    );
    registration[key] = original;
  }
  delete data.races[0].distances[0].registration.checked_on;
  assert.ok(
    validate(data).some((error) =>
      error.includes('distances[0].registration.checked_on'),
    ),
  );
  data.races[0].registration = null;
  assert.ok(
    validate(data).some((error) =>
      error.includes('registration must be an object'),
    ),
  );
});
test('research logs check dates, source references and inspection methods', () => {
  const entry = {
    checked_on: '2026-11-08',
    summary: 'Club page has a recurring run.',
    next_steps: 'Check the event calendar before the next run.',
    source_checks: [
      { source_id: 'src-a', method: 'page', notes: 'Weekly schedule listed.' },
    ],
  };
  assert.deepEqual(validate(changed({ 'audits.0.research_log': [entry] })), []);
  hasError(
    {
      'audits.0.research_log': [
        {
          ...entry,
          source_checks: [
            { source_id: 'src-missing', method: 'guessed', notes: 'x' },
          ],
        },
      ],
    },
    'audits.json club-a',
    "unknown research_log[0].source_checks[0].source_id 'src-missing'",
  );
  hasError(
    {
      'audits.0.research_log': [
        {
          ...entry,
          source_checks: [{ ...entry.source_checks[0], method: 'guessed' }],
        },
      ],
    },
    'research_log[0].source_checks[0].method',
  );
  hasError(
    { 'audits.0.research_log': [{ ...entry, checked_on: '2026-02-31' }] },
    'research_log[0].checked_on',
  );
  hasError(
    { 'audits.0.research_log': [{ ...entry, checked_on: '2026-11-09' }] },
    'must not be after audit checked_on 2026-11-08',
  );
  hasError(
    {
      'audits.0.research_log': [entry],
      'audits.0.reference_source_ids': [],
    },
    'must also be listed in reference_source_ids',
  );
});
test('an event review flag is an optional boolean', () => {
  for (const value of [true, false])
    assert.deepEqual(validate(changed({ 'events.0.needs_review': value })), []);
  for (const value of [null, 'true', 1])
    hasError(
      { 'events.0.needs_review': value },
      'events.json evt-a',
      'needs_review must be true or false',
    );
});
test('duplicate JSON fields fail with every record and field instead of overwriting data', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-duplicates-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  for (const [name, rows] of Object.entries(snapshot))
    fs.writeFileSync(
      path.join(root, 'data', `${name}.json`),
      JSON.stringify(rows),
    );
  fs.writeFileSync(
    path.join(root, 'data/events.json'),
    '[{"id": "evt-a", "run_details": {}, "run_details": {"pace": "Easy", "pace": "Fast"}}, {"id": "evt-b", "notes": "a", "tags": ["x", {"k": 1, "k": 2}]}]',
  );
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      'process.exitCode = require(process.argv[1]).main(process.argv[2])',
      path.resolve(__dirname, '../scripts/validate.mts'),
      root,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^events\.json: could not be read as JSON:/);
  for (const part of [
    "duplicate JSON key 'run_details' in evt-a (run_details)",
    "duplicate JSON key 'pace' in evt-a (run_details.pace)",
    "duplicate JSON key 'k' in evt-b (tags[1].k)",
  ])
    assert.ok(result.stderr.includes(part), result.stderr);
});
test('research notes on runs are optional text kept apart from runner notes', () => {
  for (const field of [
    'events.0.research_notes',
    'schedules.0.research_notes',
  ]) {
    assert.deepEqual(
      validate(changed({ [field]: 'Signed-in event card.' })),
      [],
    );
    hasError({ [field]: 7 }, 'research_notes must be a string');
  }
});

test('registration rejects unknown fields, empty links and statuses that contradict their dates', () => {
  const registration = {
    status: 'open',
    source_url: 'https://example.org/registration',
    access_method: 'http',
    checked_on: '2026-11-09',
    review_due: '2026-11-16',
    notes: 'Entries are open.',
  };
  const check = (fields, message) => {
    const errors = validate(
      changed({ 'races.0.registration': { ...registration, ...fields } }),
    );
    assert.ok(
      errors.some((error) => error.includes(message)),
      `${message}: ${JSON.stringify(errors)}`,
    );
  };
  assert.deepEqual(
    validate(changed({ 'races.0.registration': registration })),
    [],
  );
  check({ closes_on: '2026-11-12' }, 'closes_on is not a registration field');
  check({ url: '' }, 'registration.url');
  check({ opens_at: '2026-11-20' }, 'is open but opens_at 2026-11-20 is after');
  check(
    { status: 'not_yet_open', opens_at: '2026-11-01' },
    'is not_yet_open but opens_at 2026-11-01 precedes',
  );
  check(
    { status: 'waitlist', closes_at: '2026-11-08T12:00' },
    'is waitlist but closes_at 2026-11-08T12:00 precedes',
  );
  check(
    { closes_at: '2026-11-15T09:00' },
    'closes_at 2026-11-15T09:00 is after the race ends on 2026-11-14',
  );
});
