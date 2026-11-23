type Row = { [key: string]: unknown };
type Options = {
  optional?: boolean;
  nullable?: boolean;
  allowEmpty?: boolean;
  nonempty?: boolean;
};

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

const DATASETS = [
  'clubs',
  'sources',
  'audits',
  'schedules',
  'events',
  'races',
  'neighborhoods',
] as const;
// Marin County's towns and unincorporated communities. A race or neighborhood
// named for one of these places must use the 'marin' area.
const MARIN_PLACES = new Set([
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
const MISSING = Symbol('missing');
const isObject = (value: unknown): value is Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const kind = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
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
  try {
    new URL(value);
    return null;
  } catch {
    return `is not a valid URL: ${repr(value)}`;
  }
}
class Record {
  declare errors: string[];
  declare label: string;
  declare row: Row;
  declare prefix: string;
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
    if (Object.hasOwn(this.row, key)) return this.row[key];
    if (!optional) this.error(`missing required field ${repr(this.name(key))}`);
    return MISSING;
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
  choice<T>(
    key: string,
    allowed: readonly T[],
    fallback: T | typeof MISSING = MISSING,
  ): T | null {
    if (fallback !== MISSING && !Object.hasOwn(this.row, key)) return fallback;
    const value = this.value(key);
    if (value === MISSING) return null;
    if (!allowed.includes(value as T)) {
      this.error(
        `${this.name(key)} is ${repr(value)}; expected one of ${allowed.map(repr).sort().join(', ')}`,
      );
      return null;
    }
    return value as T;
  }
  flag(key: string, { optional = false }: Options = {}) {
    const value = this.value(key, { optional });
    if (value === MISSING) return null;
    if (typeof value !== 'boolean') {
      this.error(`${this.name(key)} must be true or false, got ${kind(value)}`);
      return null;
    }
    return value;
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
  children(key: string, options: Options = {}): Record[] {
    return this.items(key, options).flatMap((row, index) => {
      const field = `${this.name(key)}[${index}]`;
      if (isObject(row))
        return [new Record(this.errors, this.label, row, `${field}.`)];
      this.error(`${field} must be an object, got ${kind(row)}`);
      return [];
    });
  }
  parsed(
    key: string,
    valid: (value: unknown) => value is string,
    description: string,
    { optional = false, nullable = false }: Options = {},
  ) {
    const value = this.value(key, { optional });
    if (
      value === MISSING ||
      ((optional || nullable) && (value === null || value === ''))
    )
      return null;
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
  httpsUrl(key: string, { optional = false }: Options = {}): string | null {
    const value = this.value(key, { optional });
    if (value === MISSING || (optional && (value === null || value === '')))
      return null;
    const problem = urlProblem(value);
    if (problem) {
      this.error(`${this.name(key)} ${problem}`);
      return null;
    }
    return value as string;
  }
  reference(key: string, known: { has(value: string): boolean }) {
    const value = this.text(key);
    if (value !== null && !known.has(value))
      this.error(`unknown ${this.name(key)} ${repr(value)}`);
  }
  references(
    key: string,
    known: { has(value: string): boolean },
    options: Options = {},
  ) {
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
}
/* Every field a record may carry. Anything else is a typo or a copy of a
   fact whose home is another field or file. */
const FIELDS: { [dataset: string]: readonly string[] } = {
  clubs: ['id', 'name', 'user_supplied_name', 'geography', 'description'],
  sources: ['id', 'url', 'authority', 'roles', 'access'],
  audits: [
    'club_id',
    'checked_on',
    'review_due',
    'result',
    'reference_source_ids',
    'notes',
    'research_log',
  ],
  schedules: [
    'id',
    'club_id',
    'label',
    'days',
    'frequency',
    'local_time',
    'timezone',
    'location',
    'location_info',
    'source_id',
    'evidence',
    'status',
    'checked_on',
    'review_due',
    'valid_from',
    'valid_until',
    'notes',
    'research_notes',
    'run_details',
  ],
  events: [
    'id',
    'club_id',
    'title',
    'starts_at_local',
    'ends_at_local',
    'timezone',
    'location',
    'location_info',
    'meeting_options',
    'source_id',
    'additional_source_ids',
    'status',
    'needs_review',
    'checked_on',
    'notes',
    'research_notes',
    'run_details',
  ],
  races: [
    'id',
    'title',
    'date',
    'end_date',
    'city',
    'area',
    'location',
    'distances',
    'format',
    'status',
    'needs_review',
    'registration',
    'source_url',
    'additional_sources',
    'checked_on',
    'notes',
    'research_notes',
    'club_ids',
    'former_event_ids',
  ],
  neighborhoods: ['name', 'area', 'includes'],
};
const REGISTRATION_FIELDS = [
  'status',
  'url',
  'source_url',
  'checked_on',
  'review_due',
  'access_method',
  'notes',
  'evidence_notes',
  'opens_at',
  'closes_at',
];
/* Text shown to runners stays plain. Evidence mechanics such as retrieval
   methods, sign-in states and source comparisons belong in research notes. */
const EVIDENCE_WORDING =
  /\b(HTTP|JSON-LD|cached?|WebFetch|curl|signed[- ](?:in|out)|search (?:results?|snippets?)|scrap(?:ed|ing)|fetch(?:ed|er)?|evidence|research notes?)\b/i;
function runnerText(record: Record, ...keys: string[]) {
  for (const key of keys) {
    const value = record.row[key];
    const match = typeof value === 'string' && value.match(EVIDENCE_WORDING);
    if (match)
      record.error(
        `${record.name(key)} is shown to runners; move evidence wording such as ${repr(match[0])} to research notes`,
      );
  }
}
/* A club description says what the club is; meeting times live in its
   regular runs, which carry their own sources and caveats. */
const CLOCK_TIME = /\b\d{1,2}(?::\d{2})?\s?[ap]\.?m\b\.?/i;
const CHECK_FIELDS = ['source_id', 'method', 'notes', 'observed_on'];
const LOW_INFORMATION_RESULTS: unknown[] = [
  'no_current_details',
  'identity_unresolved',
];
function checkRegistration(parent: Record, raceEnd: string | null) {
  if (!Object.hasOwn(parent.row, 'registration')) return;
  const value = parent.row.registration;
  if (!isObject(value)) {
    parent.error(`${parent.name('registration')} must be an object`);
    return;
  }
  const record = new Record(
    parent.errors,
    parent.label,
    value,
    `${parent.name('registration')}.`,
  );
  // A misspelled boundary such as closes_on would otherwise be ignored.
  for (const key of Object.keys(value))
    if (!REGISTRATION_FIELDS.includes(key))
      record.error(`${record.name(key)} is not a registration field`);
  const status = record.choice('status', REGISTRATION_STATUSES);
  record.httpsUrl('source_url');
  if (Object.hasOwn(value, 'url')) record.httpsUrl('url');
  record.choice('access_method', ACCESS_METHODS);
  record.text('notes');
  runnerText(record, 'notes');
  record.text('evidence_notes', { optional: true });
  const checked = record.date('checked_on');
  const due = record.date('review_due');
  record.notBefore('review_due', due, 'checked_on', checked);
  if (checked && due && daysBetween(checked, due) > 14)
    record.error(
      'registration.review_due must be within 14 days of checked_on',
    );
  const boundaries: { [key: string]: string | null } = {};
  for (const key of ['opens_at', 'closes_at']) {
    if (!Object.hasOwn(value, key)) continue;
    boundaries[key] =
      typeof value[key] === 'string' && value[key].length === 10
        ? record.date(key)
        : record.localDatetime(key);
  }
  const opens = boundaries.opens_at;
  const closes = boundaries.closes_at;
  if (opens && closes) {
    const before =
      opens.length === 10 || closes.length === 10
        ? closes.slice(0, 10) < opens.slice(0, 10)
        : closes < opens;
    if (before) record.error('registration.closes_at precedes opens_at');
  }
  // The reported status must agree with the boundaries known when checked.
  if (checked && status) {
    if (status === 'open' && opens && opens.slice(0, 10) > checked)
      record.error(
        `registration is open but opens_at ${opens} is after checked_on ${checked}`,
      );
    if (status === 'not_yet_open' && opens && opens.slice(0, 10) < checked)
      record.error(
        `registration is not_yet_open but opens_at ${opens} precedes checked_on ${checked}`,
      );
    if (
      ['open', 'waitlist'].includes(status) &&
      closes &&
      closes.slice(0, 10) < checked
    )
      record.error(
        `registration is ${status} but closes_at ${closes} precedes checked_on ${checked}`,
      );
  }
  if (raceEnd && closes && closes.slice(0, 10) > raceEnd)
    record.error(
      `registration.closes_at ${closes} is after the race ends on ${raceEnd}`,
    );
}

function records(
  errors: string[],
  data: Row,
  name: string,
  idKey = 'id',
): Record[] {
  const file = `${name}.json`;
  if (!Object.hasOwn(data, name)) {
    errors.push(`${file}: dataset is missing`);
    return [];
  }
  if (!Array.isArray(data[name])) {
    errors.push(
      `${file}: expected an array of records, got ${kind(data[name])}`,
    );
    return [];
  }
  return data[name].flatMap((row, index) => {
    const id = isObject(row) && row[idKey];
    const label =
      typeof id === 'string' && id.trim()
        ? `${file} ${id}`
        : `${file} [${index}]`;
    if (isObject(row)) return [new Record(errors, label, row)];
    errors.push(`${label}: expected an object, got ${kind(row)}`);
    return [];
  });
}
function unique(rows: Record[], key = 'id') {
  const groups = new Map<string, Record[]>();
  for (const row of rows) {
    const value = row.text(key);
    if (value !== null) {
      if (!groups.has(value)) groups.set(value, []);
      const group = groups.get(value) || [];
      group.push(row);
      groups.set(value, group);
    }
  }
  for (const group of groups.values())
    if (group.length > 1)
      group[0].error(`duplicate ${key} (appears ${group.length} times)`);
  return new Map([...groups].map(([key, group]) => [key, group[0]]));
}
/* A run's own provenance: the URLs of its source_id and additional_source_ids,
   and its checked_on. Run details reuse these unless they record different ones. */
function ownProvenance(record: Record, sources: Map<string, Record>) {
  const ids = [
    record.row.source_id,
    ...(Array.isArray(record.row.additional_source_ids)
      ? record.row.additional_source_ids
      : []),
  ];
  const urls = ids
    .map((id) => (typeof id === 'string' ? sources.get(id)?.row.url : null))
    .filter((url): url is string => typeof url === 'string');
  return { urls, checked: record.row.checked_on };
}
function checkRunDetails(
  record: Record,
  own: { urls: string[]; checked: unknown },
) {
  const value = record.value('run_details', { optional: true });
  if (value === MISSING) return;
  if (!isObject(value)) {
    record.error(`run_details must be an object, got ${kind(value)}`);
    return;
  }
  const details = new Record(
    record.errors,
    record.label,
    value,
    'run_details.',
  );
  if (Object.hasOwn(value, 'meeting_point'))
    details.choice('meeting_point', MEETING_POINTS);
  if (Object.hasOwn(value, 'participation'))
    details.choice('participation', PARTICIPATION);
  // Labels share the run's own source and check date unless run_details
  // records different ones.
  for (const key of ['pace', 'cost', 'rsvp', 'access'])
    details.text(key, { optional: true });
  runnerText(details, 'pace', 'cost', 'rsvp', 'access');
  if (Object.hasOwn(value, 'sources'))
    details.items('sources', { nonempty: true }).forEach((url, index) => {
      const problem = urlProblem(url);
      if (problem)
        details.error(`${details.name('sources')}[${index}] ${problem}`);
    });
  if (Object.hasOwn(value, 'checked_on')) details.date('checked_on');
  // Store details' provenance only when it differs from the run's own.
  if (Object.hasOwn(value, 'checked_on') && value.checked_on === own.checked)
    details.error(
      `${details.name('checked_on')} repeats the run's checked_on; omit it`,
    );
  const listed = Array.isArray(value.sources) ? value.sources : [];
  if (listed.length && listed.every((url) => own.urls.includes(url))) {
    // With a separate check date, the run's primary source alone is implied.
    if (!Object.hasOwn(value, 'checked_on'))
      details.error(
        `${details.name('sources')} repeats the run's own sources and check date; omit it`,
      );
    else if (listed.length === 1 && listed[0] === own.urls[0])
      details.error(
        `${details.name('sources')} repeats the run's source_id; keep only ${details.name('checked_on')}`,
      );
  }
  for (const key of ['beginner_friendly', 'no_drop'])
    if (Object.hasOwn(value, key)) details.flag(key);
  for (const distance of details.children('distances', {
    optional: true,
    nonempty: true,
  })) {
    distance.text('label');
    const valid: { [key: string]: number } = {};
    for (const key of ['min_miles', 'max_miles']) {
      const number = distance.value(key);
      if (number === MISSING || (key === 'max_miles' && number === null))
        continue;
      if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0)
        distance.error(
          `${distance.name(key)} must be a finite positive number, got ${repr(number)}`,
        );
      else valid[key] = number;
    }
    if (valid.min_miles > valid.max_miles)
      distance.error(
        `${distance.name('min_miles')} must not exceed ${distance.name('max_miles')}`,
      );
  }
}
function checkLocation(record: Record) {
  const value = record.value('location_info', { optional: true });
  if (value === MISSING) return;
  if (!isObject(value)) {
    record.error(`location_info must be an object, got ${kind(value)}`);
    return;
  }
  const info = new Record(record.errors, record.label, value, 'location_info.');
  if (Object.hasOwn(value, 'area')) info.choice('area', AREAS);
  info.text('neighborhood', { optional: true });
  info.text('directions_query', { optional: true });
}
// A record named for a Marin County town must use the 'marin' area. Not the
// reverse: a Marin record can name a park or landmark such as the Marin Headlands.
function checkMarin(
  record: Record,
  place: unknown,
  area: unknown,
  key: string,
) {
  if (
    typeof place !== 'string' ||
    !(AREAS as readonly unknown[]).includes(area)
  )
    return;
  if (MARIN_PLACES.has(place) && area !== 'marin')
    record.error(
      `${key} ${repr(place)} is in Marin County, so area must be 'marin', got ${repr(area)}`,
    );
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
      for (const sentence of [
        ...new Set(
          sentences.filter((part, index) => sentences.indexOf(part) !== index),
        ),
      ].sort())
        record.error(
          `${field} repeats the sentence ${repr(sentence.slice(0, 60))}`,
        );
    } else if (Array.isArray(value))
      value.forEach((item, index) => {
        walk(item, `${field}[${index}]`);
      });
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
  const rows = Object.fromEntries(
    DATASETS.map((name) => [
      name,
      records(
        errors,
        data,
        name,
        (
          {
            audits: 'club_id',
            neighborhoods: 'name',
          } as {
            [key: string]: string;
          }
        )[name] || 'id',
      ),
    ]),
  );
  for (const [name, fields] of Object.entries(FIELDS))
    for (const record of rows[name] || [])
      for (const key of Object.keys(record.row))
        if (!fields.includes(key)) record.error(`unknown field ${repr(key)}`);
  const clubs = unique(rows.clubs);
  const sources = unique(rows.sources);
  unique(rows.neighborhoods, 'name');
  const areas = new Map<string, string>();
  for (const row of rows.neighborhoods) {
    const area = row.choice('area', AREAS);
    row.text('includes');
    checkMarin(row, row.row.name, area, 'name');
    if (
      typeof row.row.name === 'string' &&
      (AREAS as readonly unknown[]).includes(area)
    )
      areas.set(row.row.name, String(area));
  }
  for (const club of rows.clubs) {
    club.text('name');
    club.text('geography');
    club.text('description');
    runnerText(club, 'description');
    const time =
      typeof club.row.description === 'string' &&
      club.row.description.match(CLOCK_TIME);
    if (time)
      club.error(
        `description repeats a meeting time (${repr(time[0])}); keep times in the club's regular runs`,
      );
    club.text('user_supplied_name', { allowEmpty: true });
  }
  const sourceByUrl = new Map<string, unknown>();
  // The same page with or without www. or a trailing slash is one source.
  const pageKey = (url: string) =>
    url.replace(/^https:\/\/www\./, 'https://').replace(/\/$/, '');
  for (const source of rows.sources) {
    source.httpsUrl('url');
    // One record per page, so its access and check date have one home.
    const url = source.row.url;
    if (typeof url === 'string' && sourceByUrl.has(pageKey(url)))
      source.error(
        `url ${repr(url)} is already recorded as ${repr(sourceByUrl.get(pageKey(url)))}`,
      );
    else if (typeof url === 'string')
      sourceByUrl.set(pageKey(url), source.row.id);
    source.items('roles', { nonempty: true }).forEach((role, index) => {
      if (typeof role !== 'string' || !role.trim())
        source.error(
          `roles[${index}] must be a non-empty string, got ${repr(role)}`,
        );
    });
    source.choice('authority', SOURCE_AUTHORITIES);
    source.choice('access', SOURCE_ACCESS);
  }
  const audited = unique(rows.audits, 'club_id');
  for (const [id, audit] of audited)
    if (!clubs.has(id)) audit.error(`unknown club_id ${repr(id)}`);
  for (const [id, club] of clubs)
    if (!audited.has(id))
      club.error('has no audit in audits.json; every club needs one audit');
  for (const audit of rows.audits) {
    audit.references('reference_source_ids', sources);
    audit.choice('result', AUDIT_RESULTS);
    const checked = audit.date('checked_on');
    const due = audit.date('review_due');
    audit.notBefore('review_due', due, 'checked_on', checked);
    // Clubs with runs or patterns are rechecked at least every 14 days;
    // clubs with no current details or an unresolved identity every 30.
    const quiet = LOW_INFORMATION_RESULTS.includes(audit.row.result);
    if (checked && due && daysBetween(checked, due) > (quiet ? 30 : 14))
      audit.error(
        `review_due must be within ${quiet ? 30 : 14} days of checked_on for result ${repr(audit.row.result)}`,
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
        for (const key of Object.keys(check.row))
          if (!CHECK_FIELDS.includes(key))
            check.error(`${check.name(key)} is not a source check field`);
        check.reference('source_id', sources);
        const sourceId = check.row.source_id;
        const listed = audit.row.reference_source_ids;
        if (
          Array.isArray(listed) &&
          typeof sourceId === 'string' &&
          sources.has(sourceId) &&
          !listed.includes(sourceId)
        )
          check.error(
            `${check.name('source_id')} must also be listed in reference_source_ids`,
          );
        check.choice('method', CHECK_METHODS);
        check.text('notes');
        // A page fetched before the research date keeps its own date; it
        // becomes the source's check date on the site.
        if (Object.hasOwn(check.row, 'observed_on')) {
          const observed = check.date('observed_on');
          if (observed && entryChecked && observed > entryChecked)
            check.error(
              `${check.name('observed_on')} must not be after the entry's checked_on ${entryChecked}`,
            );
        }
      }
    }
  }
  unique(rows.schedules);
  for (const schedule of rows.schedules) {
    schedule.reference('club_id', clubs);
    schedule.reference('source_id', sources);
    for (const key of ['label', 'frequency', 'location']) schedule.text(key);
    runnerText(schedule, 'label', 'location', 'notes');
    // Evidence detail for maintainers, kept out of the runner-facing notes.
    schedule.text('research_notes', { optional: true });
    const unknown = schedule
      .items('days', { nonempty: true })
      .filter((day) => !WEEKDAYS.includes(day as string));
    if (unknown.length)
      schedule.error(
        `days has unknown values ${repr(unknown)}; expected lower-case weekday names`,
      );
    schedule.choice('evidence', SCHEDULE_EVIDENCE);
    schedule.choice('status', SCHEDULE_STATUSES, 'active');
    schedule.timezone('timezone');
    schedule.clock('local_time', { nullable: true });
    const checked = schedule.date('checked_on');
    schedule.notBefore(
      'review_due',
      schedule.date('review_due'),
      'checked_on',
      checked,
    );
    const from = schedule.date('valid_from', { nullable: true });
    schedule.notBefore(
      'valid_until',
      schedule.date('valid_until', { nullable: true }),
      'valid_from',
      from,
    );
    checkRunDetails(schedule, ownProvenance(schedule, sources));
    checkLocation(schedule);
  }
  unique(rows.events);
  for (const event of rows.events) {
    // A run whose meeting point is still pending cannot be listed as confirmed.
    const details = event.row.run_details;
    if (
      event.row.status === 'published' &&
      isObject(details) &&
      details.meeting_point === 'pending'
    )
      event.error(
        "status 'published' requires a known meeting point; use 'unconfirmed' while run_details.meeting_point is 'pending'",
      );
    event.reference('club_id', clubs);
    event.reference('source_id', sources);
    event.references('additional_source_ids', sources, { optional: true });
    event.choice('status', RUN_STATUSES);
    event.flag('needs_review', { optional: true });
    event.text('title');
    runnerText(event, 'title', 'location', 'notes');
    const start = event.localDatetime('starts_at_local');
    const end = event.localDatetime('ends_at_local', { optional: true });
    if (start && end && end <= start)
      event.error(
        `ends_at_local ${repr(end)} must be after starts_at_local ${repr(start)}`,
      );
    event.timezone('timezone');
    event.date('checked_on');
    event.text('location');
    event.text('notes', { allowEmpty: true });
    event.text('research_notes', { optional: true });
    checkRunDetails(event, ownProvenance(event, sources));
    checkLocation(event);
    for (const option of event.children('meeting_options', {
      optional: true,
    })) {
      option.clock('local_time');
      option.text('location');
      option.text('details');
      runnerText(option, 'location', 'details');
    }
  }
  const eventSources = new Map(
    rows.sources.map((source) => [source.row.id, source.row]),
  );
  for (const event of rows.events) {
    if (event.row.status !== 'published') continue;
    const source = eventSources.get(event.row.source_id);
    if (typeof source?.url !== 'string') continue;
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      continue;
    }
    if (
      ['meetup.com', 'www.meetup.com'].includes(url.hostname) &&
      url.pathname.startsWith('/find/')
    )
      event.error(
        'published Meetup events must cite an event permalink, not a changing search page; use unconfirmed until dated evidence is available',
      );
  }
  if (Array.isArray(data.neighborhoods))
    for (const record of [...rows.schedules, ...rows.events]) {
      const info = record.row.location_info;
      if (!isObject(info) || typeof info.neighborhood !== 'string') continue;
      const name = info.neighborhood;
      if (!areas.has(name)) {
        record.error(
          `location_info.neighborhood ${repr(name)} is not listed in neighborhoods.json`,
        );
        continue;
      }
      if (
        !Object.hasOwn(info, 'area') ||
        ((AREAS as readonly unknown[]).includes(info.area) &&
          info.area !== areas.get(name))
      )
        record.error(
          `location_info.area must be ${repr(areas.get(name))} to match neighborhood ${repr(name)}, got ${repr(info.area ?? null)}`,
        );
    }
  unique(rows.races);
  const formerEventIds = new Set<string>();
  const eventIds = new Set(rows.events.map((event) => event.row.id));
  for (const race of rows.races) {
    for (const id of race.items('club_ids', { optional: true, nonempty: true }))
      if (typeof id !== 'string' || !clubs.has(id))
        race.error(`unknown club_ids entry ${repr(id)}`);
    for (const id of race.items('former_event_ids', {
      optional: true,
      nonempty: true,
    })) {
      if (typeof id !== 'string' || !id.startsWith('evt-')) {
        race.error('former_event_ids entries must be event IDs');
        continue;
      }
      if (eventIds.has(id) || formerEventIds.has(id))
        race.error(
          `former_event_ids duplicates an event or another alias: ${id}`,
        );
      formerEventIds.add(id);
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
    for (const key of ['title', 'city', 'location']) race.text(key);
    race.text('notes', { allowEmpty: true });
    runnerText(race, 'title', 'location', 'notes');
    race.text('research_notes', { optional: true });
    checkMarin(race, race.row.city, race.choice('area', AREAS), 'city');
    race.choice('format', [null, ...RACE_FORMATS], null);
    race.flag('needs_review');
    race.choice('status', RACE_STATUSES);
    race.date('checked_on');
    checkRegistration(race, end);
    for (const distance of race.children('distances', { nonempty: true })) {
      distance.text('name');
      distance.choice('category', DISTANCE_CATEGORIES);
      distance.clock('start_time', { nullable: true });
      distance.text('location', { nullable: true });
      runnerText(distance, 'name', 'location');
      checkRegistration(distance, end);
    }
    const urls = [race.httpsUrl('source_url')].filter((url): url is string =>
      Boolean(url),
    );
    race.items('additional_sources').forEach((url, index) => {
      const problem = urlProblem(url);
      if (problem) race.error(`additional_sources[${index}] ${problem}`);
      else urls.push(url as string);
    });
    for (const url of [
      ...new Set(urls.filter((url, index) => urls.indexOf(url) !== index)),
    ].sort())
      race.error(`source URL listed more than once: ${repr(url)}`);
  }
  // A source nothing cites has no reason to be in the snapshot.
  const cited = new Set<unknown>();
  const cite = (ids: unknown) => {
    if (Array.isArray(ids)) for (const id of ids) cited.add(id);
  };
  for (const audit of rows.audits) cite(audit.row.reference_source_ids);
  for (const record of [...rows.schedules, ...rows.events]) {
    cited.add(record.row.source_id);
    cite(record.row.additional_source_ids);
  }
  for (const source of rows.sources)
    if (typeof source.row.id === 'string' && !cited.has(source.row.id))
      source.error(
        'is not cited by any audit, regular run or dated run; cite it or remove it',
      );
  for (const name of DATASETS)
    for (const record of rows[name]) checkText(record);
  const fileOrder = (message: string) =>
    (DATASETS as readonly string[]).indexOf(
      message.split(/[ :]/, 1)[0].replace('.json', ''),
    );
  return errors.sort((a, b) => fileOrder(a) - fileOrder(b));
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
