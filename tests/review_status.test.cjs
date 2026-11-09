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
} = require('../scripts/review_status.cjs');
const cases = require('./fixtures/review-cases.json');
for (const [index, example] of cases.entries())
  test(`review parity ${index + 1}: ${example.name}`, () => {
    assert.deepEqual(
      { due_clubs: dueClubs, races_due: racesDue }[example.function](
        ...example.args,
      ),
      example.expected,
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
        path.resolve(__dirname, '../scripts/review_status.cjs'),
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
