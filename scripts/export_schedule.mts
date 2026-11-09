import {
  args,
  cell,
  cli,
  compareKeys,
  displayMinute,
  load,
  localMinute,
  lookup,
  nonnegative,
  ROOT,
  reportWindow,
  WEEKDAYS,
  zonedDate,
} from './lib.mts';
import type { Club, DatedEvent, Schedule, Source } from './types.mts';

const INTRO =
  'Source data was checked on dates shown in the linked records. This is not a live calendar; check the organizer for cancellations and changes. Some event links require an account.';
const CANONICAL_DATA =
  'Canonical structured data: [events](../data/events.json), [recurring patterns](../data/schedules.json), [sources](../data/sources.json), and [club audits](../data/audits.json). A location labeled unknown or TBD has not been established. Bay Area events outside SF are labeled.\n';
const UNCONFIRMED_NOTE =
  'These leads need verification: some are unconfirmed third-party listings and others have conflicting details.\n';
const PATTERNS_NOTE =
  'Patterns are not confirmations for individual dates. Locations and times may change; check the source. Patterns marked needs review are retained for comparison and are not projected by the report tool.\n';
const text = (value: unknown) => cell(value || 'Unknown');
const link = (source: Source) => `[Source](${source.url})`;
function eventDetails(event: DatedEvent) {
  const options = (event.meeting_options || [])
    .map(
      (option) => `${option.local_time} ${option.location} (${option.details})`,
    )
    .join('; ');
  return (event.notes || '') + (options ? ` Alternate starts: ${options}` : '');
}
function printDatedSection(
  status: string,
  title: string,
  events: DatedEvent[],
  clubs: Map<string, Club>,
  sources: Map<string, Source>,
  now: Date,
  end: Date,
) {
  console.log(`## ${title}\n`);
  if (status === 'unconfirmed') console.log(UNCONFIRMED_NOTE);
  console.log(
    '| Date and time | Club and event | Meeting place | Details | Source |',
  );
  console.log('| --- | --- | --- | --- | --- |');
  const found = events
    .filter((event) => {
      if (event.status !== status) return false;
      const start = zonedDate(event.starts_at_local, event.timezone);
      return now <= start && start <= end;
    })
    .sort((a, b) =>
      compareKeys(
        [zonedDate(a.starts_at_local, a.timezone).getTime(), a.club_id, a.id],
        [zonedDate(b.starts_at_local, b.timezone).getTime(), b.club_id, b.id],
      ),
    );
  for (const event of found) {
    const details = eventDetails(event);
    console.log(
      `| ${displayMinute(event.starts_at_local, { pad: false, comma: true })} | ${text(lookup(clubs, event.club_id).name)}: ${text(event.title)} | ${text(event.location)} | ${details ? text(details) : 'See source'} | ${link(lookup(sources, event.source_id))} (${event.source_type}) |`,
    );
  }
  if (!found.length)
    console.log('| — | No listings recorded in this window | — | — | — |');
  console.log();
}
function patternSortKey(schedule: Schedule) {
  return [
    Math.min(...schedule.days.map((day) => WEEKDAYS.indexOf(day))),
    schedule.local_time || '99:99',
    schedule.club_id,
    schedule.id,
  ];
}
function printPatterns(
  schedules: Schedule[],
  clubs: Map<string, Club>,
  sources: Map<string, Source>,
) {
  console.log('## Recurring patterns\n');
  console.log(PATTERNS_NOTE);
  console.log(
    '| Days | Time | Club and run | Meeting place | Frequency and notes | Evidence |',
  );
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const schedule of [...schedules].sort((a, b) =>
    compareKeys(patternSortKey(a), patternSortKey(b)),
  )) {
    const validity =
      schedule.valid_from || schedule.valid_until
        ? ` Effective ${schedule.valid_from || '?'} to ${schedule.valid_until || '?'}.`
        : '';
    const details =
      `${schedule.frequency}.${validity} ${schedule.notes || ''}`.trimEnd();
    console.log(
      `| ${text(schedule.days.join(', '))} | ${text(schedule.local_time)} | ${text(lookup(clubs, schedule.club_id).name)}: ${text(schedule.label)} | ${text(schedule.location)} | ${text(details)} | ${link(lookup(sources, schedule.source_id))} (${schedule.evidence}; ${schedule.status || 'active'}) |`,
    );
  }
}
function headingDate(instant: Date, zone: string) {
  const local = localMinute(instant, zone);
  const month = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: zone,
  }).format(instant);
  const time = displayMinute(local).split(' ').slice(-2).join(' ');
  const zoneName =
    /^[+-]/.test(zone) || zone === 'UTC'
      ? zone === 'UTC'
        ? 'UTC'
        : `UTC${zone}`
      : new Intl.DateTimeFormat('en-US', {
          timeZone: zone,
          timeZoneName: 'short',
        })
          .formatToParts(instant)
          .find((part) => part.type === 'timeZoneName')?.value || zone;
  return `${month} ${local.slice(8, 10)}, ${local.slice(0, 4)} ${time} ${zoneName}`;
}
function main(argv?: string[], root = ROOT, clock = new Date()) {
  const options = args(
    { 'as-of': { type: 'string' }, days: { type: 'string', default: '14' } },
    argv,
  );
  if (options.help) {
    console.log(
      'Generate a readable schedule snapshot. Usage: node scripts/export_schedule.mts [--as-of ISO] [--days DAYS]',
    );
    return 0;
  }
  const { now, end, zone } = reportWindow(
    options['as-of'],
    nonnegative(options.days, '--days'),
    clock,
  );
  const clubs = new Map(load('clubs', root).map((club) => [club.id, club]));
  const sources = new Map(
    load('sources', root).map((source) => [source.id, source]),
  );
  const events = load('events', root);
  const schedules = load('schedules', root);
  console.log('# Running schedule — research snapshot');
  console.log(
    `\nView generated for ${headingDate(now, zone)} through ${headingDate(end, zone)}. ${INTRO}\n`,
  );
  console.log(CANONICAL_DATA);
  for (const [status, title] of [
    ['published', 'Published dated listings'],
    ['unconfirmed', 'Unconfirmed dated leads'],
  ])
    printDatedSection(status, title, events, clubs, sources, now, end);
  printPatterns(schedules, clubs, sources);
  return 0;
}

export { eventDetails, main, patternSortKey, printDatedSection };

if (import.meta.main) cli(main);
