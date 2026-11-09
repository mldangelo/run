const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  dueClubs,
  racesDue,
  markdown,
} = require('../scripts/review_status.mts');
const CLUBS = ['Alpha', 'Bravo', 'Charlie'].map((name, i) => ({
  id: 'abc'[i],
  name,
}));
const AUDITS = CLUBS.map((club) => ({
  club_id: club.id,
  checked_on: '2026-11-01',
  review_due: club.id === 'a' ? '2026-11-15' : '2026-12-31',
}));
const race = (fields = {}) => ({
  id: 'r',
  title: 'Race',
  date: '2026-11-20',
  end_date: null,
  status: 'scheduled',
  needs_review: true,
  checked_on: '2026-11-08',
  ...fields,
});
test('audits and current patterns make clubs due; superseded and expired patterns do not', () => {
  const patterns = [
    { club_id: 'b', review_due: '2026-11-20' },
    { club_id: 'c', review_due: '2026-11-01', status: 'superseded' },
  ];
  assert.deepEqual(
    dueClubs(CLUBS, AUDITS, patterns, '2026-11-10', '2026-11-20').map(
      ({ id, due, audit_due, patterns_due }) => [
        id,
        due,
        audit_due,
        patterns_due,
      ],
    ),
    [
      ['a', '2026-11-15', true, 0],
      ['b', '2026-11-20', false, 1],
    ],
  );
  assert.deepEqual(
    dueClubs(CLUBS, AUDITS, patterns, '2026-11-10', '2026-11-14'),
    [],
  );
  const expired = [
    { club_id: 'a', review_due: '2026-11-01', valid_until: '2026-11-09' },
    ...['2026-11-10', '2026-11-12', null].map((valid_until) => ({
      club_id: 'b',
      review_due: '2026-11-15',
      valid_until,
    })),
  ];
  const audits = [
    { club_id: 'c', checked_on: '2026-10-01', review_due: '2026-11-08' },
  ];
  assert.deepEqual(
    dueClubs(CLUBS, audits, expired, '2026-11-10', '2026-11-17').map(
      ({ id, audit_due, patterns_due }) => [id, audit_due, patterns_due],
    ),
    [
      ['c', true, 0],
      ['b', false, 3],
    ],
  );
});
test('race reviews honor status, the 30-day window and the final day of multi-day races', () => {
  const races = [
    race({ id: 'soon', checked_on: '2026-10-11' }),
    race({ id: 'past', date: '2026-11-01' }),
    race({ id: 'in-progress', date: '2026-11-09', end_date: '2026-11-11' }),
    race({ id: 'final-day', date: '2026-11-08', end_date: '2026-11-10' }),
    race({ id: 'finished', date: '2026-11-07', end_date: '2026-11-09' }),
    race({ id: 'far', date: '2027-02-01' }),
    race({ id: 'fine', needs_review: false }),
    race({ id: 'cancelled', status: 'cancelled' }),
    race({ id: 'postponed', status: 'postponed' }),
    race({ id: 'old', needs_review: false, checked_on: '2026-10-11' }),
    race({
      id: 'recent',
      needs_review: false,
      date: '2026-11-10',
      checked_on: '2026-10-12',
    }),
    race({
      id: 'last-day',
      needs_review: false,
      date: '2026-12-10',
      checked_on: '2026-10-10',
    }),
    race({
      id: 'too-far',
      needs_review: false,
      date: '2026-12-11',
      checked_on: '2026-10-10',
    }),
  ];
  assert.deepEqual(
    racesDue(races, '2026-11-10').map(({ race, reasons }) => [
      race.id,
      reasons,
    ]),
    [
      ['final-day', ['flagged']],
      ['in-progress', ['flagged']],
      ['soon', ['flagged', 'check is 30+ days old']],
      ['old', ['check is 30+ days old']],
      ['last-day', ['check is 30+ days old']],
    ],
  );
});
test('race age lookahead stops at race day or the next weekly reminder', () => {
  const races = [
    race({ id: 'lookahead', date: '2026-12-12' }),
    race({ id: 'before-stale', date: '2026-12-07' }),
    race({ id: 'on-stale', date: '2026-12-08' }),
    race({ id: 'next-reminder', date: '2026-12-20', checked_on: '2026-11-14' }),
    race({
      id: 'after-next-reminder',
      date: '2026-12-20',
      checked_on: '2026-11-15',
    }),
    race({ id: 'in-progress', date: '2026-12-06', end_date: '2026-12-09' }),
    race({ id: 'window-limit', date: '2027-01-06' }),
    race({ id: 'outside-window', date: '2027-01-07' }),
  ].map((row) => ({ ...row, needs_review: false }));
  assert.deepEqual(
    racesDue(races, '2026-12-07').map(({ race, reasons }) => [
      race.id,
      reasons,
    ]),
    [
      ['on-stale', ['check reaches 30 days on 2026-12-08']],
      ['lookahead', ['check reaches 30 days on 2026-12-08']],
      ['next-reminder', ['check reaches 30 days on 2026-12-14']],
      ['window-limit', ['check reaches 30 days on 2026-12-08']],
    ],
  );
});
test('review CLI prints Markdown or count, counts stale flagged races once, and uses SF today', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-reviews-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  const data = {
    clubs: [{ id: 'a', name: 'Alpha' }],
    audits: [
      { club_id: 'a', checked_on: '2026-11-01', review_due: '2026-11-15' },
    ],
    schedules: [],
    races: [
      {
        id: 'r',
        title: 'Race',
        date: '2026-11-20',
        end_date: null,
        status: 'scheduled',
        needs_review: true,
        checked_on: '2026-10-01',
      },
    ],
  };
  const write = () => {
    for (const [name, rows] of Object.entries(data))
      fs.writeFileSync(
        path.join(root, 'data', `${name}.json`),
        JSON.stringify(rows),
      );
  };
  const run = (args, clock) =>
    spawnSync(
      process.execPath,
      [
        '-e',
        'process.exitCode = require(process.argv[1]).main(JSON.parse(process.argv[3]), process.argv[2], new Date(process.argv[4]))',
        path.resolve(__dirname, '../scripts/review_status.mts'),
        root,
        JSON.stringify(args),
        clock || '2026-11-10T00:00:00Z',
      ],
      { encoding: 'utf8', env: { ...process.env, TZ: 'Asia/Tokyo' } },
    );
  write();
  let result = run(['--as-of', '2026-11-16', '--count']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '2\n');
  result = run(['--as-of', '2026-11-16']);
  assert.match(result.stdout, /\*\*1 clubs\*\* need a review \(1 overdue\)/);
  assert.match(
    result.stdout,
    /\| Alpha \(`a`\) \| 2026-11-15 \(overdue\) \| yes \| 0 \| 2026-11-01 \|/,
  );
  assert.match(result.stdout, /flagged, check is 30\+ days old/);
  data.clubs = [];
  data.audits = [];
  write();
  assert.equal(run(['--as-of', '2026-11-16', '--count']).stdout, '1\n');
  data.races = [];
  write();
  result = run([], '2026-11-10T07:59:00Z');
  assert.match(result.stdout, /as of 2026-11-09 \(San Francisco\)/);
  assert.equal(run(['--within', '-1']).status, 1);
  assert.equal(run(['--as-of', '2026-02-30']).status, 1);
});
test('review Markdown escapes table cells and preserves empty-state guidance', () => {
  const output = markdown(
    '2026-11-09',
    '2026-11-16',
    [
      {
        id: 'a',
        name: 'A|B\nClub',
        due: '2026-11-16',
        audit_due: false,
        patterns_due: 1,
        checked_on: null,
      },
    ],
    [],
  );
  assert.ok(output.includes('A\\|B Club'));
  assert.match(output, /never/);
  assert.match(
    markdown('2026-11-09', '2026-11-09', [], []),
    /No club reviews are due/,
  );
});
