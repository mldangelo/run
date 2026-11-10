// Read-only review queue. Nothing here contacts a source or edits research.
// A club is due when its audit or a current pattern is due by the horizon, or
// a current pattern is flagged. Upcoming runs and races are queued for a
// source recheck, and clubs without a published run in the next two weeks
// are listed as coverage gaps.
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
import type {
  Audit,
  Club,
  DatedEvent,
  Race,
  Schedule,
  Source,
} from './types.mts';

const RACE_WINDOW_DAYS = 30;
const RACE_CHECK_MAX_AGE_DAYS = 30;
const RACE_REVIEW_CADENCE_DAYS = 7;
const EVENT_WINDOW_DAYS = 14;
// Registration snapshots matter to runners deciding months ahead.
const REGISTRATION_WINDOW_DAYS = 90;
const EVENT_CHECK_MAX_AGE_DAYS = 14;
// Links shown per queue row; the rest are counted.
const SOURCES_PER_ROW = 3;

/* The most recent dated research note's next step; on a tie, the last one
   appended wins. */
function nextResearchStep(audit: Audit | undefined) {
  const log = audit?.research_log || [];
  if (!log.length) return 'No research note recorded';
  return log.reduce((latest, entry) =>
    entry.checked_on >= latest.checked_on ? entry : latest,
  ).next_steps;
}
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
    const sourceIds = [...(audit?.reference_source_ids || [])];
    let patternsDue = 0;
    let patternsFlagged = 0;
    for (const pattern of schedules) {
      if (
        pattern.club_id !== club.id ||
        pattern.status === 'superseded' ||
        (pattern.valid_until && pattern.valid_until < today)
      )
        continue;
      // A flagged pattern is queued now, even before its review date.
      const flagged = pattern.status === 'needs_review';
      if (flagged || pattern.review_due <= horizon) {
        patternsDue++;
        if (flagged) patternsFlagged++;
        dueDates.push(
          flagged ? [pattern.review_due, today].sort()[0] : pattern.review_due,
        );
        if (pattern.source_id && !sourceIds.includes(pattern.source_id))
          sourceIds.push(pattern.source_id);
      }
    }
    if (dueDates.length)
      rows.push({
        id: club.id,
        name: club.name,
        due: dueDates.sort()[0],
        audit_due: auditDue,
        patterns_due: patternsDue,
        patterns_flagged: patternsFlagged,
        checked_on: audit?.checked_on ?? null,
        source_ids: sourceIds,
        next_steps: nextResearchStep(audit),
      });
  }
  return rows.sort((a, b) =>
    compareKeys([a.due, a.name.toLowerCase()], [b.due, b.name.toLowerCase()]),
  );
}
function racesDue(races: Race[], today: string, days = RACE_WINDOW_DAYS) {
  const last = addDays(today, days);
  const registrationLast = addDays(today, REGISTRATION_WINDOW_DAYS);
  const nextReminder = addDays(today, RACE_REVIEW_CADENCE_DAYS);
  const found = [];
  for (const race of races) {
    if (
      race.status !== 'scheduled' ||
      (race.end_date || race.date) < today ||
      race.date > [last, registrationLast].sort()[1]
    )
      continue;
    const reasons: string[] = [];
    if (race.date <= last) {
      if (race.needs_review) reasons.push('flagged');
      const ageDue = addDays(race.checked_on, RACE_CHECK_MAX_AGE_DAYS);
      const ageHorizon = [[race.date, today].sort()[1], nextReminder].sort()[0];
      if (ageDue <= today) reasons.push('check is 30+ days old');
      else if (ageDue <= ageHorizon)
        reasons.push(`check reaches 30 days on ${ageDue}`);
    }
    // After its review date a snapshot shows "Check registration" on the site.
    const registrationDue = [
      race.registration,
      ...(race.distances || []).map((option) => option.registration),
    ]
      .flatMap((snapshot) => (snapshot ? [snapshot.review_due] : []))
      .sort()[0];
    if (
      race.date <= registrationLast &&
      registrationDue &&
      registrationDue <= nextReminder
    )
      reasons.push(
        registrationDue < today
          ? `registration check was due ${registrationDue}`
          : `registration check due ${registrationDue}`,
      );
    if (reasons.length) found.push({ race, reasons });
  }
  return found.sort((a, b) =>
    compareKeys(
      [a.race.date, a.race.title.toLowerCase()],
      [b.race.date, b.race.title.toLowerCase()],
    ),
  );
}
/* Flagged, unconfirmed and aging upcoming listings. A stale check is a
   prompt to look, not evidence that anything changed. */
