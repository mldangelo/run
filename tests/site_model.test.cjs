const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../site/model.js');
test('search combines words across fields in any order and requires every word', () => {
  const fields = ['Gr8’tr U × Rafiki Run Club', 'Crane Cove Park'];
  assert.equal(model.matchesQuery('Rafiki Crane', ...fields), true);
  assert.equal(model.matchesQuery('cove rafiki', ...fields), true);
  assert.equal(model.matchesQuery('rafiki kezar', ...fields), false);
  assert.equal(model.matchesQuery('rafik', ...fields), true);
});

test('search tolerates punctuation, repeated whitespace and Unicode accents', () => {
  assert.equal(
    model.matchesQuery('  CAFE   runners  5k  ', 'Café Runner’s Club — 5K'),
    true,
  );
  assert.equal(model.matchesQuery('gr8tr rafiki', 'Gr8’tr U × Rafiki'), true);
  assert.equal(model.matchesQuery("Runner's", 'Runner’s Club'), true);
  assert.equal(model.matchesQuery('café-run', 'Cafe Run'), true);
  assert.equal(model.matchesQuery('cafe', 'Cafe\u0301 Run'), true);
  assert.equal(model.matchesQuery('10k', '5K Run'), false);
});

test('empty searches match all listings and absent fields cannot match words', () => {
  assert.equal(model.matchesQuery('', 'Run', undefined), true);
  assert.equal(model.matchesQuery('   —  ', 'Run'), true);
  assert.equal(model.matchesQuery('undefined', undefined), false);
  assert.equal(model.matchesQuery('run'), false);
});

test('location filters preserve unknowns and require both selected fields', () => {
  const sf = {
    location_info: { area: 'sf', neighborhood: 'Mission / Dolores' },
  };
  const bay = { location_info: { area: 'bay' } };
  assert.equal(
    model.runLocationMatches(sf, {
      area: 'sf',
      neighborhood: 'Mission / Dolores',
    }),
    true,
  );
  assert.equal(model.runLocationMatches(sf, { area: 'bay' }), false);
  assert.equal(
    model.runLocationMatches(bay, { area: 'bay', neighborhood: 'unknown' }),
    true,
  );
  assert.equal(model.runLocationMatches({}, { area: 'sf' }), false);
  assert.equal(
    model.runLocationMatches({}, { area: 'unknown', neighborhood: 'unknown' }),
    true,
  );
});
const event = {
  starts_at_local: '2026-11-09T06:30',
  timezone: 'America/Los_Angeles',
  status: 'published',
};
const filter = {
  period: 'upcoming',
  status: 'published',
  month: 'all',
  day: 'all',
  time: 'all',
};
test('run detail filters distinguish missing, positive and negative beginner information', () => {
  assert.equal(model.runDetailsMatch({}, { beginner: 'unknown' }), true);
  assert.equal(model.runDetailsMatch({}, { beginner: 'welcome' }), false);
  assert.equal(
    model.runDetailsMatch(
      { run_details: { beginner_friendly: false } },
      { beginner: 'unknown' },
    ),
    false,
  );
  assert.equal(
    model.runDetailsMatch(
      { run_details: { beginner_friendly: true } },
      { beginner: 'welcome' },
    ),
    true,
  );
  assert.equal(model.runDetailsMatch({}), true);
});

