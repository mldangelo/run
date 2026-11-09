const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../site/model.js');
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
