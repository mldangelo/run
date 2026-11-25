import type {
  Club,
  ClubPlaces,
  DatedEvent,
  Filter,
  LocationInfo,
  Race,
  Registration,
  RegistrationStatus,
  RunDetails,
  RunStatus,
  Schedule,
} from '../scripts/types.mts';

/* Pure date and filtering helpers shared by the website and its tests. */

/* "strava.com" for https://www.strava.com/clubs/…, for link text. */
export function siteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
/* Link text for a set of links shown together: the site name, plus the page
   address when several links share a site, so each link can be told apart.
   Only query parameters that differ between those links are shown, most
   varied first, and long addresses keep their start and end. */
export function linkLabels(urls: string[]) {
  const parsed = urls.map((url) => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  });
  const sites = urls.map(siteName);
  const labels = urls.map((_, index) => {
    const url = parsed[index];
    const group = parsed.filter(
      (other, at) => other && sites[at] === sites[index],
    ) as URL[];
    if (!url || group.length < 2) return sites[index];
    // How many different values each parameter takes across the site's links.
    const variety = (key: string) =>
      new Set(group.map((other) => other.searchParams.getAll(key).join('&')))
        .size;
    const query = [...url.searchParams]
      .filter(([key]) => variety(key) > 1)
      .sort(([a], [b]) => variety(b) - variety(a));
    const search = query.length ? `?${new URLSearchParams(query)}` : '';
    const path = `${url.pathname.replace(/\/$/, '')}${search}`;
    const short =
      path.length > 48 ? `${path.slice(0, 22)}…${path.slice(-25)}` : path;
    return `${sites[index]}${short}`;
  });
  // Number any links that still read alike.
  return new Map(
    urls.map((url, index) => {
      const same = labels.filter((label) => label === labels[index]).length;
      const order = labels
        .slice(0, index + 1)
        .filter((label) => label === labels[index]).length;
      return [url, same > 1 ? `${labels[index]} (${order})` : labels[index]];
    }),
  );
}