function eventQueue(events: DatedEvent[], today: string) {
  const last = addDays(today, EVENT_WINDOW_DAYS);
  const found = [];
  for (const event of events) {
    const start = event.starts_at_local.slice(0, 10);
    if (
      !['published', 'unconfirmed'].includes(event.status) ||
      start < today ||
      start > last
    )
      continue;
    const reasons = [];
    if (event.needs_review === true) reasons.push('flagged for review');
    if (event.status === 'unconfirmed') reasons.push('unconfirmed');
    if (!event.checked_on) reasons.push('no check date');
    else {
      const ageDue = addDays(event.checked_on, EVENT_CHECK_MAX_AGE_DAYS);
      const ageHorizon = [
        start,
        addDays(today, RACE_REVIEW_CADENCE_DAYS),
      ].sort()[0];
      if (ageDue <= today)
        reasons.push(`check is ${EVENT_CHECK_MAX_AGE_DAYS}+ days old`);
      else if (ageDue <= ageHorizon)
        reasons.push(
          `check reaches ${EVENT_CHECK_MAX_AGE_DAYS} days on ${ageDue}`,
        );
    }
    if (reasons.length) found.push({ event, reasons });
  }
  return found.sort((a, b) =>
    compareKeys(
      [a.event.starts_at_local, a.event.id],
      [b.event.starts_at_local, b.event.id],
    ),
  );
}
/* Clubs without a published dated run in the window. This is an index
   coverage gap, not evidence that a club is inactive. */
