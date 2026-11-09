const {
  ROOT,
  load,
  args,
  nonnegative,
  cli,
  reportWindow,
  zonedDate,
  isoMinute,
  displayMinute,
  localMinute,
  compareKeys,
} = require('./lib.cjs');
const { candidates } = require('./forecast.cjs');
function matchesClub(club, query) {
  return `${club.name} ${club.id} ${club.user_supplied_name}`
    .toLowerCase()
    .includes(query.toLowerCase());
}
function eventsInWindow(events, clubIds, status, now, end) {
  return events
    .filter((event) => clubIds.has(event.club_id) && event.status === status)
    .map((event) => [zonedDate(event.starts_at_local, event.timezone), event])
    .filter(([start]) => now <= start && start <= end)
    .sort((a, b) => a[0] - b[0]);
}
function printClub(club, audit, schedules, sources) {
  if (!audit) console.log(`\n${club.name} — no audit recorded`);
  else {
    console.log(
      `\n${club.name} — ${audit.result} (checked ${audit.checked_on}; review by ${audit.review_due})`,
    );
    console.log(audit.notes);
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
    console.log(`    Source: ${sources.get(schedule.source_id).url}`);
  }
  for (const sourceId of audit?.reference_source_ids || []) {
    const source = sources.get(sourceId);
    console.log(
      `  Source: ${source.url} (${source.authority}; ${source.roles.join(', ')}; ${source.access})`,
    );
  }
}
function eventLine(event, clubs) {
  return `  ${displayMinute(event.starts_at_local)}: ${clubs.get(event.club_id).name} — ${event.title} — ${event.location}`;
}
function printPublished(published, clubs, sources) {
  for (const [, event] of published) {
    console.log(eventLine(event, clubs));
    console.log(
      `    ${sources.get(event.source_id).url} (${event.source_type}; checked ${event.checked_on})`,
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
function printPatterns(schedules, clubIds, now, end, clubs, sources) {
  console.log('\nUnconfirmed candidates projected from recurring patterns:');
  console.log(
    'These are NOT individually scheduled events; verify holidays, changes, access and cancellations.',
  );
  const projected = schedules
    .filter((schedule) => clubIds.has(schedule.club_id))
    .flatMap((schedule) =>
      candidates(schedule, now, end).map((instant) => [instant, schedule]),
    );
  projected.sort((a, b) =>
    compareKeys(
      [a[0].getTime(), a[1].club_id, a[1].label],
      [b[0].getTime(), b[1].club_id, b[1].label],
    ),
  );
  for (const [instant, schedule] of projected) {
    console.log(
      `  ${displayMinute(localMinute(instant, schedule.timezone))}: ${clubs.get(schedule.club_id).name} — ${schedule.label} — ${schedule.location} [${schedule.evidence}; check ${schedule.checked_on}]`,
    );
    console.log(`    ${sources.get(schedule.source_id).url}`);
    if (schedule.notes) console.log(`    Details: ${schedule.notes}`);
  }
  if (!projected.length)
    console.log('  No supported patterns projected for this window.');
  console.log(
    '  Patterns with no time or an ambiguous frequency are omitted; use --club to inspect them.',
  );
}
function printUnconfirmed(unconfirmed, clubs, sources) {
  console.log('\nUnconfirmed dated listings:');
  console.log(
    'These require verification: some are unconfirmed third-party listings and others have conflicting details.',
  );
  for (const [, event] of unconfirmed) {
    console.log(eventLine(event, clubs));
    console.log(
      `    ${sources.get(event.source_id).url} (${event.source_type})`,
    );
    if (event.notes) console.log(`    Details: ${event.notes}`);
  }
  if (!unconfirmed.length) console.log('  None recorded in this snapshot.');
}
function main(argv, root = ROOT, clock = new Date()) {
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
      'Print the research snapshot. Usage: node scripts/report.cjs [--club NAME] [--days DAYS] [--as-of ISO] [--include-patterns] [--include-unconfirmed]',
    );
    return 0;
  }
  const days = nonnegative(options.days, '--days');
  const { now, end, zone } = reportWindow(options['as-of'], days, clock);
  const [clubs, sources, audits, schedules, events] = [
    'clubs',
    'sources',
    'audits',
    'schedules',
    'events',
  ].map((name) => load(name, root));
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const auditByClub = new Map();
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
module.exports = { matchesClub, eventsInWindow, printClub, main };
if (require.main === module) cli(main);
