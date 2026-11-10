import { candidates } from './forecast.mts';
import {
  args,
  cli,
  compareKeys,
  displayMinute,
  isoMinute,
  load,
  localMinute,
  lookup,
  nonnegative,
  ROOT,
  reportWindow,
  zonedDate,
} from './lib.mts';
import type { Audit, Club, DatedEvent, Schedule, Source } from './types.mts';

function matchesClub(club: Club, query: string) {
  return `${club.name} ${club.id} ${club.user_supplied_name}`
    .toLowerCase()
    .includes(query.toLowerCase());
}
function eventsInWindow(
  events: DatedEvent[],
  clubIds: Set<string>,
  status: string,
  now: Date,
  end: Date,
) {
  return events
    .filter((event) => clubIds.has(event.club_id) && event.status === status)
    .map(
      (event) =>
        [zonedDate(event.starts_at_local, event.timezone), event] as const,
    )
    .filter(([start]) => now <= start && start <= end)
    .sort((a, b) => a[0].getTime() - b[0].getTime());
}
function printClub(
  club: Club,
  audit: Audit | undefined,
  schedules: Schedule[],
  sources: Map<string, Source>,
) {
  if (!audit) console.log(`\n${club.name} — no audit recorded`);
  else {
    console.log(
      `\n${club.name} — ${audit.result} (checked ${audit.checked_on}; review by ${audit.review_due})`,
    );
    console.log(audit.notes);
    for (const entry of audit.research_log || []) {
      console.log(`  Research ${entry.checked_on}: ${entry.summary}`);
      console.log(`    Next: ${entry.next_steps}`);
      for (const check of entry.source_checks)
        console.log(
          `    ${sources.get(check.source_id)?.url ?? check.source_id} [${check.method}]: ${check.notes}`,
        );
    }
  }
  for (const schedule of schedules) {
    if (schedule.club_id !== club.id) continue;
    console.log(
      `  Pattern: ${schedule.days.join(', ')} ${schedule.local_time || 'time unknown'}; ${schedule.frequency}; ${schedule.location} [${schedule.evidence}; ${schedule.status || 'active'}]`,
    );
    if (schedule.valid_from || schedule.valid_until)
      console.log(
        `    Effective: ${schedule.valid_from || '?'} to ${schedule.valid_until || '?'}`,
      );
    console.log(`    Source: ${lookup(sources, schedule.source_id).url}`);
  }
  for (const sourceId of audit?.reference_source_ids || []) {
    const source = lookup(sources, sourceId);
    console.log(
      `  Source: ${source.url} (${source.authority}; ${source.roles.join(', ')}; ${source.access})`,
    );
  }
}
function eventLine(event: DatedEvent, clubs: Map<string, Club>) {
  return `  ${displayMinute(event.starts_at_local)}: ${lookup(clubs, event.club_id).name} — ${event.title} — ${event.location}`;
}
function printPublished(
  published: ReturnType<typeof eventsInWindow>,
  clubs: Map<string, Club>,
  sources: Map<string, Source>,
) {
  for (const [, event] of published) {
    console.log(eventLine(event, clubs));
    console.log(
      `    ${lookup(sources, event.source_id).url} (${event.source_type}; checked ${event.checked_on})`,
    );
    if (event.notes) console.log(`    Details: ${event.notes}`);
    for (const option of event.meeting_options || [])
      console.log(
        `    Alternate start: ${option.local_time} — ${option.location} — ${option.details}`,
      );
  }
  if (!published.length)
    console.log(
      '  None recorded in this snapshot; that does not mean no runs are scheduled.',
    );
}
function printPatterns(
  schedules: Schedule[],
  clubIds: Set<string>,
  now: Date,
  end: Date,
  clubs: Map<string, Club>,
  sources: Map<string, Source>,
) {
  console.log('\nUnconfirmed candidates projected from recurring patterns:');
  console.log(
    'These are NOT individually scheduled events; verify holidays, changes, access and cancellations.',
  );
  const projected = schedules
    .filter((schedule) => clubIds.has(schedule.club_id))
    .flatMap((schedule) =>
      candidates(schedule, now, end).map(
        (instant) => [instant, schedule] as const,
      ),
    );
  projected.sort((a, b) =>
    compareKeys(
      [a[0].getTime(), a[1].club_id, a[1].label],
      [b[0].getTime(), b[1].club_id, b[1].label],
    ),
  );
  for (const [instant, schedule] of projected) {
    console.log(
      `  ${displayMinute(localMinute(instant, schedule.timezone))}: ${lookup(clubs, schedule.club_id).name} — ${schedule.label} — ${schedule.location} [${schedule.evidence}; check ${schedule.checked_on}]`,
    );
    console.log(`    ${lookup(sources, schedule.source_id).url}`);
    if (schedule.notes) console.log(`    Details: ${schedule.notes}`);
  }
  if (!projected.length)
    console.log('  No supported patterns projected for this window.');
  console.log(
    '  Patterns with no time or an ambiguous frequency are omitted; use --club to inspect them.',
  );
}
function printUnconfirmed(
  unconfirmed: ReturnType<typeof eventsInWindow>,
  clubs: Map<string, Club>,
  sources: Map<string, Source>,
) {
  console.log('\nUnconfirmed dated listings:');
  console.log(
    'These require verification: some are unconfirmed third-party listings and others have conflicting details.',
  );
  for (const [, event] of unconfirmed) {
    console.log(eventLine(event, clubs));
    console.log(
      `    ${lookup(sources, event.source_id).url} (${event.source_type})`,
    );
    if (event.notes) console.log(`    Details: ${event.notes}`);
  }
  if (!unconfirmed.length) console.log('  None recorded in this snapshot.');
}
function main(argv?: string[], root = ROOT, clock = new Date()) {
  const options = args(
    {
      club: { type: 'string' },
      days: { type: 'string', default: '14' },
      'include-patterns': { type: 'boolean' },
      'include-unconfirmed': { type: 'boolean' },
      'as-of': { type: 'string' },
    },
    argv,
  );
  if (options.help) {
    console.log(
      'Print the research snapshot. Usage: node scripts/report.mts [--club NAME] [--days DAYS] [--as-of ISO] [--include-patterns] [--include-unconfirmed]',
    );
    return 0;
  }
  const days = nonnegative(options.days, '--days');
  const { now, end, zone } = reportWindow(options['as-of'], days, clock);
  const clubs = load('clubs', root),
    sources = load('sources', root),
    audits = load('audits', root),
    schedules = load('schedules', root),
    events = load('events', root);
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const auditByClub = new Map<string, Audit>();
  for (const audit of audits)
    if (!auditByClub.has(audit.club_id)) auditByClub.set(audit.club_id, audit);
  const selected = clubs.filter(
    (club) => !options.club || matchesClub(club, options.club),
  );
  if (!selected.length) throw new Error('No matching clubs');
  const selectedIds = new Set(selected.map((club) => club.id));
  console.log(
    'Snapshot, not a live calendar. Verify dates, location, and cancellations with the organizer.',
  );
  if (options.club)
    for (const club of selected)
      printClub(club, auditByClub.get(club.id), schedules, sourceById);
  console.log(
    `\nDated events between ${isoMinute(now, zone)} and ${isoMinute(end, zone)}:`,
  );
  printPublished(
    eventsInWindow(events, selectedIds, 'published', now, end),
    clubById,
    sourceById,
  );
  if (options['include-patterns'])
    printPatterns(schedules, selectedIds, now, end, clubById, sourceById);
  if (options['include-unconfirmed'])
    printUnconfirmed(
      eventsInWindow(events, selectedIds, 'unconfirmed', now, end),
      clubById,
      sourceById,
    );
  return 0;
}

export { eventsInWindow, main, matchesClub, printClub };

if (import.meta.main) cli(main);