function coverageGaps(
  clubs: Club[],
  events: DatedEvent[],
  audits: Audit[],
  sources: Source[],
  today: string,
) {
  const last = addDays(today, EVENT_WINDOW_DAYS);
  const covered = new Set(
    events
      .filter((event) => {
        const start = event.starts_at_local.slice(0, 10);
        return event.status === 'published' && start >= today && start <= last;
      })
      .map((event) => event.club_id),
  );
  const auditByClub = new Map(audits.map((audit) => [audit.club_id, audit]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const channel = ['event', 'calendar', 'updates', 'schedule'];
  const rank = (source: Source) => [
    ['club', 'host'].includes(source.authority) ? 0 : 1,
    source.roles.some((role) => channel.includes(role)) ? 0 : 1,
  ];
  return clubs
    .filter((club) => !covered.has(club.id))
    .map((club) => {
      const audit = auditByClub.get(club.id);
      const refs = (audit?.reference_source_ids || [])
        .map((id) => sourceById.get(id))
        .filter((source): source is Source => Boolean(source))
        .map((source, index) => ({ source, index }))
        .sort(
          (a, b) =>
            compareKeys(rank(a.source), rank(b.source)) || a.index - b.index,
        )
        .map(({ source }) => source);
      return { club, sources: refs, next_steps: nextResearchStep(audit) };
    })
    .sort((a, b) =>
      a.club.name.toLowerCase().localeCompare(b.club.name.toLowerCase()),
    );
}
/* Markdown links for up to SOURCES_PER_ROW sources, with a count of the rest. */
function sourceLinks(
  list: Source[],
  label: (source: Source) => string,
  empty: string,
) {
  if (!list.length) return empty;
  const shown = list
    .slice(0, SOURCES_PER_ROW)
    .map((source) => `[source](${source.url}) (${label(source)})`);
  if (list.length > SOURCES_PER_ROW)
    shown.push(`${list.length - SOURCES_PER_ROW} more`);
  return shown.join('; ');
}
/* A table whose rows can be dropped from the end to fit a size limit. */
interface Table {
  header: string[];
  rows: string[];
  omitted: number;
}
function markdown(
  today: string,
  horizon: string,
  clubsDue: ReturnType<typeof dueClubs>,
  racesToReview: ReturnType<typeof racesDue>,
  eventsToReview: ReturnType<typeof eventQueue> = [],
  gaps: ReturnType<typeof coverageGaps> = [],
  clubs: Club[] = [],
  sources: Source[] = [],
  maxChars = Number.POSITIVE_INFINITY,
) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const known = (ids: Iterable<string>) =>
    [...new Set(ids)]
      .map((id) => sourceById.get(id))
      .filter((source): source is Source => Boolean(source));
  const parts: (string | Table)[] = [
    `Research review status as of ${today} (San Francisco). Club review horizon: ${horizon}.\n`,
  ];
  const overdue = clubsDue.filter((row) => row.due < today).length;
  if (clubsDue.length) {
    parts.push(
      `**${clubsDue.length} clubs** need a review (${overdue} overdue). Recheck each club's own channels, then update \`checked_on\` and \`review_due\` in \`data/audits.json\` and \`data/schedules.json\`.\n`,
      {
        header: [
          '| Club | Due | Audit | Patterns to review | Last checked | Sources | Next step |',
          '| --- | --- | --- | --- | --- | --- | --- |',
        ],
        rows: clubsDue.map((row) => {
          const patterns = row.patterns_flagged
            ? `${row.patterns_due} (${row.patterns_flagged} flagged)`
            : String(row.patterns_due);
          const links = sourceLinks(
            known(row.source_ids),
            (source) => cell(source.access),
            'none recorded',
          );
          return `| ${cell(row.name)} (\`${row.id}\`) | ${row.due} (${row.due < today ? 'overdue' : 'due'}) | ${row.audit_due ? 'yes' : 'no'} | ${patterns} | ${row.checked_on || 'never'} | ${links} | ${cell(row.next_steps)} |`;
        }),
        omitted: 0,
      },
    );
  } else parts.push('No club reviews are due.\n');
  if (racesToReview.length)
    parts.push(
      `**${racesToReview.length} upcoming races** need a check: races starting within ${RACE_WINDOW_DAYS} days or in progress that are flagged \`needs_review\` or whose checks reach ${RACE_CHECK_MAX_AGE_DAYS} days old by race day or the next weekly reminder, whichever comes first, and races within ${REGISTRATION_WINDOW_DAYS} days whose registration snapshot is due by the next reminder. Confirm details with the organizer before race day; checking a stale record does not by itself resolve a flag.\n`,
      {
        header: [
          '| Race | Date | Checked | Why | Source |',
          '| --- | --- | --- | --- | --- |',
        ],
        rows: racesToReview.map(
          ({ race, reasons }) =>
            `| ${cell(race.title)} (\`${race.id}\`) | ${race.date} | ${race.checked_on} | ${reasons.join(', ')} | ${race.source_url ? `[open](${race.source_url})` : 'not recorded'} |`,
        ),
        omitted: 0,
      },
    );
  parts.push(
    `**${eventsToReview.length} upcoming run listings** need a source check within ${EVENT_WINDOW_DAYS} days. Review the source for cancellations, time and meeting-point changes; a check date alone cannot detect them.\n`,
  );
  if (eventsToReview.length)
    parts.push({
      header: [
        '| Run | Starts (local) | Checked | Why | Source |',
        '| --- | --- | --- | --- | --- |',
      ],
      rows: eventsToReview.map(({ event, reasons }) => {
        const links = sourceLinks(
          known([event.source_id, ...(event.additional_source_ids || [])]),
          (source) => `${cell(source.authority)}; ${cell(source.access)}`,
          'not recorded',
        );
        const club = clubById.get(event.club_id)?.name || event.club_id;
        return `| ${cell(club)}: ${cell(event.title)} (\`${event.id}\`) | ${event.starts_at_local} | ${event.checked_on || 'never'} | ${reasons.join(', ')} | ${links} |`;
      }),
      omitted: 0,
    });
  parts.push(
    `**${gaps.length} clubs** have no published dated run in the next ${EVENT_WINDOW_DAYS} days. This is an index coverage gap, not evidence that a club has no runs or is inactive. Check organizer channels first; recurring patterns are leads, not dated confirmations. Gaps alone do not keep this issue open.\n`,
  );
  if (gaps.length)
    parts.push({
      header: [
        '| Club | Known sources (authority; access) | Next step |',
        '| --- | --- | --- |',
      ],
      rows: gaps.map(
        (row) =>
          `| ${cell(row.club.name)} (\`${row.club.id}\`) | ${sourceLinks(row.sources, (source) => `${cell(source.authority)}; ${cell(source.access)}`, 'none recorded')} | ${cell(row.next_steps)} |`,
      ),
      omitted: 0,
    });
  parts.push(
    'This queue reads the local snapshot only; it does not contact sources or detect changes. After a human checks the evidence and updates data, run `npm run verify`. See `research/tracking.md` for the process.',
  );
  const render = () =>
    `${parts
      .map((part) =>
        typeof part === 'string'
          ? part
          : `${[
              ...part.header,
              ...part.rows,
              ...(part.omitted
                ? [
                    `\n_${part.omitted} more ${part.omitted === 1 ? 'row' : 'rows'} omitted to fit; run \`npm run review -- --within 7\` for the full list._`,
                  ]
                : []),
            ].join('\n')}\n`,
      )
      .join('\n')}\n`;
  // Trim the least urgent tables first (coverage gaps, then runs, clubs and
  // races) until the report fits, keeping every section's summary.
  const tables = parts.filter(
    (part): part is Table => typeof part !== 'string',
  );
  let output = render();
  for (const table of tables.reverse())
    while (output.length > maxChars && table.rows.length) {
      table.rows.pop();
      table.omitted++;
      output = render();
    }
  return output;
}
function main(argv?: string[], root = ROOT, clock = new Date()) {
  const options = args(
    {
      'as-of': { type: 'string' },
      within: { type: 'string', default: '0' },
      count: { type: 'boolean' },
      'max-chars': { type: 'string' },
    },
    argv,
  );
  if (options.help) {
    console.log(
      'Summarize research due for review. Usage: node scripts/review_status.mts [--as-of YYYY-MM-DD] [--within DAYS] [--count] [--max-chars N]\n--count prints the number of clubs, runs and races needing a check; coverage gaps are not counted.\n--max-chars shortens the longest tables so the report fits, e.g. in a GitHub issue.',
    );
    return 0;
  }
  const within = nonnegative(options.within, '--within');
  const today = options['as-of'] || localMinute(clock, SF).slice(0, 10);
  if (!validDate(today))
    throw new Error('--as-of must be a valid date as YYYY-MM-DD');
  const horizon = addDays(today, within);
  const maxChars =
    options['max-chars'] === undefined
      ? Number.POSITIVE_INFINITY
      : nonnegative(options['max-chars'], '--max-chars');
  const clubs = load('clubs', root);
  const audits = load('audits', root);
  const events = load('events', root);
  const sources = load('sources', root);
  const clubsDue = dueClubs(
    clubs,
    audits,
    load('schedules', root),
    today,
    horizon,
  );
  const racesToReview = racesDue(load('races', root), today);
  const eventsToReview = eventQueue(events, today);
  // Coverage gaps are informational and never keep the reminder open.
  if (options.count)
    console.log(clubsDue.length + racesToReview.length + eventsToReview.length);
  else
    process.stdout.write(
      markdown(
        today,
        horizon,
        clubsDue,
        racesToReview,
        eventsToReview,
        coverageGaps(clubs, events, audits, sources, today),
        clubs,
        sources,
        maxChars,
      ),
    );
  return 0;
}

export {
  coverageGaps,
  dueClubs,
  eventQueue,
  main,
  markdown,
  nextResearchStep,
  racesDue,
};

if (import.meta.main) cli(main);
