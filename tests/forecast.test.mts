import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pattern } from '../scripts/forecast.mts';
import { candidates } from '../scripts/forecast.mts';
import {
  localMinute,
  offsetMinutes,
  reportWindow,
  validDate,
  zonedDate,
} from '../scripts/lib.mts';

const pattern = (values: Partial<Pattern> = {}): Pattern => ({
  days: ['tuesday'],
  frequency: 'weekly',
  local_time: '07:00',
  timezone: 'America/Los_Angeles',
  valid_from: null,
  valid_until: null,
  ...values,
});
const localCandidates = (p: Pattern, start: string, end: string) =>
  candidates(p, zonedDate(start), zonedDate(end)).map((date) =>
    localMinute(date, p.timezone),
  );
test('weekly candidates respect inclusive time windows and effective seasons', () => {
  const p = pattern({ valid_from: '2026-11-21', valid_until: '2026-12-01' });
  assert.deepEqual(localCandidates(p, '2026-11-08T12:00', '2026-12-10T12:00'), [
    '2026-11-24T07:00',
    '2026-12-01T07:00',
  ]);
  assert.deepEqual(localCandidates(p, '2026-11-24T07:00', '2026-11-24T07:00'), [
    '2026-11-24T07:00',
  ]);
  assert.deepEqual(
    localCandidates(p, '2026-11-24T07:01', '2026-11-24T08:00'),
    [],
  );
});
test('monthly ordinals and first/third Thursdays do not invent ambiguous occurrences', () => {
  assert.deepEqual(
    localCandidates(
      pattern({ days: ['saturday'], frequency: 'fifth Saturday' }),
      '2026-11-01T00:00',
      '2027-02-01T00:00',
    ),
    ['2027-01-30T07:00'],
  );
  assert.deepEqual(
    localCandidates(
      pattern({ days: ['thursday'], frequency: 'first and third Thursday' }),
      '2026-11-01T00:00',
      '2026-11-30T00:00',
    ),
    ['2026-11-05T07:00', '2026-11-19T07:00'],
  );
  for (const values of [
    { frequency: '2–3 per month' },
    { local_time: null },
    { status: 'superseded' },
    { status: 'needs_review' },
  ] as const)
    assert.deepEqual(
      localCandidates(pattern(values), '2026-11-01T00:00', '2026-11-30T00:00'),
      [],
    );
});
test('DST candidates retain their wall-clock time and change offsets', () => {
  const p = pattern({ days: ['sunday'], local_time: '10:00' });
  const found = candidates(
    p,
    zonedDate('2026-10-25T00:00'),
    zonedDate('2026-11-09T00:00'),
  );
  assert.deepEqual(
    found.map((date) => localMinute(date).slice(11)),
    ['10:00', '10:00', '10:00'],
  );
  assert.deepEqual(
    found.map((date) => offsetMinutes(date, p.timezone)),
    [-420, -480, -480],
  );
  const spring = candidates(
    p,
    zonedDate('2026-03-01T00:00'),
    zonedDate('2026-03-16T00:00'),
  );
  assert.deepEqual(
    spring.map((date) => offsetMinutes(date, p.timezone)),
    [-480, -420, -420],
  );
});
test('zone resolution matches first repeated hour and pre-transition offset for gaps', () => {
  assert.equal(
    zonedDate('2026-11-01T01:30').toISOString(),
    '2026-11-01T08:30:00.000Z',
  );
  assert.equal(
    zonedDate('2026-03-08T02:30').toISOString(),
    '2026-03-08T10:30:00.000Z',
  );
  assert.equal(
    zonedDate('2026-11-09T07:00', 'Asia/Kathmandu').toISOString(),
    '2026-11-09T01:15:00.000Z',
  );
  assert.equal(
    zonedDate('2026-11-09T00:00', 'UTC').toISOString(),
    '2026-11-09T00:00:00.000Z',
  );
});
test('report windows add calendar days in SF and honor explicit offsets', () => {
  const spring = reportWindow('2026-03-07T12:00', 2);
  assert.equal((spring.end.getTime() - spring.now.getTime()) / 3600000, 47);
  const fall = reportWindow('2026-10-31T12:00', 2);
  assert.equal((fall.end.getTime() - fall.now.getTime()) / 3600000, 49);
  const fixed = reportWindow('2026-10-31T12:00+03:00', 2);
  assert.equal((fixed.end.getTime() - fixed.now.getTime()) / 3600000, 48);
  assert.equal(
    reportWindow('2026-11-09', 0).now.toISOString(),
    '2026-11-09T08:00:00.000Z',
  );
  assert.equal(
    reportWindow('2026-11-09T12:30:15.125', 1).end.toISOString(),
    '2026-11-10T20:30:15.125Z',
  );
  assert.equal(validDate('0001-01-01'), true);
  assert.equal(validDate('0000-01-01'), false);
  assert.throws(() => reportWindow('2026-02-30', 1), /valid ISO/);
});