function searchText(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
/* Every search word must appear in the listing, in any order or field.
   Keep partial-name matches without requiring exact accents or punctuation. */
export function matchesQuery(query: string, ...fields: (string | undefined)[]) {
  const words = searchText(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const text = searchText(fields.join(' '));
  return words.every((word) => text.includes(word));
}

const SF = 'America/Los_Angeles';
const days = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];
/* Current wall-clock minute in a time zone, as YYYY-MM-DDTHH:MM. */
export function localMinute(now: Date, timezone = SF) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
/* Calendar arithmetic on YYYY-MM-DD strings, independent of the viewer. */
export function addDays(isoDate: string, count: number) {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
/** The current Saturday/Sunday, or the next pair on weekdays, in SF time. */
export function weekendBounds(now = new Date()) {
  const today = localMinute(now).slice(0, 10);
  const index = days.indexOf(dayOf(today));
  const start = addDays(today, index === 0 ? -1 : 6 - index);
  return { start, end: addDays(start, 1) };
}
export function daysBetween(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate.slice(0, 10)}T12:00:00Z`);
  const to = Date.parse(`${toDate.slice(0, 10)}T12:00:00Z`);
  return Math.round((to - from) / 86400000);
}
export function dayOf(localDate: string) {
  const [year, month, day] = localDate.slice(0, 10).split('-').map(Number);
  return days[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}
export function timeMatches(time: string | null, wanted: string) {
  if (wanted === 'all') return true;
  if (!time) return wanted === 'unknown';
  if (wanted === 'unknown') return false;
  const hour = Number(time.slice(0, 2));
  return wanted === 'am' ? hour < 12 : hour >= 12;
}
/* Missing sourced details are unknown, never an implicit negative. */
export function runDetailsMatch(
  record: { run_details?: RunDetails },
  filter: Partial<Filter> = {},
) {
  const details = record.run_details || {};
  const distance = filter.distance || 'all';
  const beginner = filter.beginner || 'all';
  const distances = details.distances || [];
  if (distance === 'unknown' && distances.length) return false;
  if (distance !== 'all' && distance !== 'unknown') {
    const matches = distances.some(({ min_miles: min, max_miles: max }) => {
      const upper = max ?? Number.POSITIVE_INFINITY;
      if (distance === 'up_to_3') return min <= 3;
      if (distance === '3_to_5') return min <= 5 && upper >= 3;
      if (distance === 'over_5') return upper > 5;
      return false;
    });
    if (!matches) return false;
  }
  if (beginner === 'welcome' && details.beginner_friendly !== true)
    return false;
  if (beginner === 'unknown' && details.beginner_friendly != null) return false;
  return true;
}
export function runLocationMatches(
  record: { location_info?: LocationInfo },
  filter: Partial<Filter> = {},
) {
  const location = record.location_info || {};
  const area = filter.area || 'all';
  const neighborhood = filter.neighborhood || 'all';
  return (
    (area === 'all' ||
      (area === 'unknown' ? !location.area : location.area === area)) &&
    (neighborhood === 'all' ||
      (neighborhood === 'unknown'
        ? !location.neighborhood
        : location.neighborhood === neighborhood))
  );
}
/* Keep a meeting's time and place together when selecting alternate starts. */
export function eventStarts(event: DatedEvent) {
  const primary = {
    local_time: event.starts_at_local.slice(11, 16),
    location: event.location,
  };
  const starts = [primary, ...(event.meeting_options || [])];
  return [
    ...new Map(
      starts.map((start) => [
        `${start.local_time}\u0000${start.location}`,
        start,
      ]),
    ).values(),
  ].sort((a, b) => a.local_time.localeCompare(b.local_time));
}
export function matchingEventStarts(
  event: DatedEvent,
  filter: Pick<Filter, 'period' | 'time'>,
  now: Date,
) {
  const starts = eventStarts(event);
  const current = localMinute(now, event.timezone);
  const date = event.starts_at_local.slice(0, 10);
  // An event is past only after every documented meeting option has passed.
  if (
    filter.period === 'past' &&
    starts.some((start) => `${date}T${start.local_time}` >= current)
  )
    return [];
  return starts.filter(
    (start) =>
      // The weekend shortcut is for planning ahead, so it skips started runs.
      (!['upcoming', 'weekend'].includes(filter.period) ||
        `${date}T${start.local_time}` >= current) &&
      timeMatches(start.local_time, filter.time),
  );
}
/* A period can be a named range or a single San Francisco calendar day. */
function dateForPeriod(period: string, today: string) {
  if (period === 'today') return today;
  if (period === 'tomorrow') return addDays(today, 1);
  return /^\d{4}-\d{2}-\d{2}$/.test(period) ? period : '';
}
export function eventMatches(event: DatedEvent, filter: Filter, now: Date) {
  const current = localMinute(now, event.timezone);
  if (filter.status !== 'all' && event.status !== filter.status) return false;
  if (!['published', 'unconfirmed'].includes(event.status)) return false;
  if (filter.month !== 'all' && !event.starts_at_local.startsWith(filter.month))
    return false;
  if (filter.day !== 'all' && dayOf(event.starts_at_local) !== filter.day)
    return false;
  const date = event.starts_at_local.slice(0, 10);
  const selectedDate = dateForPeriod(filter.period, current.slice(0, 10));
  if (selectedDate && date !== selectedDate) return false;
  if (filter.period === 'weekend') {
    const { start, end } = weekendBounds(now);
    if (date < start || date > end) return false;
  }
  return matchingEventStarts(event, filter, now).length > 0;
}
/* Effective dates are inclusive; recurrence remains a lead, never an event. */
export function patternState(pattern: Schedule, now: Date) {
  if (pattern.status === 'superseded') return 'superseded';
  const today = localMinute(now, pattern.timezone || SF).slice(0, 10);
  if (pattern.valid_from && today < pattern.valid_from) return 'future';
  if (pattern.valid_until && today > pattern.valid_until) return 'expired';
  return 'current';
}
export function patternMatches(
  pattern: Schedule,
  filter: Pick<Filter, 'day' | 'time'>,
  now = new Date(),
) {
  if (['superseded', 'expired'].includes(patternState(pattern, now)))
    return false;
  if (filter.day !== 'all' && !pattern.days.includes(filter.day)) return false;
  return timeMatches(pattern.local_time, filter.time);
}
/* Registration is a checked snapshot. Crossing a published boundary or
   review date calls for another check, never an inferred opening/closure. */
export function registrationState(
  registration: Registration | undefined,
  now = new Date(),
  raceDate?: string,
): RegistrationStatus {
  if (!registration) return 'unknown';
  const local = localMinute(now);
  const today = local.slice(0, 10);
  if (
    !registration.checked_on ||
    !registration.review_due ||
    today < registration.checked_on ||
    today > registration.review_due
  )
    return 'unknown';
  const passed = (value: string | undefined) =>
    value && (value.length === 10 ? today > value : local >= value);
  const reached = (value: string) =>
    value.length === 10 ? today >= value : local >= value;
  const { status, opens_at, closes_at } = registration;
  if (
    (['open', 'waitlist'].includes(status) && passed(closes_at)) ||
    (status === 'not_yet_open' && opens_at && reached(opens_at)) ||
    // Entries reported open before their published opening contradict it.
    (status === 'open' && opens_at && !reached(opens_at)) ||
    // From race day, advance entry counts only while a published closing
    // time is still ahead; starts may already have passed.
    (raceDate &&
      today >= raceDate &&
      ['open', 'waitlist', 'not_yet_open'].includes(status) &&
      (!closes_at || passed(closes_at)))
  )
    return 'unknown';
  return registration.status || 'unknown';
}
export function raceOptions(race: Race, filter: Partial<Filter> = {}) {
  return race.distances.filter(
    (option) =>
      (!filter.distance ||
        filter.distance === 'all' ||
        option.category === filter.distance) &&
      timeMatches(option.start_time, filter.time || 'all'),
  );
}
export function raceRegistration(
  race: Race,
  filter: Partial<Filter> = {},
  now = new Date(),
): RegistrationStatus | 'mixed' {
  const today = localMinute(now).slice(0, 10);
  if (race.status !== 'scheduled' || (race.end_date || race.date) < today)
    return 'unknown';
  const states = new Set(
    raceOptions(race, filter).map((option) =>
      registrationState(
        option.registration || race.registration,
        now,
        race.date,
      ),
    ),
  );
  return states.size > 1 ? 'mixed' : [...states][0] || 'unknown';
}
/* The distances a race's row shows: those matching the distance and time
   filters and, when one is chosen, the registration status. */
export function shownRaceOptions(
  race: Race,
  filter: Partial<Filter> = {},
  now = new Date(),
) {
  const wanted = filter.registration || 'all';
  return raceOptions(race, filter).filter(
    (option) =>
      ['all', 'mixed'].includes(wanted) ||
      raceRegistration({ ...race, distances: [option] }, {}, now) === wanted,
  );
}
/* The earliest listed start among those distances, which the row shows and
   a day's races are ordered by; null when none lists a time. */
export function firstRaceStart(
  race: Race,
  filter: Partial<Filter> = {},
  now = new Date(),
) {
  const starts = shownRaceOptions(race, filter, now)
    .map((option) => option.start_time)
    .filter((time): time is string => Boolean(time))
    .sort();
  return starts[0] ?? null;
}
export function raceMatches(race: Race, filter: Filter, now: Date) {
  const today = localMinute(now).slice(0, 10);
  const end = race.end_date || race.date;
  if (race.status !== 'scheduled') return false;
  if (filter.period === 'upcoming' && end < today) return false;
  if (filter.period === 'past' && end >= today) return false;
  if (filter.period === 'weekend') {
    // On Sunday, Saturday's races are over, as in Upcoming.
    const weekend = weekendBounds(now);
    if (race.date > weekend.end || end < weekend.start || end < today)
      return false;
  }
  const selectedDate = dateForPeriod(filter.period, today);
  if (selectedDate && (selectedDate < race.date || selectedDate > end))
    return false;
  if (filter.month !== 'all' || filter.day !== 'all') {
    let match = false;
    for (
      let day = selectedDate || race.date;
      day <= (selectedDate || end);
      day = addDays(day, 1)
    ) {
      if (
        (filter.month === 'all' || day.startsWith(filter.month)) &&
        (filter.day === 'all' || dayOf(day) === filter.day)
      ) {
        match = true;
        break;
      }
    }
    if (!match) return false;
  }
  if (filter.area !== 'all' && race.area !== filter.area) return false;
  if (
    ['small_group', 'kids', 'relay'].includes(filter.format) &&
    race.format !== filter.format
  )
    return false;
  if (filter.format === 'other' && race.format) return false;
  if (!raceOptions(race, filter).length) return false;
  if (!filter.registration || filter.registration === 'all') return true;
  if (filter.registration === 'mixed')
    return raceRegistration(race, filter, now) === 'mixed';
  return raceOptions(race, filter).some(
    (option) =>
      raceRegistration({ ...race, distances: [option] }, {}, now) ===
      filter.registration,
  );
}
/* Where a club meets, from runs that show it: current or upcoming
   recurring patterns and published dated runs (past or upcoming).
   Unconfirmed leads, expired and superseded patterns do not count.
   Returns neighborhood labels (most frequent first) and areas. */
export function clubPlaces(
  clubId: string,
  schedules: Schedule[],
  events: DatedEvent[],
  now = new Date(),
) {
  const runs = [
    ...schedules.filter(
      (pattern) =>
        pattern.club_id === clubId &&
        ['current', 'future'].includes(patternState(pattern, now)),
    ),
    ...events.filter(
      (event) => event.club_id === clubId && event.status === 'published',
    ),
  ];
  const counts = new Map<string, number>();
  const areas = new Set<string>();
  for (const run of runs) {
    const info = run.location_info || {};
    if (info.area) areas.add(info.area);
    if (info.neighborhood)
      counts.set(info.neighborhood, (counts.get(info.neighborhood) || 0) + 1);
  }
  return {
    neighborhoods: [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name),
    areas: [...areas].sort(),
  };
}
/* Areas named by a club's free-text geography. "San Francisco / Bay
   Area" belongs to both; "Marin" is matched as a word so "Marina" is not.
   Any other known geography is elsewhere in the Bay Area. */
export function geographyAreas(geography: string | null | undefined) {
  const geo = (geography || '').trim().toLowerCase();
  if (geo === '' || geo === 'unknown') return [];
  const areas: string[] = [];
  if (geo.includes('san francisco')) areas.push('sf');
  if (/\bmarin\b/.test(geo)) areas.push('marin');
  if (geo.includes('bay') || !areas.length) areas.push('bay');
  return areas;
}
/* A club is in an area if its geography says so or any run counted by
   clubPlaces is there. A neighborhood matches any of the club's places;
   "unknown" matches clubs with none recorded. */
export function clubMatches(
  club: Club,
  filter: Partial<Filter>,
  places: Partial<ClubPlaces> = {},
) {
  const neighborhoods = places.neighborhoods || [];
  const areas = places.areas || [];
  const wanted = filter.neighborhood || 'all';
  if (
    wanted === 'unknown'
      ? neighborhoods.length
      : wanted !== 'all' && !neighborhoods.includes(wanted)
  )
    return false;
  const named = geographyAreas(club.geography);
  if (!filter.area || filter.area === 'all') return true;
  if (filter.area === 'unknown') return !named.length && !areas.length;
  return named.includes(filter.area) || areas.includes(filter.area);
}
/* Most recent YYYY-MM-DD among the given values, or null. */
export function latestDate(values: (string | null | undefined)[]) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

/* ---------- Calendar files (RFC 5545) ---------- */

/* A listing's direct link, resolved against the current page so the
   GitHub Pages /run/ base is kept. */
export function listingURL(kind: string, id: string, base: string) {
  return new URL(`?${kind}=${encodeURIComponent(id)}`, base).href;
}
/* Offset of a time zone from UTC at an instant, in milliseconds. */
function zoneOffset(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = Object.fromEntries(
    parts.map(({ type, value }) => [type, Number(value)]),
  );
  const wall = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
  return wall - Math.floor(instant / 1000) * 1000;
}
/* The instant a YYYY-MM-DDTHH:MM wall-clock time occurs in an IANA time
   zone. A time repeated when clocks fall back is its first occurrence; a
   time skipped when clocks spring forward moves ahead by the gap, as
   calendar applications do. */
export function zonedTimeToUTC(local: string, timezone = SF) {
  const [year, month, day, hour = 0, minute = 0] = local
    .split(/[-T:]/)
    .map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const before = zoneOffset(wall - 86400000, timezone);
  const after = zoneOffset(wall + 86400000, timezone);
  const matches = [wall - before, wall - after].filter(
    (instant) => zoneOffset(instant, timezone) === wall - instant,
  );
  return new Date(matches.length ? Math.min(...matches) : wall - before);
}
/* RFC 5545 TEXT escaping for backslashes, semicolons, commas and line
   breaks. */
export function icsText(value: string) {
  return value
    .replace(/[\\;,]/g, (char) => `\\${char}`)
    .replace(/\r\n?|\n/g, '\\n');
}
/* Fold a content line so no line exceeds 75 UTF-8 octets, never splitting
   a character or an escape such as \n; each continuation line starts with
   a space. */
export function icsFold(line: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = '';
  let octets = 0;
  for (const piece of line.match(/\\[\\;,nN]|./gsu) || []) {
    const size = encoder.encode(piece).length;
    if (octets + size > 75) {
      lines.push(current);
      current = ' ';
      octets = 1;
    }
    current += piece;
    octets += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}
const icsDate = (isoDate: string) => isoDate.replaceAll('-', '');
const icsInstant = (date: Date) =>
  date
    .toISOString()
    .replace(/\.\d{3}/, '')
    .replace(/[-:]/g, '');
/* "7:05 AM" for a HH:MM local time. */
const clockTime = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
};
/* Only listings still expected to happen go on a calendar; cancelled and
   postponed details stay on the site for reference. */
const CALENDAR_STATUSES: {
  event: readonly RunStatus[];
  race: readonly Race['status'][];
} = { event: ['published', 'unconfirmed'], race: ['scheduled'] };
/* Offered for runs and races still expected to happen. Past listings,
   whose last day is before today, are not offered. */
export function calendarOffered(
  kind: string,
  status: string,
  lastDay?: string,
  today?: string,
) {
  return (
    (kind === 'event' || kind === 'race') &&
    (CALENDAR_STATUSES[kind] as readonly string[]).includes(status) &&
    !(lastDay && today && lastDay < today)
  );
}
/* "saturday-long-run-2026-11-14.ics": an ASCII slug of the title and
   the listing's date. */
export function calendarFileName(title: string, date: string) {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return `${slug || 'listing'}-${date.slice(0, 10)}.ics`;
}
export interface CalendarLinks {
  /** The listing's direct link on this site. */
  url: string;
  /** The page where a run was found. */
  source?: string;
  /** The club hosting a run. */
  club?: string;
}
/* Blank parts are dropped; paragraphs are separated by a blank line. */
const paragraphs = (...parts: (string | false | null | undefined)[][]) =>
  parts
    .map((lines) => lines.filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
function calendarFile(
  record: { id: string; title: string },
  timing: string[],
  fields: { location: string; url: string; description: string },
  now: Date,
  extra: string[] = [],
) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SF Run Club Index//Add to calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${icsText(record.id)}@mldangelo.github.io`,
    `DTSTAMP:${icsInstant(now)}`,
    ...timing,
    `SUMMARY:${icsText(record.title)}`,
    `LOCATION:${icsText(fields.location)}`,
    `URL:${fields.url}`,
    `DESCRIPTION:${icsText(fields.description)}`,
    ...extra,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}
/* A dated run as a timed event in UTC. The end is included only when the
   source lists one; unconfirmed runs are tentative. */
/* A run's recorded practical details as label/value lines, in the order the
   detail dialog and calendar files show them. Unknown details are left out. */
export function practicalLines(details: RunDetails = {}): [string, string][] {
  const yesNo = (value: boolean | undefined, yes: string, no: string) =>
    value === true ? yes : value === false ? no : '';
  const lines: [string, string | undefined][] = [
    ['Distance', details.distances?.map((option) => option.label).join(' / ')],
    ['Pace', details.pace],
    [
      'Beginners',
      yesNo(details.beginner_friendly, 'Welcome', 'Not beginner-friendly'),
    ],
    ['No-drop', yesNo(details.no_drop, 'Yes', 'No')],
    ['Cost', details.cost],
    ['RSVP', details.rsvp],
    ['Access', details.access],
    [
      'Meeting point',
      {
        members_only: 'Exact location visible to members',
        pending: 'Still to be announced',
        after_registration: 'Shared after registration or approval',
        listed: '',
      }[details.meeting_point ?? 'listed'],
    ],
    [
      'Joining',
      details.participation &&
        {
          open: 'Open to visitors',
          registration_required: 'Registration required',
          approval_required: 'Approval required',
          members_only: 'Members only',
          waiver_required: 'Waiver required for visitors',
        }[details.participation],
    ],
  ];
  return lines.filter((line): line is [string, string] => Boolean(line[1]));
}
/* Run details as search text, so a fact kept only in run_details (a
   distance, "50+", no-drop) still finds its run. Negative answers are left
   out so they don't match the word they deny. */
export function practicalSearchText(details: RunDetails = {}): string[] {
  return practicalLines(details).flatMap(([label, value]) =>
    value === 'No' || value.startsWith('Not ') ? [] : [`${label} ${value}`],
  );
}
export function eventCalendar(
  event: DatedEvent,
  links: CalendarLinks,
  now = new Date(),
) {
  if (!calendarOffered('event', event.status)) return null;
  const unconfirmed = event.status === 'unconfirmed';
  const utc = (local: string) =>
    icsInstant(zonedTimeToUTC(local, event.timezone));
  const options = (event.meeting_options || []).map(
    (option) =>
      `- ${clockTime(option.local_time)} · ${option.location}${option.details ? ` · ${option.details}` : ''}`,
  );
  // Requirements such as a waiver or RSVP travel with the saved event.
  const details = practicalLines(event.run_details).map(
    ([label, value]) => `${label}: ${value}`,
  );
  const description = paragraphs(
    [links.club && `Club: ${links.club}`, event.notes],
    details,
    options.length
      ? ['Other meeting options (San Francisco time):', ...options]
      : [],
    [
      unconfirmed &&
        'Unconfirmed: this run came from a less direct source and needs checking.',
      event.needs_review && 'Some details still need checking.',
      'Plans can change. Confirm with the club or organizer before you go.',
      links.source && `Event page: ${links.source}`,
      `Listing: ${links.url}`,
    ],
  );
  return {
    filename: calendarFileName(event.title, event.starts_at_local),
    ics: calendarFile(
      {
        id: event.id,
        title: unconfirmed ? `Unconfirmed: ${event.title}` : event.title,
      },
      [
        `DTSTART:${utc(event.starts_at_local)}`,
        ...(event.ends_at_local ? [`DTEND:${utc(event.ends_at_local)}`] : []),
      ],
      { location: event.location, url: links.url, description },
      now,
      unconfirmed ? ['STATUS:TENTATIVE'] : [],
    ),
  };
}
/* A race as an all-day event; the end date is exclusive. */
export function raceCalendar(
  race: Race,
  links: Pick<CalendarLinks, 'url'>,
  now = new Date(),
) {
  if (!calendarOffered('race', race.status)) return null;
  const distances = race.distances.map(
    (option) =>
      `- ${option.name} · ${option.start_time ? clockTime(option.start_time) : 'Time not listed'}${option.location ? ` · ${option.location}` : ''}`,
  );
  const description = paragraphs(
    [race.notes],
    ['Distances and start times (Pacific time):', ...distances],
    [
      race.needs_review && 'Some details still need checking.',
      'Details can change. Confirm with the organizer before you go.',
      `Race page: ${race.source_url}`,
      `Listing: ${links.url}`,
    ],
  );
  return {
    filename: calendarFileName(race.title, race.date),
    ics: calendarFile(
      race,
      [
        `DTSTART;VALUE=DATE:${icsDate(race.date)}`,
        `DTEND;VALUE=DATE:${icsDate(addDays(race.end_date || race.date, 1))}`,
      ],
      {
        location: race.location.includes(race.city)
          ? race.location
          : `${race.location}, ${race.city}`,
        url: links.url,
        description,
      },
      now,
    ),
  };
}
