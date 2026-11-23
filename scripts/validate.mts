// Deterministic validation of the canonical snapshot; malformed JSON records
// produce file/record diagnostics rather than exceptions.
import {
  cli,
  daysBetween,
  load,
  ROOT,
  validClock,
  validDate,
  validLocal,
  validZone,
  WEEKDAYS,
} from './lib.mts';
import {
  ACCESS_METHODS,
  AREAS,
  AUDIT_RESULTS,
  CHECK_METHODS,
  DISTANCE_CATEGORIES,
  MEETING_POINTS,
  PARTICIPATION,
  RACE_FORMATS,
  RACE_STATUSES,
  REGISTRATION_STATUSES,
  RUN_STATUSES,
  SCHEDULE_EVIDENCE,
  SCHEDULE_STATUSES,
  SOURCE_ACCESS,
  SOURCE_AUTHORITIES,
} from './vocabulary.mts';

type Row = { [key: string]: unknown };
type Options = {
  optional?: boolean;
  nullable?: boolean;
  allowEmpty?: boolean;
  nonempty?: boolean;
};

const DATASETS = [
  'clubs',
  'sources',
  'audits',
  'schedules',
  'events',
  'races',
  'neighborhoods',
] as const;
type Dataset = (typeof DATASETS)[number];
// The field that identifies a record, if not `id`.
const ID_KEYS: { [name: string]: string } = {
  audits: 'club_id',
  neighborhoods: 'name',
};
// Marin County's towns and unincorporated communities. A race or neighborhood
// named for one of these places must use the 'marin' area.
const MARIN_PLACES = new Set<unknown>([
  'Belvedere',
  'Corte Madera',
  'Fairfax',
  'Larkspur',
  'Mill Valley',
  'Novato',
  'Ross',
  'San Anselmo',
  'San Rafael',
  'Sausalito',
  'Tiburon',
  'Alto',
  'Bolinas',
  'Dillon Beach',
  'Greenbrae',
  'Inverness',
  'Kentfield',
  'Lagunitas',
  'Forest Knolls',
  'Lucas Valley',
  'Marinwood',
  'Marin City',
  'Muir Beach',
  'Nicasio',
  'Olema',
  'Point Reyes Station',
  'San Geronimo',
  'Santa Venetia',
  'Sleepy Hollow',
  'Stinson Beach',
  'Strawberry',
  'Tamalpais-Homestead Valley',
  'Tomales',
  'Woodacre',
]);
/* Text shown to runners stays plain. Evidence mechanics such as retrieval
   methods, sign-in states and source comparisons belong in research notes. */
const EVIDENCE_WORDING =
  /\b(HTTP|JSON-LD|cached?|WebFetch|curl|signed[- ](?:in|out)|search (?:results?|snippets?)|scrap(?:ed|ing)|fetch(?:ed|er)?|evidence|research notes?)\b/i;
/* A club description says what the club is; meeting times live in its
   regular runs, which carry their own sources and caveats. */
const CLOCK_TIME = /\b\d{1,2}(?::\d{2})?\s?[ap]\.?m\b\.?/i;
const MISSING = Symbol('missing');
const isObject = (value: unknown): value is Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const kind = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const list = (value: unknown) => (Array.isArray(value) ? value : []);
// Items that appear more than once, each named once, in sorted order.
const repeated = <T,>(items: T[]) =>
  [
    ...new Set(items.filter((item, index) => items.indexOf(item) !== index)),
  ].sort();