test('run distance bands match overlapping sourced ranges and preserve unknowns', () => {
  const range = {
    run_details: {
      distances: [{ label: '2–4 miles', min_miles: 2, max_miles: 4 }],
    },
  };
  assert.equal(model.runDetailsMatch(range, { distance: 'up_to_3' }), true);
  assert.equal(model.runDetailsMatch(range, { distance: '3_to_5' }), true);
  assert.equal(model.runDetailsMatch(range, { distance: 'over_5' }), false);
  assert.equal(model.runDetailsMatch(range, { distance: 'unknown' }), false);
  assert.equal(model.runDetailsMatch({}, { distance: 'unknown' }), true);
  assert.equal(model.runDetailsMatch({}, { distance: '3_to_5' }), false);
  const exact = (miles) => ({
    run_details: {
      distances: [{ label: 'Run', min_miles: miles, max_miles: miles }],
    },
  });
  assert.equal(model.runDetailsMatch(exact(3), { distance: '3_to_5' }), true);
  assert.equal(model.runDetailsMatch(exact(5), { distance: 'over_5' }), false);
  assert.equal(model.runDetailsMatch(exact(5.1), { distance: 'over_5' }), true);
  const openEnded = {
    run_details: {
      distances: [{ label: '4+ miles', min_miles: 4, max_miles: null }],
    },
  };
  assert.equal(
    model.runDetailsMatch(openEnded, { distance: 'up_to_3' }),
    false,
  );
  assert.equal(model.runDetailsMatch(openEnded, { distance: '3_to_5' }), true);
  assert.equal(model.runDetailsMatch(openEnded, { distance: 'over_5' }), true);
});
test('upcoming comparisons use San Francisco time, independent of the viewer timezone', () => {
  assert.equal(
    model.eventMatches(event, filter, new Date('2026-11-09T14:29:00Z')),
    true,
  );
  assert.equal(
    model.eventMatches(event, filter, new Date('2026-11-09T14:31:00Z')),
    false,
  );
  assert.equal(
    model.eventMatches(
      event,
      { ...filter, period: 'past' },
      new Date('2026-11-09T14:31:00Z'),
    ),
    true,
  );
});
test('San Francisco offset respects daylight saving time', () => {
  assert.equal(
    model.localMinute(new Date('2026-06-01T14:00:00Z')),
    '2026-06-01T07:00',
  );
  assert.equal(
    model.localMinute(new Date('2026-11-09T14:00:00Z')),
    '2026-11-09T06:00',
  );
});
test('filters distinguish published, unconfirmed and cancelled events', () => {
  const now = new Date('2026-11-09T14:00:00Z');
  assert.equal(
    model.eventMatches({ ...event, status: 'unconfirmed' }, filter, now),
    false,
  );
  assert.equal(
    model.eventMatches(
      { ...event, status: 'unconfirmed' },
      { ...filter, status: 'all' },
      now,
    ),
    true,
  );
  assert.equal(
    model.eventMatches(
      { ...event, status: 'cancelled' },
      { ...filter, status: 'all' },
      now,
    ),
    false,
  );
});
test('morning filter includes an event with a morning alternative start', () => {
  const e = {
    ...event,
    starts_at_local: '2026-11-09T12:00',
    meeting_options: [{ local_time: '11:45' }],
  };
  assert.equal(
    model.eventMatches(
      e,
      { ...filter, time: 'am' },
      new Date('2026-11-09T14:00:00Z'),
    ),
    true,
  );
  assert.equal(
    model.eventMatches(
      e,
      { ...filter, time: 'pm' },
      new Date('2026-11-09T14:00:00Z'),
    ),
    true,
  );
  assert.equal(
    model.eventMatches(
      e,
      { ...filter, time: 'am' },
      new Date('2026-11-09T19:50:00Z'),
    ),
    false,
  );
});
test('simultaneous meeting places remain distinct while identical starts are deduplicated', () => {
  const record = {
    ...event,
    location: 'Primary place',
    meeting_options: [
      { local_time: '06:30', location: 'Alternate place' },
      { local_time: '06:30', location: 'Primary place' },
    ],
  };
  assert.deepEqual(model.eventStarts(record), [
    { local_time: '06:30', location: 'Primary place' },
    { local_time: '06:30', location: 'Alternate place' },
  ]);
});

test('day and time filters do not turn recurring patterns into dated events', () => {
  const p = { days: ['monday'], local_time: '06:30' };
  assert.equal(model.patternMatches(p, { day: 'monday', time: 'am' }), true);
  assert.equal(model.patternMatches(p, { day: 'tuesday', time: 'am' }), false);
  assert.equal(
    model.patternMatches(
      { ...p, local_time: null },
      { day: 'monday', time: 'am' },
    ),
    false,
  );
  assert.equal(
    model.patternMatches(
      { ...p, local_time: null },
      { day: 'monday', time: 'unknown' },
    ),
    true,
  );
});

test('today and tomorrow are determined in San Francisco across year boundaries', () => {
  const nextYear = { ...event, starts_at_local: '2027-01-01T06:30' };
  const now = new Date('2027-01-01T07:30:00Z'); // still December 31 in San Francisco
  assert.equal(
    model.eventMatches(nextYear, { ...filter, period: 'tomorrow' }, now),
    true,
  );
  assert.equal(
    model.eventMatches(nextYear, { ...filter, period: 'today' }, now),
    false,
  );
});

test('race filters preserve date-only and multi-day listings in San Francisco time', () => {
  const race = {
    date: '2027-03-19',
    end_date: '2027-03-21',
    area: 'bay',
    status: 'scheduled',
    distances: [{ name: '5K', category: '5k', start_time: null }],
  };
  const filter = {
    period: 'upcoming',
    month: 'all',
    day: 'all',
    time: 'all',
    area: 'all',
    distance: 'all',
  };
  assert.equal(
    model.raceMatches(race, filter, new Date('2027-03-22T06:30:00Z')),
    true,
  );
  assert.equal(
    model.raceMatches(race, filter, new Date('2027-03-22T07:30:00Z')),
    false,
  );
  assert.equal(
    model.raceMatches(
      race,
      { ...filter, day: 'sunday', time: 'unknown' },
      new Date('2027-03-18T20:00:00Z'),
    ),
    true,
  );
  assert.equal(
    model.raceMatches(
      race,
      { ...filter, day: 'monday' },
      new Date('2027-03-18T20:00:00Z'),
    ),
    false,
  );
  assert.equal(
    model.raceMatches(
      race,
      { ...filter, distance: 'half' },
      new Date('2027-03-18T20:00:00Z'),
    ),
    false,
  );
});

test('race distance and time filters must match the same option', () => {
  const race = {
    date: '2027-01-10',
    end_date: null,
    status: 'scheduled',
    area: 'sf',
    distances: [
      { name: '5K', category: '5k', start_time: '07:20' },
      { name: '10K', category: '10k', start_time: '13:00' },
    ],
  };
  const filter = {
    period: 'all',
    month: 'all',
    day: 'all',
    time: 'am',
    area: 'sf',
    distance: '10k',
  };
  assert.equal(model.raceMatches(race, filter, new Date()), false);
  assert.equal(
    model.raceMatches(race, { ...filter, distance: '5k' }, new Date()),
    true,
  );
  assert.equal(
    model.raceMatches(
      { ...race, status: 'cancelled' },
      { ...filter, distance: '5k' },
      new Date(),
    ),
    false,
  );
});

