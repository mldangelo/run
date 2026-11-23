import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  applyFindings,
  type Findings,
  main,
  parseFindings,
} from '../scripts/apply_findings.mts';
import type { Snapshot } from '../scripts/types.mts';
import { validate } from '../scripts/validate.mts';
import rawSnapshot from './fixtures/snapshot.json' with { type: 'json' };

const snapshot = () => structuredClone(rawSnapshot) as unknown as Snapshot;
const TODAY = '2026-11-12';
const finding = (
  extra: Partial<NonNullable<Findings['clubs']>[number]> = {},
) => ({
  clubs: [
    {
      club_id: 'club-a',
      summary: 'Rechecked the club calendar.',
      next_steps: 'Recheck before the next run.',
      review_due: '2026-11-19',
      source_checks: [
        {
          url: 'https://example.org/events',
          method: 'page' as const,
          notes: 'Calendar lists November 16.',
        },
        {
          url: 'https://example.org/nov-16',
          method: 'page' as const,
          notes: 'Event page gives 7 AM at Dolores Park.',
          observed_on: '2026-11-11',
        },
      ],
      new_sources: [
        {
          url: 'https://example.org/nov-16',
          authority: 'club' as const,
          roles: ['event'],
          access: 'public' as const,
        },
      ],
      ...extra,
    },
  ],
});
const newRun = {
  new: {
    title: 'Sunday run',
    starts_at_local: '2026-11-16T07:00',
    status: 'published',
    location: 'Dolores Park',
    notes: 'Meet at the top of the park.',
    source_url: 'https://example.org/nov-16',
    additional_source_urls: ['https://example.org/events'],
  },
};

test('findings add sources, a log entry, runs, pattern changes and race updates that validate', () => {
  const data = snapshot();
  const findings: Findings[] = [
    finding({
      events: [
        newRun,
        { id: 'evt-a', verified: true, set: { notes: 'Still on.' } },
      ],
      schedules: [
        {
          id: 'sch-a',
          verified: '2026-11-11',
          set: { review_due: '2026-11-25' },
        },
      ],
    }),
    {
      races: [
        {
          race_id: 'race-a',
          verified: true,
          set: { notes: 'Course unchanged.' },
        },
      ],
    },
  ];
  const { errors, warnings, log } = applyFindings(data, findings, TODAY);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(validate(data), []);
  const audit = data.audits[0];
  assert.equal(audit.checked_on, TODAY);
  assert.equal(audit.review_due, '2026-11-19');
  const entry = audit.research_log?.at(-1);
  assert.equal(entry?.checked_on, TODAY);
  assert.deepEqual(
    entry?.source_checks.map((check) => [check.method, check.observed_on]),
    [
      ['page', undefined],
      ['page', '2026-11-11'],
    ],
  );
  const added = data.sources.find(
    (s) => s.url === 'https://example.org/nov-16',
  );
  assert.ok(added?.id.startsWith('src-'));
  assert.ok(audit.reference_source_ids.includes(added?.id ?? ''));
  const run = data.events.find((event) => event.title === 'Sunday run');
  assert.equal(run?.source_id, added?.id);
  assert.deepEqual(run?.additional_source_ids, ['src-a']);
  assert.equal(run?.checked_on, TODAY);
  assert.equal(run?.timezone, 'America/Los_Angeles');
  assert.equal(data.events[0].checked_on, TODAY);
  assert.equal(data.events[0].notes, 'Still on.');
  assert.equal(data.schedules[0].checked_on, '2026-11-11');
  assert.equal(data.races[0].checked_on, TODAY);
  assert.ok(log.some((line) => line.startsWith('+ run ')));
  // The same finding gives the same IDs, so a rerun is caught as a duplicate.
  const again = applyFindings(data, [finding({ events: [newRun] })], TODAY);
  assert.match(again.errors.join('\n'), /already exists/);
});