// Keep existing diagnostic notation stable for maintainers and parity checks.
function repr(value: unknown): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    return (
      quote +
      value
        .replaceAll('\\', '\\\\')
        .replaceAll(quote, `\\${quote}`)
        .replaceAll('\n', '\\n')
        .replaceAll('\r', '\\r')
        .replaceAll('\t', '\\t') +
      quote
    );
  }
  if (Array.isArray(value)) return `[${value.map(repr).join(', ')}]`;
  if (isObject(value))
    return `{${Object.entries(value)
      .map(([key, item]) => `${repr(key)}: ${repr(item)}`)
      .join(', ')}}`;
  return String(value);
}
function urlProblem(value: unknown) {
  if (typeof value !== 'string')
    return `must be an https URL string, got ${kind(value)}`;
  if (!/^https:/i.test(value)) return `must use https: ${repr(value)}`;
  if (!/^https:\/\/[^/\s?#]+/i.test(value))
    return `must include a host: ${repr(value)}`;
  return URL.canParse(value) ? null : `is not a valid URL: ${repr(value)}`;
}

/* One JSON object and the diagnostics for it. Accessors report a missing or
   malformed field and return the valid value, or null when there is none. */
class Record {
  declare errors: string[];
  declare label: string;
  declare row: Row;
  declare prefix: string;
  // The fields a check has read; see only().
  seen = new Set<string>();
  constructor(errors: string[], label: string, row: Row, prefix = '') {
    Object.assign(this, { errors, label, row, prefix });
  }
  error(message: string) {
    this.errors.push(`${this.label}: ${message}`);
  }
  name(key: string) {
    return this.prefix + key;
  }
  value(key: string, { optional = false }: Options = {}): unknown {
    this.seen.add(key);
    if (Object.hasOwn(this.row, key)) return this.row[key];
    if (!optional) this.error(`missing required field ${repr(this.name(key))}`);
    return MISSING;
  }
  /* A field is known when a check reads it. Anything else is a typo or a
     copy of a fact whose home is another field or file. */
  only(what?: string) {
    for (const key of Object.keys(this.row))
      if (!this.seen.has(key))
        this.error(
          what
            ? `${this.name(key)} is not a ${what} field`
            : `unknown field ${repr(key)}`,
        );
  }
  text(
    key: string,
    { allowEmpty = false, nullable = false, optional = false }: Options = {},
  ) {
    const value = this.value(key, { optional });
    if (value === MISSING || (value === null && nullable)) return null;
    if (typeof value !== 'string') {
      this.error(`${this.name(key)} must be a string, got ${kind(value)}`);
      return null;
    }
    if (!allowEmpty && !value.trim()) {
      this.error(`${this.name(key)} must not be empty`);
      return null;
    }
    return value;
  }
  runnerText(...keys: string[]) {
    for (const key of keys) {
      const value = this.value(key, { optional: true });
      const match = typeof value === 'string' && value.match(EVIDENCE_WORDING);
      if (match)
        this.error(
          `${this.name(key)} is shown to runners; move evidence wording such as ${repr(match[0])} to research notes`,
        );
    }
  }
  choice<T>(key: string, allowed: readonly T[], options: Options = {}) {
    const value = this.value(key, options);
    if (value === MISSING) return null;
    if (allowed.includes(value as T)) return value as T;
    this.error(
      `${this.name(key)} is ${repr(value)}; expected one of ${allowed.map(repr).sort().join(', ')}`,
    );
    return null;
  }
  flag(key: string, options: Options = {}) {
    const value = this.value(key, options);
    if (value !== MISSING && typeof value !== 'boolean')
      this.error(`${this.name(key)} must be true or false, got ${kind(value)}`);
  }
  items(
    key: string,
    { optional = false, nonempty = false }: Options = {},
  ): unknown[] {
    const value = this.value(key, { optional });
    if (value === MISSING) return [];
    if (!Array.isArray(value)) {
      this.error(`${this.name(key)} must be an array, got ${kind(value)}`);
      return [];
    }
    if (nonempty && !value.length)
      this.error(`${this.name(key)} must not be empty`);
    return value;
  }
  // An optional nested object, checked as a record of its own.
  child(
    key: string,
    problem = `must be an object, got ${kind(this.row[key])}`,
  ) {
    const value = this.value(key, { optional: true });
    if (value === MISSING) return null;
    if (isObject(value))
      return new Record(this.errors, this.label, value, `${this.name(key)}.`);
    this.error(`${this.name(key)} ${problem}`);
    return null;
  }
  children(key: string, options: Options = {}): Record[] {
    return this.items(key, options).flatMap((row, index) => {
      const field = `${this.name(key)}[${index}]`;
      if (isObject(row))
        return [new Record(this.errors, this.label, row, `${field}.`)];
      this.error(`${field} must be an object, got ${kind(row)}`);
      return [];
    });
  }
  // `nullable` accepts null; an empty string is never a valid date or time.
  parsed(
    key: string,
    valid: (value: unknown) => value is string,
    description: string,
    { optional = false, nullable = false }: Options = {},
  ) {
    const value = this.value(key, { optional });
    if (value === MISSING || (nullable && value === null)) return null;
    if (valid(value)) return value;
    this.error(
      `${this.name(key)} must be a valid ${description}, got ${repr(value)}`,
    );
    return null;
  }
  date(key: string, options: Options = {}) {
    return this.parsed(key, validDate, 'date as YYYY-MM-DD', options);
  }
  clock(key: string, options: Options = {}) {
    return this.parsed(key, validClock, 'time as HH:MM', options);
  }
  localDatetime(key: string, options: Options = {}) {
    return this.parsed(
      key,
      validLocal,
      'local date and time as YYYY-MM-DDTHH:MM, with no seconds, offset or space',
      options,
    );
  }
  timezone(key: string) {
    const value = this.text(key);
    if (value !== null && !validZone(value))
      this.error(
        `${this.name(key)} ${repr(value)} is not a known IANA time zone`,
      );
  }
  url(field: string, value: unknown): value is string {
    const problem = urlProblem(value);
    if (problem) this.error(`${field} ${problem}`);
    return !problem;
  }
  httpsUrl(key: string, options: Options = {}) {
    const value = this.value(key, options);
    return value !== MISSING && this.url(this.name(key), value) ? value : null;
  }
  // The valid entries of an array of https URLs.
  urls(key: string, options: Options = {}) {
    return this.items(key, options).filter((url, index) =>
      this.url(`${this.name(key)}[${index}]`, url),
    ) as string[];
  }
  // The ID, if it names a known record.
  reference(key: string, known: Map<string, unknown>) {
    const value = this.text(key);
    if (value === null || known.has(value)) return value;
    this.error(`unknown ${this.name(key)} ${repr(value)}`);
    return null;
  }
  references(key: string, known: Map<string, unknown>, options: Options = {}) {
    this.items(key, options).forEach((value, index) => {
      if (typeof value !== 'string')
        this.error(
          `${this.name(key)}[${index}] must be a string, got ${kind(value)}`,
        );
      else if (!known.has(value))
        this.error(`unknown ${this.name(key)} entry ${repr(value)}`);
    });
  }
  notBefore(
    laterKey: string,
    later: string | null,
    earlierKey: string,
    earlier: string | null,
  ) {
    if (later && earlier && later < earlier)
      this.error(
        `${this.name(laterKey)} ${later} is before ${this.name(earlierKey)} ${earlier}`,
      );
  }
  /* checked_on and the review_due that follows it, within `days` if given.
     Returns the check date. */
  reviewDates(days = Infinity, message = '') {
    const checked = this.date('checked_on');
    const due = this.date('review_due');
    this.notBefore('review_due', due, 'checked_on', checked);
    if (checked && due && daysBetween(checked, due) > days) this.error(message);
    return checked;
  }
}

type Context = {
  clubs: Map<string, Record>;
  sources: Map<string, Record>;
  // Neighborhood areas, or null when neighborhoods.json is unreadable.
  areas: Map<string, string> | null;
  // Event IDs, and the aliases races have claimed so far.
  eventIds: Set<unknown>;
};

/* A dataset's records, labelled by ID, and the first record with each ID. */
function records(
  errors: string[],
  data: Row,
  name: Dataset,
): [Record[], Map<string, Record>] {
  const file = `${name}.json`;
  const key = ID_KEYS[name] ?? 'id';
  const rows = data[name];
  if (!Array.isArray(rows)) {
    errors.push(
      Object.hasOwn(data, name)
        ? `${file}: expected an array of records, got ${kind(rows)}`
        : `${file}: dataset is missing`,
    );
    return [[], new Map()];
  }
  const found = rows.flatMap((row, index) => {
    const id = isObject(row) && row[key];
    const label =
      typeof id === 'string' && id.trim()
        ? `${file} ${id}`
        : `${file} [${index}]`;
    if (isObject(row)) return [new Record(errors, label, row)];
    errors.push(`${label}: expected an object, got ${kind(row)}`);
    return [];
  });
  const groups = new Map<string, Record[]>();
  for (const record of found) {
    const id = record.text(key);
    if (id !== null) groups.set(id, [...(groups.get(id) ?? []), record]);
  }
  for (const group of groups.values())
    if (group.length > 1)
      group[0].error(`duplicate ${key} (appears ${group.length} times)`);
  return [found, new Map([...groups].map(([id, group]) => [id, group[0]]))];
}
// A record named for a Marin County town must use the 'marin' area. Not the
// reverse: a Marin record can name a park or landmark such as the Marin Headlands.
function checkMarin(record: Record, key: string, area: string | null) {
  const place = record.row[key];
  if (area && area !== 'marin' && MARIN_PLACES.has(place))
    record.error(
      `${key} ${repr(place)} is in Marin County, so area must be 'marin', got ${repr(area)}`,
    );
}
function checkClub(club: Record) {
  club.text('name');
  club.text('geography');
  club.text('user_supplied_name', { allowEmpty: true });
  const time = club.text('description')?.match(CLOCK_TIME);
  club.runnerText('description');
  if (time)
    club.error(
      `description repeats a meeting time (${repr(time[0])}); keep times in the club's regular runs`,
    );
}
function checkSource(source: Record, pages: Map<string, unknown>) {
  source.httpsUrl('url');
  // One record per page, so its access and check date have one home. The
  // same page with or without www. or a trailing slash is one source.
  const url = source.row.url;
  if (typeof url === 'string') {
    const page = url.replace(/^https:\/\/www\./, 'https://').replace(/\/$/, '');
    if (pages.has(page))
      source.error(
        `url ${repr(url)} is already recorded as ${repr(pages.get(page))}`,
      );
    else pages.set(page, source.row.id);
  }
  source.items('roles', { nonempty: true }).forEach((role, index) => {
    if (typeof role !== 'string' || !role.trim())
      source.error(
        `roles[${index}] must be a non-empty string, got ${repr(role)}`,
      );
  });
  source.choice('authority', SOURCE_AUTHORITIES);
  source.choice('access', SOURCE_ACCESS);
}
function checkAudit(audit: Record, sources: Map<string, Record>) {
  audit.references('reference_source_ids', sources);
  // Clubs with runs or patterns are rechecked at least every 14 days;
  // clubs with no current details or an unresolved identity every 30.
  const result = audit.choice('result', AUDIT_RESULTS);
  const days =
    result === 'no_current_details' || result === 'identity_unresolved'
      ? 30
      : 14;
  const checked = audit.reviewDates(
    days,
    `review_due must be within ${days} days of checked_on for result ${repr(audit.row.result)}`,
  );
  audit.text('notes');
  for (const entry of audit.children('research_log', { optional: true })) {
    const entryChecked = entry.date('checked_on');
    if (checked && entryChecked && entryChecked > checked)
      entry.error(
        `${entry.name('checked_on')} must not be after audit checked_on ${checked}`,
      );
    entry.text('summary');
    entry.text('next_steps');
    for (const check of entry.children('source_checks')) {
      const id = check.reference('source_id', sources);
      const listed = audit.row.reference_source_ids;
      if (id && Array.isArray(listed) && !listed.includes(id))
        check.error(
          `${check.name('source_id')} must also be listed in reference_source_ids`,
        );
      check.choice('method', CHECK_METHODS);
      check.text('notes');
      // A page fetched before the research date keeps its own date; it
      // becomes the source's check date on the site.
      const observed = check.date('observed_on', { optional: true });
      if (observed && entryChecked && observed > entryChecked)
        check.error(
          `${check.name('observed_on')} must not be after the entry's checked_on ${entryChecked}`,
        );
      check.only('source check');
    }
  }
}
/* The text every run and race shows runners, and the research notes that
   keep evidence detail for maintainers out of it. */
function checkListing(record: Record, title: string) {
  record.text(title);
  record.text('location');
  record.runnerText(title, 'location', 'notes');
  record.text('research_notes', { optional: true });
}
/* What regular runs (schedules) and dated runs (events) share. */
function checkRun(run: Record, title: string, context: Context) {
  checkListing(run, title);
  run.reference('club_id', context.clubs);
  run.reference('source_id', context.sources);
  run.timezone('timezone');
  checkRunDetails(run, context.sources);
  checkLocation(run, context.areas);
}
function checkLocation(run: Record, areas: Context['areas']) {
  const info = run.child('location_info');
  if (!info) return;
  const area = info.choice('area', AREAS, { optional: true });
  info.text('neighborhood', { optional: true });
  info.text('directions_query', { optional: true });
  const name = info.row.neighborhood;
  if (!areas || typeof name !== 'string') return;
  if (!areas.has(name))
    info.error(
      `${info.name('neighborhood')} ${repr(name)} is not listed in neighborhoods.json`,
    );
  else if (
    !Object.hasOwn(info.row, 'area') ||
    (area && area !== areas.get(name))
  )
    info.error(
      `${info.name('area')} must be ${repr(areas.get(name))} to match neighborhood ${repr(name)}, got ${repr(area)}`,
    );
}
function checkRunDetails(run: Record, sources: Map<string, Record>) {
  const details = run.child('run_details');
  if (!details) return;
  details.choice('meeting_point', MEETING_POINTS, { optional: true });
  details.choice('participation', PARTICIPATION, { optional: true });
  // Labels share the run's own source and check date unless run_details
  // records different ones.
  for (const key of ['pace', 'cost', 'rsvp', 'access'])
    details.text(key, { optional: true });
  details.runnerText('pace', 'cost', 'rsvp', 'access');
  for (const key of ['beginner_friendly', 'no_drop'])
    details.flag(key, { optional: true });
  details.urls('sources', { optional: true, nonempty: true });
  details.date('checked_on', { optional: true });
  // Store details' provenance only when it differs from the run's own.
  const dated = Object.hasOwn(details.row, 'checked_on');
  if (dated && details.row.checked_on === run.row.checked_on)
    details.error(
      `${details.name('checked_on')} repeats the run's checked_on; omit it`,
    );
  const own = [run.row.source_id, ...list(run.row.additional_source_ids)]
    .map((id) => sources.get(id as string)?.row.url)
    .filter((url) => typeof url === 'string');
  const listed = list(details.row.sources);
  if (listed.length && listed.every((url) => own.includes(url))) {
    // With a separate check date, the run's primary source alone is implied.
    if (!dated)
      details.error(
        `${details.name('sources')} repeats the run's own sources and check date; omit it`,
      );
    else if (listed.length === 1 && listed[0] === own[0])
      details.error(
        `${details.name('sources')} repeats the run's source_id; keep only ${details.name('checked_on')}`,
      );
  }
  for (const distance of details.children('distances', {
    optional: true,
    nonempty: true,
  })) {
    distance.text('label');
    const miles = (key: string, nullable = false) => {
      const value = distance.value(key);
      if (value === MISSING || (nullable && value === null)) return null;
      if (typeof value === 'number' && Number.isFinite(value) && value > 0)
        return value;
      distance.error(
        `${distance.name(key)} must be a finite positive number, got ${repr(value)}`,
      );
      return null;
    };
    const min = miles('min_miles');
    const max = miles('max_miles', true);
    if (min !== null && max !== null && min > max)
      distance.error(
        `${distance.name('min_miles')} must not exceed ${distance.name('max_miles')}`,
      );
  }
}
function checkSchedule(schedule: Record, context: Context) {
  checkRun(schedule, 'label', context);
  schedule.text('frequency');
  const unknown = schedule
    .items('days', { nonempty: true })
    .filter((day) => !WEEKDAYS.includes(day as string));
  if (unknown.length)
    schedule.error(
      `days has unknown values ${repr(unknown)}; expected lower-case weekday names`,
    );
  schedule.choice('evidence', SCHEDULE_EVIDENCE);
  schedule.choice('status', SCHEDULE_STATUSES, { optional: true });
  schedule.clock('local_time', { nullable: true });
  schedule.text('notes', { allowEmpty: true });
  schedule.reviewDates();
  const from = schedule.date('valid_from', { nullable: true });
  const until = schedule.date('valid_until', { nullable: true });
  schedule.notBefore('valid_until', until, 'valid_from', from);
}
function checkEvent(event: Record, context: Context) {
  checkRun(event, 'title', context);
  const status = event.choice('status', RUN_STATUSES);
  // A run whose meeting point is still pending cannot be listed as confirmed.
  const details = event.row.run_details;
  if (
    status === 'published' &&
    isObject(details) &&
    details.meeting_point === 'pending'
  )
    event.error(
      "status 'published' requires a known meeting point; use 'unconfirmed' while run_details.meeting_point is 'pending'",
    );
  const url = context.sources.get(String(event.row.source_id))?.row.url;
  const page = typeof url === 'string' ? URL.parse(url) : null;
  if (
    status === 'published' &&
    page &&
    ['meetup.com', 'www.meetup.com'].includes(page.hostname) &&
    page.pathname.startsWith('/find/')
  )
    event.error(
      'published Meetup events must cite an event permalink, not a changing search page; use unconfirmed until dated evidence is available',
    );
  event.references('additional_source_ids', context.sources, {
    optional: true,
  });
  event.flag('needs_review', { optional: true });
  event.text('notes', { allowEmpty: true });
  event.date('checked_on');
  const start = event.localDatetime('starts_at_local');
  const end = event.localDatetime('ends_at_local', {
    optional: true,
    nullable: true,
  });
  if (start && end && end <= start)
    event.error(
      `ends_at_local ${repr(end)} must be after starts_at_local ${repr(start)}`,
    );
  for (const option of event.children('meeting_options', { optional: true })) {
    option.clock('local_time');
    option.text('location');
    option.text('details');
    option.runnerText('location', 'details');
  }
}
function checkRace(race: Record, { clubs, eventIds }: Context) {
  for (const id of race.items('club_ids', { optional: true, nonempty: true }))
    if (typeof id !== 'string' || !clubs.has(id))
      race.error(`unknown club_ids entry ${repr(id)}`);
  for (const id of race.items('former_event_ids', {
    optional: true,
    nonempty: true,
  })) {
    if (typeof id !== 'string' || !id.startsWith('evt-'))
      race.error('former_event_ids entries must be event IDs');
    else if (eventIds.has(id))
      race.error(
        `former_event_ids duplicates an event or another alias: ${id}`,
      );
    else eventIds.add(id);
  }
  const start = race.date('date');
  const end = race.date('end_date', { nullable: true }) || start;
  if (start && end) {
    if (end < start) race.error(`end_date ${end} precedes date ${start}`);
    else if (daysBetween(start, end) > 31)
      race.error(
        `spans ${daysBetween(start, end)} days; at most 31 are allowed`,
      );
  }
  checkListing(race, 'title');
  race.text('city');
  race.text('notes', { allowEmpty: true });
  checkMarin(race, 'city', race.choice('area', AREAS));
  race.choice('format', [null, ...RACE_FORMATS], { optional: true });
  race.flag('needs_review');
  race.choice('status', RACE_STATUSES);
  race.date('checked_on');
  checkRegistration(race, end);
  for (const distance of race.children('distances', { nonempty: true })) {
    distance.text('name');
    distance.choice('category', DISTANCE_CATEGORIES);
    distance.clock('start_time', { nullable: true });
    distance.text('location', { nullable: true });
    distance.runnerText('name', 'location');
    checkRegistration(distance, end);
  }
  const source = race.httpsUrl('source_url');
  const urls = [
    ...(source ? [source] : []),
    ...race.urls('additional_sources'),
  ];
  for (const url of repeated(urls))
    race.error(`source URL listed more than once: ${repr(url)}`);
}
/* A race's or a distance's registration snapshot. */
function checkRegistration(parent: Record, raceEnd: string | null) {
  const record = parent.child('registration', 'must be an object');
  if (!record) return;
  // 'registration', or 'distances[2].registration' on a distance.
  const label = parent.name('registration');
  const status = record.choice('status', REGISTRATION_STATUSES);
  record.httpsUrl('source_url');
  record.httpsUrl('url', { optional: true });
  record.choice('access_method', ACCESS_METHODS);
  record.text('notes');
  record.runnerText('notes');
  record.text('evidence_notes', { optional: true });
  const checked = record.reviewDates(
    14,
    `${label}.review_due must be within 14 days of checked_on`,
  );
  // A boundary is a local date, or a local date and time.
  const [opens, closes] = ['opens_at', 'closes_at'].map((key) => {
    const value = record.row[key];
    return typeof value === 'string' && value.length === 10
      ? record.date(key)
      : record.localDatetime(key, { optional: true });
  });
  if (opens && closes) {
    const length = Math.min(opens.length, closes.length);
    if (closes.slice(0, length) < opens.slice(0, length))
      record.error(`${label}.closes_at precedes opens_at`);
  }
  // The reported status must agree with the boundaries known when checked.
  const opensDay = opens?.slice(0, 10);
  const closesDay = closes?.slice(0, 10);
  if (checked) {
    if (status === 'open' && opensDay && opensDay > checked)
      record.error(
        `${label} is open but opens_at ${opens} is after checked_on ${checked}`,
      );
    if (status === 'not_yet_open' && opensDay && opensDay < checked)
      record.error(
        `${label} is not_yet_open but opens_at ${opens} precedes checked_on ${checked}`,
      );
    if (
      (status === 'open' || status === 'waitlist') &&
      closesDay &&
      closesDay < checked
    )
      record.error(
        `${label} is ${status} but closes_at ${closes} precedes checked_on ${checked}`,
      );
  }
  if (raceEnd && closesDay && closesDay > raceEnd)
    record.error(
      `${label}.closes_at ${closes} is after the race ends on ${raceEnd}`,
    );
  record.only('registration');
}
function checkText(record: Record) {
  function walk(value: unknown, field: string): void {
    if (typeof value === 'string') {
      if (value !== value.trim())
        record.error(
          `${field} has leading or trailing whitespace: ${repr(value.slice(0, 40))}`,
        );
      const sentences = value
        .trim()
        .split(/(?<=[.!?])\s+/)
        .filter((part) => part.length >= 20);
      for (const sentence of repeated(sentences))
        record.error(
          `${field} repeats the sentence ${repr(sentence.slice(0, 60))}`,
        );
    } else if (Array.isArray(value))
      for (const [index, item] of value.entries())
        walk(item, `${field}[${index}]`);
    else if (isObject(value))
      for (const [key, item] of Object.entries(value))
        walk(item, field ? `${field}.${key}` : key);
  }
  walk(record.row, '');
}
function validate(data: unknown): string[] {
  if (!isObject(data))
    return [`expected a mapping of datasets, got ${kind(data)}`];
  const errors: string[] = [];
  const rows = {} as { [name in Dataset]: Record[] };
  const ids = {} as { [name in Dataset]: Map<string, Record> };
  for (const name of DATASETS)
    [rows[name], ids[name]] = records(errors, data, name);
  const context: Context = {
    clubs: ids.clubs,
    sources: ids.sources,
    areas: Array.isArray(data.neighborhoods) ? new Map() : null,
    eventIds: new Set(rows.events.map(({ row }) => row.id)),
  };
  for (const row of rows.neighborhoods) {
    const area = row.choice('area', AREAS);
    row.text('includes');
    checkMarin(row, 'name', area);
    if (typeof row.row.name === 'string' && area)
      context.areas?.set(row.row.name, area);
  }
  for (const club of rows.clubs) checkClub(club);
  const pages = new Map<string, unknown>();
  for (const source of rows.sources) checkSource(source, pages);
  for (const [id, audit] of ids.audits)
    if (!ids.clubs.has(id)) audit.error(`unknown club_id ${repr(id)}`);
  for (const [id, club] of ids.clubs)
    if (!ids.audits.has(id))
      club.error('has no audit in audits.json; every club needs one audit');
  for (const audit of rows.audits) checkAudit(audit, ids.sources);
  for (const schedule of rows.schedules) checkSchedule(schedule, context);
  for (const event of rows.events) checkEvent(event, context);
  for (const race of rows.races) checkRace(race, context);
  // A source nothing cites has no reason to be in the snapshot.
  const cited = new Set([
    ...rows.audits.flatMap(({ row }) => list(row.reference_source_ids)),
    ...[...rows.schedules, ...rows.events].flatMap(({ row }) => [
      row.source_id,
      ...list(row.additional_source_ids),
    ]),
  ]);
  for (const source of rows.sources)
    if (typeof source.row.id === 'string' && !cited.has(source.row.id))
      source.error(
        'is not cited by any audit, regular run or dated run; cite it or remove it',
      );
  for (const name of DATASETS)
    for (const record of rows[name]) {
      record.only();
      checkText(record);
    }
  const file = (message: string) =>
    DATASETS.indexOf(message.split('.', 1)[0] as Dataset);
  return errors.sort((a, b) => file(a) - file(b));
}
function loadData(root = ROOT) {
  return Object.fromEntries(DATASETS.map((name) => [name, load(name, root)]));
}
function main(root = ROOT) {
  let data: ReturnType<typeof loadData>;
  try {
    data = loadData(root);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const errors = validate(data);
  if (errors.length) {
    for (const error of errors) console.error(error);
    console.error(`${errors.length} validation error(s) found.`);
    return 1;
  }
  console.log(
    `Valid: ${data.clubs.length} clubs, ${data.sources.length} sources, ${data.audits.length} audits, ${data.schedules.length} patterns, ${data.events.length} dated events.`,
  );
  console.log(
    `Valid: ${data.races.length} race editions, ${data.neighborhoods.length} neighborhoods.`,
  );
  return 0;
}

export { DATASETS, loadData, main, validate };

if (import.meta.main) cli(() => main());