test('race format filter distinguishes documented small-group runs from unclassified listings', () => {
  const race = {
    date: '2027-01-10',
    end_date: null,
    status: 'scheduled',
    area: 'sf',
    format: 'small_group',
    distances: [{ name: '5K', category: '5k', start_time: '07:30' }],
  };
  const filter = {
    period: 'all',
    month: 'all',
    day: 'all',
    time: 'all',
    area: 'all',
    distance: 'all',
    format: 'small_group',
  };
  assert.equal(model.raceMatches(race, filter, new Date()), true);
  assert.equal(
    model.raceMatches({ ...race, format: undefined }, filter, new Date()),
    false,
  );
  assert.equal(
    model.raceMatches(
      { ...race, format: undefined },
      { ...filter, format: 'other' },
      new Date(),
    ),
    true,
  );
  assert.equal(
    model.raceMatches(race, { ...filter, format: 'other' }, new Date()),
    false,
  );
});

test('calendar helpers count San Francisco days across month and DST boundaries', () => {
  assert.equal(model.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(model.addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(model.daysBetween('2026-11-08', '2026-11-22'), 14);
  assert.equal(model.daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(
    model.latestDate(['2026-11-01', null, '2026-11-08']),
    '2026-11-08',
  );
  assert.equal(model.latestDate([]), null);
});

test('club area filter treats "San Francisco / Bay Area" as both areas', () => {
  const sf = { geography: 'San Francisco' };
  const both = { geography: 'San Francisco / Bay Area' };
  const bay = { geography: 'Bay Area' };
  const unknown = { geography: 'Unknown' };
  const matches = (club, area) => model.clubMatches(club, { area });
  assert.deepEqual(
    [sf, both, bay, unknown].map((club) => matches(club, 'sf')),
    [true, true, false, false],
  );
  assert.deepEqual(
    [sf, both, bay, unknown].map((club) => matches(club, 'bay')),
    [false, true, true, false],
  );
  assert.deepEqual(
    [sf, both, bay, unknown, {}].map((club) => matches(club, 'unknown')),
    [false, false, false, true, true],
  );
  assert.equal(matches(unknown, 'all'), true);
});

test('seasonal patterns include future seasons and inclusive bounds, but exclude expired and superseded schedules', () => {
  const pattern = {
    days: ['saturday'],
    local_time: '08:00',
    timezone: 'America/Los_Angeles',
    valid_from: '2026-11-21',
    valid_until: '2027-02-07',
  };
  const filters = { day: 'all', time: 'all' };
  const check = (iso) => new Date(iso);
  const before = check('2026-11-21T07:30:00Z'); // still November 20 in SF
  const firstDay = check('2026-11-21T08:30:00Z');
  const lastDay = check('2027-02-08T07:30:00Z');
  const after = check('2027-02-08T08:30:00Z');
  assert.equal(model.patternState(pattern, before), 'future');
  assert.equal(model.patternMatches(pattern, filters, before), true);
  assert.equal(model.patternState(pattern, firstDay), 'current');
  assert.equal(model.patternState(pattern, lastDay), 'current');
  assert.equal(model.patternState(pattern, after), 'expired');
  assert.equal(model.patternMatches(pattern, filters, after), false);
  assert.equal(
    model.patternMatches(
      { ...pattern, status: 'superseded' },
      filters,
      firstDay,
    ),
    false,
  );
});

test('freshness counts stale and missing dates instead of treating the newest date as representative', () => {
  assert.deepEqual(
    model.freshnessSummary(
      ['2026-11-09', '2026-10-26', '2026-10-25', null],
      '2026-11-09',
      14,
    ),
    { total: 4, stale: 1, unknown: 1 },
  );
  assert.deepEqual(model.freshnessSummary([], '2026-11-09', 14), {
    total: 0,
    stale: 0,
    unknown: 0,
  });
});

test('date-inclusive race filter does not treat a first wave as an end time', () => {
  const race = {
    date: '2026-11-14',
    status: 'scheduled',
    area: 'sf',
    notes: 'First wave at 7:30; later waves at 8:00 and 8:30.',
    distances: [{ name: '5K', category: '5k', start_time: '07:30' }],
  };
  const filters = {
    period: 'upcoming',
    month: 'all',
    day: 'all',
    time: 'all',
    area: 'all',
    distance: 'all',
    format: 'all',
  };
  assert.equal(
    model.raceMatches(race, filters, new Date('2026-11-14T16:00:00Z')),
    true,
  );
  assert.equal(
    model.raceMatches(race, filters, new Date('2026-11-15T08:00:00Z')),
    false,
  );
});

test('a club meets where its current patterns and published runs are, most frequent first', () => {
  const now = new Date('2026-11-09T20:00:00Z');
  const at = (neighborhood, area = 'sf') => ({
    location_info: { area, neighborhood },
  });
  const schedules = [
    { club_id: 'a', ...at('Marina / Presidio') },
    { club_id: 'a', ...at('Golden Gate Park / Panhandle') },
    { club_id: 'a', ...at('Marina / Presidio') },
    { club_id: 'a', ...at('Mission / Dolores'), status: 'superseded' },
    { club_id: 'a', ...at('Castro'), valid_until: '2026-10-31' },
    { club_id: 'a', location_info: { area: 'sf' } },
    { club_id: 'b', ...at('Noe Valley') },
  ];
  const events = [
    { club_id: 'a', ...at('Embarcadero'), status: 'published' },
    {
      club_id: 'a',
      ...at('Golden Gate Park / Panhandle'),
      status: 'published',
    },
    { club_id: 'a', ...at('San Jose', 'bay'), status: 'unconfirmed' },
    { club_id: 'a', ...at('Noe Valley'), status: 'cancelled' },
  ];
  const places = model.clubPlaces('a', schedules, events, now);
  // Superseded and expired patterns, unconfirmed leads and cancelled runs
  // do not count.
  assert.deepEqual(places, {
    neighborhoods: [
      'Golden Gate Park / Panhandle',
      'Marina / Presidio',
      'Embarcadero',
    ],
    areas: ['sf'],
  });
  assert.deepEqual(model.clubPlaces('c', schedules, events, now), {
    neighborhoods: [],
    areas: [],
  });
  const club = { geography: 'San Francisco' };
  const matches = (filter, list) => model.clubMatches(club, filter, list);
  assert.equal(
    matches({ area: 'all', neighborhood: 'Embarcadero' }, places),
    true,
  );
  assert.equal(
    matches({ area: 'sf', neighborhood: 'Noe Valley' }, places),
    false,
  );
  assert.equal(
    matches({ area: 'all', neighborhood: 'unknown' }, places),
    false,
  );
  assert.equal(matches({ area: 'all', neighborhood: 'unknown' }, {}), true);
  // Callers without a neighborhood filter or places keep the area behavior.
  assert.equal(model.clubMatches(club, { area: 'sf' }), true);
});

test('a club is in an area where its geography or one of its runs is', () => {
  const bayClub = { geography: 'Bay Area' };
  const sfRuns = { neighborhoods: ['Embarcadero'], areas: ['sf'] };
  assert.equal(
    model.clubMatches(
      bayClub,
      { area: 'sf', neighborhood: 'Embarcadero' },
      sfRuns,
    ),
    true,
  );
  assert.equal(model.clubMatches(bayClub, { area: 'bay' }, sfRuns), true);
  const sfClub = { geography: 'San Francisco' };
  const sanJose = { neighborhoods: ['San Jose'], areas: ['bay'] };
  assert.equal(
    model.clubMatches(
      sfClub,
      { area: 'bay', neighborhood: 'San Jose' },
      sanJose,
    ),
    true,
  );
  assert.equal(
    model.clubMatches({ geography: 'Unknown' }, { area: 'unknown' }, sanJose),
    false,
  );
  assert.equal(
    model.clubMatches({ geography: 'Unknown' }, { area: 'unknown' }, {}),
    true,
  );
});

test('registration becomes unknown after review dates and published boundaries in Pacific time', () => {
  const registration = {
    status: 'open',
    checked_on: '2026-11-09',
    review_due: '2026-11-16',
    closes_at: '2026-11-14T00:00',
  };
  assert.equal(
    model.registrationState(registration, new Date('2026-11-14T07:59:00Z')),
    'open',
  );
  assert.equal(
    model.registrationState(registration, new Date('2026-11-14T08:00:00Z')),
    'unknown',
  );
  assert.equal(
    model.registrationState(
      { ...registration, closes_at: '2026-11-14' },
      new Date('2026-11-15T07:59:00Z'),
    ),
    'open',
  );
  assert.equal(
    model.registrationState(
      { ...registration, closes_at: '2026-11-14' },
      new Date('2026-11-15T08:00:00Z'),
    ),
    'unknown',
  );
  assert.equal(
    model.registrationState(
      { ...registration, closes_at: undefined },
      new Date('2026-11-17T08:00:00Z'),
    ),
    'unknown',
  );
  const future = {
    ...registration,
    status: 'not_yet_open',
    opens_at: '2026-11-10T13:13',
    closes_at: undefined,
  };
  assert.equal(
    model.registrationState(future, new Date('2026-11-10T21:12:00Z')),
    'not_yet_open',
  );
  assert.equal(
    model.registrationState(future, new Date('2026-11-10T21:13:00Z')),
    'unknown',
  );
  assert.equal(
    model.registrationState(
      { ...future, opens_at: '2026-11-10' },
      new Date('2026-11-10T08:00:00Z'),
    ),
    'unknown',
  );
  assert.equal(model.registrationState(undefined), 'unknown');
});

test('registration filters match the same distance and time, preserve mixed availability and ignore past/cancelled entry offers', () => {
  const now = new Date('2026-11-09T20:00:00Z');
  const registration = {
    status: 'open',
    checked_on: '2026-11-09',
    review_due: '2026-11-16',
  };
  const race = {
    date: '2026-11-14',
    status: 'scheduled',
    area: 'sf',
    registration,
    distances: [
      { name: '5K', category: '5k', start_time: '08:00' },
      {
        name: 'Half marathon',
        category: 'half',
        start_time: '13:00',
        registration: { ...registration, status: 'sold_out' },
      },
    ],
  };
  const filter = {
    period: 'all',
    month: 'all',
    day: 'all',
    time: 'all',
    area: 'all',
    distance: 'all',
    registration: 'open',
  };
  assert.equal(model.raceRegistration(race, filter, now), 'mixed');
  assert.equal(model.raceMatches(race, filter, now), true);
  assert.equal(
    model.raceMatches(race, { ...filter, registration: 'mixed' }, now),
    true,
  );
  assert.equal(
    model.raceMatches(race, { ...filter, distance: 'half' }, now),
    false,
  );
  assert.equal(model.raceMatches(race, { ...filter, time: 'pm' }, now), false);
  assert.equal(
    model.raceMatches(
      race,
      { ...filter, time: 'pm', registration: 'sold_out' },
      now,
    ),
    true,
  );
  assert.equal(model.raceRegistration(race, { distance: '5k' }, now), 'open');
  assert.equal(
    model.raceRegistration({ ...race, status: 'cancelled' }, {}, now),
    'unknown',
  );
  assert.equal(
    model.raceRegistration({ ...race, date: '2026-11-08' }, {}, now),
    'unknown',
  );
  assert.equal(
    model.raceRegistration({ ...race, registration: undefined }, {}, now),
    'mixed',
  );
});

test('club geography names San Francisco, Marin or elsewhere, and "Marina" is not Marin', () => {
  assert.deepEqual(model.geographyAreas('San Francisco'), ['sf']);
  assert.deepEqual(model.geographyAreas('San Francisco / Bay Area'), [
    'sf',
    'bay',
  ]);
  assert.deepEqual(model.geographyAreas('Marin County'), ['marin']);
  assert.deepEqual(model.geographyAreas('San Francisco / Marin'), [
    'sf',
    'marin',
  ]);
  assert.deepEqual(model.geographyAreas('Marina District'), ['bay']);
  assert.deepEqual(model.geographyAreas('Oakland'), ['bay']);
  assert.deepEqual(model.geographyAreas('Unknown'), []);
  const marinClub = { geography: 'Marin County' };
  assert.equal(model.clubMatches(marinClub, { area: 'marin' }), true);
  assert.equal(model.clubMatches(marinClub, { area: 'bay' }), false);
  // An SF club with a run that starts in Marin is found under Marin too.
  const sfClub = { geography: 'San Francisco' };
  const millValley = { neighborhoods: ['Mill Valley'], areas: ['marin'] };
  assert.equal(model.clubMatches(sfClub, { area: 'marin' }, millValley), true);
  assert.equal(model.clubMatches(sfClub, { area: 'bay' }, millValley), false);
});

test('on race day, advance registration needs a closing time still ahead, and open cannot precede its opening', () => {
  const registration = {
    status: 'open',
    checked_on: '2026-11-09',
    review_due: '2026-11-16',
  };
  const raceDay = new Date('2026-11-14T18:00:00Z'); // 10 a.m. Pacific
  assert.equal(
    model.registrationState(
      registration,
      new Date('2026-11-14T07:59:00Z'),
      '2026-11-14',
    ),
    'open',
  );
  assert.equal(
    model.registrationState(registration, raceDay, '2026-11-14'),
    'unknown',
  );
  assert.equal(
    model.registrationState(
      { ...registration, closes_at: '2026-11-14T11:00' },
      raceDay,
      '2026-11-14',
    ),
    'open',
  );
  assert.equal(
    model.registrationState(
      { ...registration, status: 'sold_out' },
      raceDay,
      '2026-11-14',
    ),
    'sold_out',
  );
  assert.equal(
    model.registrationState(
      { ...registration, opens_at: '2026-12-01T09:00' },
      new Date('2026-11-10T20:00:00Z'),
    ),
    'unknown',
  );
  const race = {
    date: '2026-11-14',
    status: 'scheduled',
    registration,
    distances: [{ name: '5K', category: '5k', start_time: '08:00' }],
  };
  assert.equal(model.raceRegistration(race, {}, raceDay), 'unknown');
});

test('weekend shortcuts use Pacific dates across years and include multi-day races', () => {
  const now = new Date('2026-12-31T23:00:00Z');
  assert.deepEqual(model.weekendBounds(now), {
    start: '2027-01-02',
    end: '2027-01-03',
  });
  assert.deepEqual(model.weekendBounds(new Date('2027-01-04T07:00:00Z')), {
    start: '2027-01-02',
    end: '2027-01-03',
  });
  const weekend = {
    ...filter,
    period: 'weekend',
    area: 'all',
    distance: 'all',
    format: 'all',
  };
  assert.equal(
    model.eventMatches(
      { ...event, starts_at_local: '2027-01-02T08:00' },
      weekend,
      now,
    ),
    true,
  );
  assert.equal(
    model.eventMatches(
      { ...event, starts_at_local: '2027-01-04T08:00' },
      weekend,
      now,
    ),
    false,
  );
  const race = {
    date: '2027-01-01',
    end_date: '2027-01-02',
    status: 'scheduled',
    distances: [{ category: '5k', start_time: null }],
  };
  assert.equal(model.raceMatches(race, weekend, now), true);
  assert.equal(
    model.raceMatches({ ...race, end_date: '2027-01-01' }, weekend, now),
    false,
  );
});
test('kids and relay filters require explicit format evidence', () => {
  const race = {
    date: '2026-11-14',
    status: 'scheduled',
    distances: [{ category: 'other', start_time: '09:00' }],
  };
  const filters = { ...filter, area: 'all', distance: 'all', format: 'kids' };
  const now = new Date('2026-11-09T12:00:00Z');
  assert.equal(model.raceMatches(race, filters, now), false);
  assert.equal(
    model.raceMatches({ ...race, format: 'kids' }, filters, now),
    true,
  );
  assert.equal(
    model.raceMatches({ ...race, format: 'relay' }, filters, now),
    false,
  );
  assert.equal(
    model.raceMatches(
      { ...race, format: 'relay' },
      { ...filters, format: 'relay' },
      now,
    ),
    true,
  );
});

test('a specific date includes past runs and each day of a race edition', () => {
  const now = new Date('2027-03-10T20:00:00Z');
  const options = {
    ...filter,
    period: '2026-11-09',
    distance: 'all',
    area: 'all',
    format: 'all',
  };
  assert.equal(model.eventMatches(event, options, now), true);
  assert.equal(
    model.eventMatches(event, { ...options, period: '2026-11-10' }, now),
    false,
  );
  const race = {
    date: '2026-10-31',
    end_date: '2026-11-02',
    status: 'scheduled',
    distances: [{ category: '5k', start_time: null }],
  };
  const sunday = {
    ...options,
    period: '2026-11-01',
    month: '2026-11',
    day: 'sunday',
  };
  assert.equal(model.raceMatches(race, sunday, now), true);
  assert.equal(
    model.raceMatches(race, { ...sunday, day: 'saturday' }, now),
    false,
  );
  assert.equal(
    model.raceMatches(race, { ...sunday, month: '2026-10' }, now),
    false,
  );
  assert.equal(model.raceMatches(race, options, now), false);
});

test('links to the same site are labelled by page so they can be told apart', () => {
  const labels = model.linkLabels([
    'https://www.meetup.com/missionfunruns/events/317280135/',
    'https://www.meetup.com/missionfunruns/',
    'https://www.strava.com/clubs/thepac',
  ]);
  assert.deepEqual(
    [...labels.values()],
    [
      'meetup.com/missionfunruns/events/317280135',
      'meetup.com/missionfunruns',
      'strava.com',
    ],
  );
  const club = 'https://www.sfrrc.org/content.aspx?club_id=798031&page_id=4002';
  const items = model.linkLabels([
    `${club}&item_id=2778435`,
    `${club}&item_id=2778488`,
  ]);
  // Parameters every link shares are left out.
  assert.deepEqual(
    [...items.values()],
    [
      'sfrrc.org/content.aspx?item_id=2778435',
      'sfrrc.org/content.aspx?item_id=2778488',
    ],
  );
  // Links that would still read alike are numbered rather than repeated.
  const same = model.linkLabels([
    'https://example.org/a?x=1',
    'https://example.org/a?x=1#top',
  ]);
  assert.deepEqual(
    [...same.values()],
    ['example.org/a (1)', 'example.org/a (2)'],
  );
  assert.equal(model.linkLabels(['not a url']).get('not a url'), 'not a url');
});

/* ---------- Calendar files ---------- */
const STAMP = new Date('2026-11-23T12:00:00Z');
const calendarLines = (ics) => {
  assert.ok(ics.endsWith('\r\n'), 'the file ends with CRLF');
  assert.ok(!/[^\r]\n/.test(ics), 'every line break is CRLF');
  return ics.slice(0, -2).replace(/\r\n /g, '').split('\r\n');
};
const calendarRun = {
  id: 'evt-test',
  club_id: 'test-club',
  title: 'Saturday Long Run',
  starts_at_local: '2026-11-14T08:00',
  ends_at_local: '2026-11-14T09:30',
  timezone: 'America/Los_Angeles',
  location: 'Ferry Building, San Francisco',
  source_id: 'src-test',
  checked_on: '2026-11-09',
  status: 'published',
  notes: 'All paces welcome; bring water.',
};
const calendarRace = {
  id: 'test-race-2026',
  title: 'Bay Trail Relay',
  date: '2026-12-05',
  end_date: '2026-12-06',
  city: 'Oakland',
  area: 'bay',
  location: 'Jack London Square',
  notes: 'Two-day relay.',
  status: 'scheduled',
  needs_review: false,
  checked_on: '2026-11-09',
  distances: [
    { name: 'Relay', category: 'relay', start_time: '07:30', location: null },
    {
      name: 'Kids dash',
      category: 'other',
      start_time: null,
      location: 'Lawn',
    },
  ],
  source_url: 'https://example.org/relay',
  additional_sources: [],
};

test('local San Francisco times convert to UTC across daylight saving time', () => {
  const utc = (local, timezone) =>
    model.zonedTimeToUTC(local, timezone).toISOString();
  // PDT is UTC-7 and PST is UTC-8.
  assert.equal(utc('2026-07-04T07:00'), '2026-07-04T14:00:00.000Z');
  assert.equal(utc('2026-12-05T07:00'), '2026-12-05T15:00:00.000Z');
  // Spring forward on March 8, 2026: 2:00 AM PST becomes 3:00 AM PDT.
  assert.equal(utc('2026-03-08T01:59'), '2026-03-08T09:59:00.000Z');
  assert.equal(utc('2026-03-08T03:00'), '2026-03-08T10:00:00.000Z');
  // A skipped time moves ahead by the gap, as calendar applications do.
  assert.equal(utc('2026-03-08T02:30'), '2026-03-08T10:30:00.000Z');
  // Fall back on November 1, 2026: 1:00–1:59 AM happens twice.
  assert.equal(utc('2026-11-01T00:59'), '2026-11-01T07:59:00.000Z');
  assert.equal(utc('2026-11-01T01:30'), '2026-11-01T08:30:00.000Z');
  assert.equal(utc('2026-11-01T02:00'), '2026-11-01T10:00:00.000Z');
  // The record's own time zone is honored.
  assert.equal(
    utc('2026-07-04T07:00', 'America/New_York'),
    '2026-07-04T11:00:00.000Z',
  );
  assert.equal(utc('2026-07-04T07:00', 'UTC'), '2026-07-04T07:00:00.000Z');
});

test('a listed run becomes a timed event with its end, notes and links', () => {
  const file = model.eventCalendar(
    calendarRun,
    {
      url: 'https://mldangelo.github.io/run/?event=evt-test',
      source: 'https://example.org/run',
      club: 'Test Club',
    },
    STAMP,
  );
  assert.equal(file.filename, 'saturday-long-run-2026-11-14.ics');
  assert.deepEqual(calendarLines(file.ics), [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SF Run Club Index//Add to calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:evt-test@mldangelo.github.io',
    'DTSTAMP:20261123T120000Z',
    'DTSTART:20261114T160000Z',
    'DTEND:20261114T173000Z',
    'SUMMARY:Saturday Long Run',
    'LOCATION:Ferry Building\\, San Francisco',
    'URL:https://mldangelo.github.io/run/?event=evt-test',
    'DESCRIPTION:Club: Test Club\\nAll paces welcome\\; bring water.\\n\\nPlans can change. Confirm with the club or organizer before you go.\\nEvent page: https://example.org/run\\nListing: https://mldangelo.github.io/run/?event=evt-test',
    'END:VEVENT',
    'END:VCALENDAR',
  ]);
  // A summer run uses daylight time.
  const summer = model.eventCalendar(
    {
      ...calendarRun,
      starts_at_local: '2026-07-11T08:00',
      ends_at_local: null,
    },
    { url: 'https://example.org/' },
    STAMP,
  );
  assert.ok(calendarLines(summer.ics).includes('DTSTART:20260711T150000Z'));
});

test('a run without an end time gets no invented end', () => {
  const { ics } = model.eventCalendar(
    { ...calendarRun, ends_at_local: undefined, notes: '' },
    { url: 'https://example.org/?event=evt-test' },
    STAMP,
  );
  const lines = calendarLines(ics);
  assert.ok(lines.includes('DTSTART:20261114T160000Z'));
  assert.equal(
    lines.some((line) => /^(DTEND|DURATION)/.test(line)),
    false,
  );
  // Without notes, the description still says to confirm the run.
  assert.ok(
    lines.includes(
      'DESCRIPTION:Plans can change. Confirm with the club or organizer before you go.\\nListing: https://example.org/?event=evt-test',
    ),
  );
});

test('an unconfirmed run is tentative and says so, with its other starts', () => {
  const { ics } = model.eventCalendar(
    {
      ...calendarRun,
      status: 'unconfirmed',
      needs_review: true,
      meeting_options: [
        { local_time: '07:15', location: 'Pier 1', details: 'Early group' },
      ],
    },
    { url: 'https://example.org/' },
    STAMP,
  );
  const lines = calendarLines(ics);
  assert.ok(lines.includes('SUMMARY:Unconfirmed: Saturday Long Run'));
  assert.ok(lines.includes('STATUS:TENTATIVE'));
  const description = lines.find((line) => line.startsWith('DESCRIPTION:'));
  assert.match(
    description,
    /Other meeting options \(San Francisco time\):\\n- 7:15 AM · Pier 1 · Early group/,
  );
  assert.match(description, /Unconfirmed: this run came from a less direct/);
  assert.match(description, /Some details still need checking\./);
  // A listed run is not marked tentative.
  assert.equal(
    calendarLines(
      model.eventCalendar(calendarRun, { url: 'https://example.org/' }, STAMP)
        .ics,
    ).some((line) => line.startsWith('STATUS:')),
    false,
  );
});

test('a multi-day race is an all-day event with an exclusive end date', () => {
  const file = model.raceCalendar(
    calendarRace,
    { url: 'https://mldangelo.github.io/run/?race=test-race-2026' },
    STAMP,
  );
  assert.equal(file.filename, 'bay-trail-relay-2026-12-05.ics');
  const lines = calendarLines(file.ics);
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261205'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20261207'));
  assert.ok(lines.includes('UID:test-race-2026@mldangelo.github.io'));
  assert.ok(lines.includes('SUMMARY:Bay Trail Relay'));
  assert.ok(lines.includes('LOCATION:Jack London Square\\, Oakland'));
  assert.ok(
    lines.includes(
      'DESCRIPTION:Two-day relay.\\n\\nDistances and start times (Pacific time):\\n- Relay · 7:30 AM\\n- Kids dash · Time not listed · Lawn\\n\\nDetails can change. Confirm with the organizer before you go.\\nRace page: https://example.org/relay\\nListing: https://mldangelo.github.io/run/?race=test-race-2026',
    ),
  );
  // A one-day race ends the next day; a city already named is not repeated.
  const oneDay = calendarLines(
    model.raceCalendar(
      {
        ...calendarRace,
        date: '2026-12-31',
        end_date: null,
        location: 'Oakland Museum',
      },
      { url: 'https://example.org/' },
      STAMP,
    ).ics,
  );
  assert.ok(oneDay.includes('DTSTART;VALUE=DATE:20261231'));
  assert.ok(oneDay.includes('DTEND;VALUE=DATE:20270101'));
  assert.ok(oneDay.includes('LOCATION:Oakland Museum'));
  assert.equal(
    oneDay.some((line) => /^DT(START|END):/.test(line)),
    false,
    'race dates carry no time',
  );
});

test('only runs and races still expected to happen are offered for calendars', () => {
  for (const status of ['published', 'unconfirmed'])
    assert.equal(model.calendarOffered('event', status), true);
  for (const status of ['cancelled', 'postponed']) {
    assert.equal(model.calendarOffered('event', status), false);
    assert.equal(
      model.eventCalendar({ ...calendarRun, status }, { url: 'x' }),
      null,
    );
    assert.equal(model.calendarOffered('race', status), false);
    assert.equal(
      model.raceCalendar({ ...calendarRace, status }, { url: 'x' }),
      null,
    );
  }
  assert.equal(model.calendarOffered('race', 'scheduled'), true);
  // A listing whose last day has passed is not offered; today still is.
  const today = '2026-11-23';
  assert.equal(
    model.calendarOffered('event', 'published', '2026-11-22', today),
    false,
  );
  assert.equal(model.calendarOffered('event', 'published', today, today), true);
  assert.equal(
    model.calendarOffered('race', 'scheduled', '2026-11-24', today),
    true,
  );
  assert.equal(model.calendarOffered('pattern', 'published'), false);
  assert.equal(model.calendarOffered('club', 'scheduled'), false);
});

test('calendar text is escaped and long lines fold at 75 UTF-8 octets', () => {
  assert.equal(model.icsText('a\\b; c, d\ne\r\nf'), 'a\\\\b\\; c\\, d\\ne\\nf');
  const line = `DESCRIPTION:${model.icsText(`Café — ${'Ünïcödé 🏃‍♀️ run, '.repeat(12)}end`)}`;
  const folded = model.icsFold(line);
  const physical = folded.split('\r\n');
  assert.ok(physical.length > 3);
  for (const [index, part] of physical.entries()) {
    const bytes = Buffer.from(part, 'utf8');
    assert.ok(bytes.length <= 75, `line ${index} is ${bytes.length} octets`);
    // No character is split: each line is valid UTF-8 on its own.
    assert.equal(bytes.toString('utf8'), part);
    assert.equal(part.includes('\ufffd'), false);
    if (index) assert.equal(part[0], ' ');
    // Escapes stay whole so lenient readers can unescape line by line.
    assert.equal(/(^|[^\\])(\\\\)*\\$/.test(part), false);
  }
  assert.equal(folded.replace(/\r\n /g, ''), line);
  // Short lines are untouched.
  assert.equal(model.icsFold('SUMMARY:Run'), 'SUMMARY:Run');
  // Exactly 75 octets fits on one line.
  assert.equal(model.icsFold('x'.repeat(75)), 'x'.repeat(75));
  assert.equal(model.icsFold('x'.repeat(76)), `${'x'.repeat(75)}\r\n x`);
});

test('calendar file names are ASCII slugs of the title and date', () => {
  assert.equal(
    model.calendarFileName('Café Run — Mission & Dolores!', '2026-11-14T08:00'),
    'cafe-run-mission-dolores-2026-11-14.ics',
  );
  assert.equal(
    model.calendarFileName('🏃‍♀️', '2026-11-14'),
    'listing-2026-11-14.ics',
  );
  assert.ok(model.calendarFileName('a'.repeat(200), '2026-11-14').length <= 75);
});

test('listing links keep the GitHub Pages base path', () => {
  assert.equal(
    model.listingURL(
      'race',
      'a b&c',
      'https://mldangelo.github.io/run/?view=races&q=bay',
    ),
    'https://mldangelo.github.io/run/?race=a%20b%26c',
  );
  assert.equal(
    model.listingURL('event', 'evt-1', 'http://127.0.0.1:4173/'),
    'http://127.0.0.1:4173/?event=evt-1',
  );
});
