const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { eventsInWindow, matchesClub } = require('../scripts/report.mts');
const { eventDetails } = require('../scripts/export_schedule.mts');
const { zonedDate, validClock } = require('../scripts/lib.mts');
const fixture = require('./fixtures/snapshot.json');
const run = (name, args, root, timezone = 'UTC') =>
  spawnSync(
    process.execPath,
    [
      '-e',
      'process.exitCode = require(process.argv[1]).main(JSON.parse(process.argv[3]), process.argv[2])',
      path.resolve(__dirname, `../scripts/${name}.mts`),
      root,
      JSON.stringify(args),
    ],
    { encoding: 'utf8', env: { ...process.env, TZ: timezone } },
  );
function tempData(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  return {
    root,
    write(data) {
      for (const [name, rows] of Object.entries(data))
        fs.writeFileSync(
          path.join(root, 'data', `${name}.json`),
          JSON.stringify(rows),
        );
    },
  };
}
test('club search covers name, ID and original lead; events honor status and inclusive bounds', () => {
  assert.ok(
    matchesClub(
      { id: 'club-a', name: 'Club A', user_supplied_name: 'Original lead' },
      'ORIGINAL',
    ),
  );
  assert.ok(matchesClub(fixture.clubs[0], 'CLUB-A'));
  const event = fixture.events[0];
  const now = zonedDate(event.starts_at_local);
  assert.equal(
    eventsInWindow([event], new Set(['club-a']), 'published', now, now).length,
    1,
  );
  assert.equal(
    eventsInWindow(
      [{ ...event, status: 'cancelled' }],
      new Set(['club-a']),
      'published',
      now,
      now,
    ).length,
    0,
  );
  assert.equal(
    eventsInWindow([event], new Set(['other']), 'published', now, now).length,
    0,
  );
  assert.equal(
    eventsInWindow(
      [event],
      new Set(['club-a']),
      'published',
      new Date(now.getTime() + 1),
      new Date(now.getTime() + 1),
    ).length,
    0,
  );
  assert.equal(validClock('06:30\n'), false);
});
test('report separates published, unconfirmed and projected candidates and retains alternate starts', (t) => {
  const { root, write } = tempData(t);
  const data = structuredClone(fixture);
  data.events[0].meeting_options = [
    { local_time: '07:00', location: 'Other place', details: 'Long option' },
  ];
  for (const status of ['unconfirmed', 'cancelled', 'postponed'])
    data.events.push({
      ...data.events[0],
      id: status,
      title: `${status} run`,
      status,
    });
  write(data);
  const args = [
    '--as-of',
    '2026-11-09',
    '--days',
    '7',
    '--include-patterns',
    '--include-unconfirmed',
  ];
  const result = run('report', args, root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Dated events between 2026-11-09T00:00-08:00 and 2026-11-16T00:00-08:00/,
  );
  assert.match(result.stdout, /Mon Nov 09 06:30 AM: Club A — Morning run/);
  assert.match(
    result.stdout,
    /Alternate start: 07:00 — Other place — Long option/,
  );
  assert.match(result.stdout, /NOT individually scheduled events/);
  assert.ok(
    result.stdout.indexOf('Tuesday run') >
      result.stdout.indexOf('Unconfirmed candidates'),
  );
  assert.ok(
    result.stdout.indexOf('unconfirmed run') >
      result.stdout.indexOf('Unconfirmed dated listings'),
  );
  assert.doesNotMatch(result.stdout, /cancelled run|postponed run/);
  assert.equal(run('report', args, root, 'Asia/Tokyo').stdout, result.stdout);
  assert.equal(run('report', ['--club', 'not-a-club'], root).status, 1);
  assert.equal(run('report', ['--as-of', '2026-02-30'], root).status, 1);
});
test('report missing audits and empty windows stay explicit; first duplicate audit wins', (t) => {
  const { root, write } = tempData(t);
  const data = structuredClone(fixture);
  data.audits = [];
  write(data);
  let result = run(
    'report',
    ['--as-of', '2027-01-01', '--club', 'CLUB A'],
    root,
  );
  assert.match(result.stdout, /no audit recorded/);
  assert.match(result.stdout, /does not mean no runs/);
  data.audits = [
    fixture.audits[0],
    { ...fixture.audits[0], notes: 'Duplicate audit should be ignored' },
  ];
  write(data);
  result = run('report', ['--as-of', '2026-11-09', '--club', 'Club A'], root);
  assert.match(result.stdout, /Checked\./);
  assert.doesNotMatch(result.stdout, /Duplicate audit/);
});
test('schedule export escapes cells, orders patterns, preserves uncertain leads and alternate starts', (t) => {
  const { root, write } = tempData(t);
  const data = structuredClone(fixture);
  data.events[0].title = 'A | B\nRun';
  data.events[0].meeting_options = [
    { local_time: '07:00', location: 'Other place', details: 'Long option' },
  ];
  data.events.push({
    ...data.events[0],
    id: 'unconfirmed',
    status: 'unconfirmed',
    title: 'Unconfirmed title',
  });
  data.schedules[0].local_time = null;
  data.schedules[0].status = 'needs_review';
  assert.match(
    eventDetails(data.events[0]),
    /Alternate starts: 07:00 Other place \(Long option\)/,
  );
  write(data);
  const args = ['--as-of', '2026-11-09', '--days', '1'];
  const result = run('export_schedule', args, root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /November 09, 2026 12:00 AM PST/);
  assert.ok(result.stdout.includes('A \\| B Run'));
  assert.match(result.stdout, /Mon Nov 09, 6:30 AM/);
  assert.ok(
    result.stdout.indexOf('Unconfirmed title') >
      result.stdout.indexOf('Unconfirmed dated leads'),
  );
  assert.match(result.stdout, /Unknown/);
  assert.match(result.stdout, /needs_review/);
  assert.equal(
    run('export_schedule', args, root, 'Asia/Tokyo').stdout,
    result.stdout,
  );
  assert.match(
    run('export_schedule', ['--as-of', '2027-01-01'], root).stdout,
    /No listings recorded in this window/,
  );
});
for (const name of ['report', 'export_schedule', 'review_status'])
  test(`${name} rejects invalid flags and prints help`, (t) => {
    const { root, write } = tempData(t);
    write(fixture);
    assert.equal(run(name, ['--help'], root).status, 0);
    assert.equal(run(name, ['--unknown'], root).status, 1);
    const flag = name === 'review_status' ? '--within' : '--days';
    for (const value of ['-1', '1.5', 'abc'])
      assert.equal(run(name, [flag, value], root).status, 1);
  });
