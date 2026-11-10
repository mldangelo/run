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
  Schedule,
} from '../scripts/types.mts';

/* Pure date and filtering helpers shared by the website and its tests. */

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
      (filter.period !== 'upcoming' ||
        `${date}T${start.local_time}` >= current) &&
      timeMatches(start.local_time, filter.time),
  );
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
  const today = current.slice(0, 10);
  if (filter.period === 'today' && date !== today) return false;
  if (filter.period === 'tomorrow' && date !== addDays(today, 1)) return false;
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
export function raceMatches(race: Race, filter: Filter, now: Date) {
  const today = localMinute(now).slice(0, 10);
  const tomorrow = addDays(today, 1);
  const end = race.end_date || race.date;
  if (race.status !== 'scheduled') return false;
  if (filter.period === 'upcoming' && end < today) return false;
  if (filter.period === 'past' && end >= today) return false;
  if (filter.period === 'today' && (race.date > today || end < today))
    return false;
  if (filter.period === 'tomorrow' && (race.date > tomorrow || end < tomorrow))
    return false;
  if (
    filter.month !== 'all' &&
    !race.date.startsWith(filter.month) &&
    !end.startsWith(filter.month)
  )
    return false;
  if (filter.day !== 'all') {
    // A weekend listing may span days. Check each calendar day in the range.
    let match = false;
    for (let day = race.date; day <= end; day = addDays(day, 1)) {
      if (dayOf(day) === filter.day) match = true;
    }
    if (!match) return false;
  }
  if (filter.area !== 'all' && race.area !== filter.area) return false;
  if (filter.format === 'small_group' && race.format !== 'small_group')
    return false;
  if (filter.format === 'other' && race.format === 'small_group') return false;
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
/* Count research ages without allowing one fresh record to hide older ones. */
export function freshnessSummary(
  values: (string | null | undefined)[],
  today: string,
  staleAfterDays: number,
) {
  const checked = values.filter((value): value is string => Boolean(value));
  return {
    total: values.length,
    unknown: values.length - checked.length,
    stale: checked.filter((date) => daysBetween(date, today) > staleAfterDays)
      .length,
  };
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