test('findings cannot cite unknown pages or set fields the tool maintains', () => {
  const { errors } = applyFindings(
    snapshot(),
    [
      finding({
        source_checks: [
          {
            url: 'https://example.org/unknown',
            method: 'page',
            notes: 'Read.',
          },
        ],
        events: [
          { id: 'evt-a', set: { checked_on: '2026-11-12', source_id: 'x' } },
        ],
      }),
    ],
    TODAY,
  );
  assert.match(
    errors.join('\n'),
    /unknown is neither recorded nor in new_sources/,
  );
  assert.match(errors.join('\n'), /evt-a: checked_on is set by this tool/);
  assert.match(errors.join('\n'), /evt-a: source_id is set by this tool/);
});

test('likely duplicates, out-of-window runs and unexplained cleared flags are warnings', () => {
  const data = snapshot();
  data.events[0].needs_review = true;
  data.races[0].needs_review = true;
  const { warnings } = applyFindings(
    data,
    [
      finding({
        events: [
          {
            ...newRun,
            new: { ...newRun.new, starts_at_local: '2026-11-09T09:00' },
          },
          { id: 'evt-a', unset: ['needs_review'] },
        ],
      }),
      { races: [{ race_id: 'race-a', set: { needs_review: false } }] },
    ],
    TODAY,
  );
  assert.match(warnings.join('\n'), /shares a day with evt-a/);
  assert.match(warnings.join('\n'), /outside 2026-11-12\.\.2026-12-03/);
  assert.match(warnings.join('\n'), /evt-a clears needs_review without a why/);
  assert.match(
    warnings.join('\n'),
    /race-a: clears needs_review without a why/,
  );
});

test('the CLI writes only a validating, warning-free result and only with --write', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-findings-'));
  fs.mkdirSync(path.join(root, 'data'));
  for (const [name, rows] of Object.entries(rawSnapshot))
    fs.writeFileSync(
      path.join(root, 'data', `${name}.json`),
      `${JSON.stringify(rows, null, 2)}\n`,
    );
  const file = path.join(root, 'findings.json');
  const events = () =>
    fs.readFileSync(path.join(root, 'data/events.json'), 'utf8');
  const before = events();
  const run = (findings: Findings, ...flags: string[]) => {
    fs.writeFileSync(file, JSON.stringify(findings));
    return main(['--findings', file, '--date', TODAY, ...flags], root);
  };
  assert.equal(run(finding({ events: [newRun] })), 0);
  assert.equal(events(), before, 'a dry run writes nothing');
  // A run that would publish an unknown meeting point fails validation.
  const pending = {
    new: {
      ...newRun.new,
      starts_at_local: '2026-11-17T07:00',
      run_details: { meeting_point: 'pending' },
    },
  };
  assert.equal(run(finding({ events: [pending] }), '--write'), 1);
  assert.equal(events(), before);
  assert.equal(run(finding({ events: [newRun] }), '--write'), 0);
  assert.match(events(), /Sunday run/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('findings cannot reassign identifiers, clear a flag by setting it false unexplained, or repeat keys', () => {
  const data = snapshot();
  data.events[0].needs_review = true;
  const { errors, warnings } = applyFindings(
    data,
    [
      finding({
        events: [
          { new: { ...newRun.new, id: 'evt-custom', club_id: 'club-b' } },
          { id: 'evt-a', set: { needs_review: false } },
        ],
        new_schedules: [
          {
            label: 'Friday run',
            days: ['friday'],
            id: 'sch-custom',
            source_url: 'https://example.org/events',
          },
        ],
      }),
    ],
    TODAY,
  );
  assert.match(errors.join('\n'), /new run 2026-11-16T07:00 sets id, club_id/);
  assert.match(errors.join('\n'), /new pattern Friday run sets id/);
  assert.match(warnings.join('\n'), /evt-a clears needs_review without a why/);
  assert.throws(
    () => parseFindings('{"clubs": [{"events": [], "events": []}]}', 'a.json'),
    /a\.json: repeated keys would silently drop findings: clubs\[0\]\.events/,
  );
});
