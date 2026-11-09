// Read-only review queue. Nothing here contacts a source or edits research.
import {
  addDays,
  args,
  cell,
  cli,
  compareKeys,
  load,
  localMinute,
  nonnegative,
  ROOT,
  SF,
  validDate,
} from './lib.mts';
import type { Audit, Club, Race, Schedule } from './types.mts';

const RACE_WINDOW_DAYS = 30;
const RACE_CHECK_MAX_AGE_DAYS = 30;
const RACE_REVIEW_CADENCE_DAYS = 7;
function dueClubs(
  clubs: Club[],
  audits: Audit[],
  schedules: Schedule[],
  today: string,
  horizon: string,
) {
  const auditByClub = new Map(audits.map((audit) => [audit.club_id, audit]));
  const rows = [];
  for (const club of clubs) {
    const audit = auditByClub.get(club.id);
    const auditDue = Boolean(audit && audit.review_due <= horizon);
    const dueDates = auditDue && audit ? [audit.review_due] : [];
    let patternsDue = 0;
    for (const pattern of schedules) {
      if (
        pattern.club_id !== club.id ||
        pattern.status === 'superseded' ||
        (pattern.valid_until && pattern.valid_until < today)
      )
        continue;
      if (pattern.review_due <= horizon) {
        patternsDue++;
        dueDates.push(pattern.review_due);
      }
    }
    if (dueDates.length)
      rows.push({
        id: club.id,
        name: club.name,
        due: dueDates.sort()[0],
        audit_due: auditDue,
        patterns_due: patternsDue,
        checked_on: audit?.checked_on ?? null,
      });
  }
  return rows.sort((a, b) =>
    compareKeys([a.due, a.name.toLowerCase()], [b.due, b.name.toLowerCase()]),
  );
}
function racesDue(races: Race[], today: string, days = RACE_WINDOW_DAYS) {
  const last = addDays(today, days);
  const found = [];
  for (const race of races) {
    if (
      race.status !== 'scheduled' ||
      (race.end_date || race.date) < today ||
      race.date > last
    )
      continue;
    const reasons = race.needs_review ? ['flagged'] : [];
    const ageDue = addDays(race.checked_on, RACE_CHECK_MAX_AGE_DAYS);
    const ageHorizon = [
      [race.date, today].sort()[1],
      addDays(today, RACE_REVIEW_CADENCE_DAYS),
    ].sort()[0];
    if (ageDue <= today) reasons.push('check is 30+ days old');
    else if (ageDue <= ageHorizon)
      reasons.push(`check reaches 30 days on ${ageDue}`);
    if (reasons.length) found.push({ race, reasons });
  }
  return found.sort((a, b) =>
    compareKeys(
      [a.race.date, a.race.title.toLowerCase()],
      [b.race.date, b.race.title.toLowerCase()],
    ),
  );
}
function markdown(
  today: string,
  horizon: string,
  clubsDue: ReturnType<typeof dueClubs>,
  racesToReview: ReturnType<typeof racesDue>,
) {
  const lines = [
    `Research review status as of ${today} (San Francisco), covering items due on or before ${horizon}.`,
    '',
  ];
  const overdue = clubsDue.filter((row) => row.due < today).length;
  if (clubsDue.length) {
    lines.push(
      `**${clubsDue.length} clubs** need a review (${overdue} overdue). Recheck each club's own channels, then update \`checked_on\` and \`review_due\` in \`data/audits.json\` and \`data/schedules.json\`.`,
      '',
      '| Club | Due | Audit | Patterns due | Last checked |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const row of clubsDue)
      lines.push(
        `| ${cell(row.name)} (\`${row.id}\`) | ${row.due} (${row.due < today ? 'overdue' : 'due'}) | ${row.audit_due ? 'yes' : 'no'} | ${row.patterns_due} | ${row.checked_on || 'never'} |`,
      );
  } else lines.push('No club reviews are due.');
  lines.push('');
  if (racesToReview.length) {
    lines.push(
      `**${racesToReview.length} upcoming races** starting within ${RACE_WINDOW_DAYS} days or in progress are flagged \`needs_review\` or their checks reach ${RACE_CHECK_MAX_AGE_DAYS} days old by race day or the next weekly reminder, whichever comes first. Confirm their details with the organizer before race day; checking a stale record does not by itself resolve a flag.`,
      '',
      '| Race | Date | Checked | Why |',
      '| --- | --- | --- | --- |',
    );
    for (const { race, reasons } of racesToReview)
      lines.push(
        `| ${cell(race.title)} (\`${race.id}\`) | ${race.date} | ${race.checked_on} | ${reasons.join(', ')} |`,
      );
    lines.push('');
  }
  lines.push(
    'After updating, run `npm run generate` and `npm run verify`. See `research/tracking.md` for the process.',
  );
  return `${lines.join('\n')}\n`;
}
function main(argv?: string[], root = ROOT, clock = new Date()) {
  const options = args(
    {
      'as-of': { type: 'string' },
      within: { type: 'string', default: '0' },
      count: { type: 'boolean' },
    },
    argv,
  );
  if (options.help) {
    console.log(
      'Summarize research due for review. Usage: node scripts/review_status.mts [--as-of YYYY-MM-DD] [--within DAYS] [--count]',
    );
    return 0;
  }
  const within = nonnegative(options.within, '--within');
  const today = options['as-of'] || localMinute(clock, SF).slice(0, 10);
  if (!validDate(today))
    throw new Error('--as-of must be a valid date as YYYY-MM-DD');
  const horizon = addDays(today, within);
  const clubsDue = dueClubs(
    load('clubs', root),
    load('audits', root),
    load('schedules', root),
    today,
    horizon,
  );
  const racesToReview = racesDue(load('races', root), today);
  if (options.count) console.log(clubsDue.length + racesToReview.length);
  else process.stdout.write(markdown(today, horizon, clubsDue, racesToReview));
  return 0;
}

export { dueClubs, main, markdown, racesDue };

if (import.meta.main) cli(main);
