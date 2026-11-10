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

const DATASETS = [
  'clubs',
  'sources',
  'audits',
  'schedules',
  'events',
  'races',
  'neighborhoods',
  'merchandise',
] as const;
// San Francisco is primary; Marin County is a featured neighbor; 'bay' is
// everywhere else in the region.
const AREAS = ['sf', 'marin', 'bay'];
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
  flag(key: string) {
    const value = this.value(key);
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
function checkRunDetails(record: Record) {
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
  for (const key of ['pace', 'cost', 'rsvp', 'access'])
    details.text(key, { optional: true });
  if (Object.hasOwn(value, 'sources'))
    details.items('sources', { nonempty: true }).forEach((url, index) => {
      const problem = urlProblem(url);
      if (problem)
        details.error(`${details.name('sources')}[${index}] ${problem}`);
    });
  if (Object.hasOwn(value, 'checked_on')) details.date('checked_on');
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
  if (typeof place !== 'string' || !AREAS.includes(area as string)) return;
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
function checkMerchandise(records: Record[], clubs: Map<string, Record>) {
  unique(records, 'club_id');
  for (const record of records) {
    record.reference('club_id', clubs);
    record.date('checked_on');
    const result = record.choice('result', [
      'store_found',
      'merch_info_only',
      'lead_only',
      'no_public_link_found',
    ]);
    record.text('notes');
    record
      .items('search_queries', { nonempty: true })
      .forEach((query, index) => {
        if (typeof query !== 'string' || !query.trim())
          record.error(`search_queries[${index}] must be a non-empty string`);
      });
    record.items('checked_urls').forEach((url, index) => {
      const problem = urlProblem(url);
      if (problem) record.error(`checked_urls[${index}] ${problem}`);
    });
    const links = record.children('links', {
      nonempty:
        result !== null &&
        ['store_found', 'merch_info_only', 'lead_only'].includes(result),
    });
    if (result === 'no_public_link_found' && links.length)
      record.error('no_public_link_found must not contain merchandise links');
    let foundStore = false;
    const seen = new Set<string | null>();
    for (const link of links) {
      link.text('label');
      const url = link.httpsUrl('url');
      if (seen.has(url))
        link.error(
          `${link.name('url')} duplicates another destination in this record`,
        );
      seen.add(url);
      const kind = link.choice('kind', [
        'store',
        'collection',
        'order_form',
        'merch_info',
      ]);
      const scope = link.choice('scope', [
        'club',
        'parent_organization',
        'host_brand',
        'other_chapter',
      ]);
      link.choice('availability', [
        'catalog_visible',
        'membership_only',
        'coming_soon',
        'sold_out',
        'closed',
        'not_verified',
      ]);
      const authority = link.choice('authority', [
        'club',
        'vendor',
        'secondary',
      ]);
      link.text('notes');
      link.items('items').forEach((item, index) => {
        if (typeof item !== 'string' || !item.trim())
          link.error(
            `${link.name('items')}[${index}] must be a non-empty string`,
          );
      });
      link
        .items('evidence_urls', { nonempty: true })
        .forEach((evidence, index) => {
          const problem = urlProblem(evidence);
          if (problem)
            link.error(`${link.name('evidence_urls')}[${index}] ${problem}`);
        });
      if (
        ['store', 'collection', 'order_form'].includes(kind || '') &&
        scope !== 'other_chapter' &&
        authority !== 'secondary'
      )
        foundStore = true;
      if (
        result !== 'lead_only' &&
        (scope === 'other_chapter' || authority === 'secondary')
      )
        link.error(
          'other-chapter or secondary-only merchandise must remain lead_only',
        );
      if (result === 'merch_info_only' && kind !== 'merch_info')
        link.error(
          'merch_info_only must contain information links rather than stores or order forms',
        );
    }
    if (result === 'store_found' && !foundStore)
      record.error(
        'store_found needs a club, parent-organization or host-brand store, collection or order form',
      );
  }
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
            merchandise: 'club_id',
          } as {
            [key: string]: string;
          }
        )[name] || 'id',
      ),
    ]),
  );
  const clubs = unique(rows.clubs);
  const sources = unique(rows.sources);
  unique(rows.neighborhoods, 'name');
  const areas = new Map<string, string>();
  for (const row of rows.neighborhoods) {
    const area = row.choice('area', AREAS);
    row.text('includes');
    checkMarin(row, row.row.name, area, 'name');
    if (typeof row.row.name === 'string' && AREAS.includes(area as string))
      areas.set(row.row.name, String(area));
  }
  for (const club of rows.clubs) {
    club.text('name');
    club.text('geography');
    club.text('user_supplied_name', { allowEmpty: true });
    club.httpsUrl('source_url', { optional: true });
    club.choice('research_status', [
      'identified',
      'historical_evidence',
      'lead_only',
    ]);
    club.date('checked_on');
  }
  for (const source of rows.sources) {
    source.httpsUrl('url');
    source.items('roles', { nonempty: true }).forEach((role, index) => {
      if (typeof role !== 'string' || !role.trim())
        source.error(
          `roles[${index}] must be a non-empty string, got ${repr(role)}`,
        );
    });
    source.choice('authority', ['club', 'host', 'secondary']);
    source.choice('access', [
      'public',
      'restricted',
      'login_for_events',
      'unknown',
    ]);
    source.date('last_checked', { nullable: true });
  }
  const audited = unique(rows.audits, 'club_id');
  for (const [id, audit] of audited)
    if (!clubs.has(id)) audit.error(`unknown club_id ${repr(id)}`);
  for (const [id, club] of clubs)
    if (!audited.has(id))
      club.error('has no audit in audits.json; every club needs one audit');
  for (const audit of rows.audits) {
    audit.references('reference_source_ids', sources);
    audit.choice('result', [
      'identity_unresolved',
      'no_current_details',
      'pattern_found',
      'dated_event_found',
    ]);
    const checked = audit.date('checked_on');
    audit.notBefore(
      'review_due',
      audit.date('review_due'),
      'checked_on',
      checked,
    );
    audit.text('notes');
  }
  unique(rows.schedules);
  for (const schedule of rows.schedules) {
    schedule.reference('club_id', clubs);
    schedule.reference('source_id', sources);
    for (const key of ['label', 'frequency', 'location']) schedule.text(key);
    const unknown = schedule
      .items('days', { nonempty: true })
      .filter((day) => !WEEKDAYS.includes(day as string));
    if (unknown.length)
      schedule.error(
        `days has unknown values ${repr(unknown)}; expected lower-case weekday names`,
      );
    schedule.choice('evidence', ['organizer_pattern', 'secondary_pattern']);
    schedule.choice(
      'status',
      ['active', 'needs_review', 'superseded'],
      'active',
    );
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
    checkRunDetails(schedule);
    checkLocation(schedule);
  }
  unique(rows.events);
  for (const event of rows.events) {
    event.reference('club_id', clubs);
    event.reference('source_id', sources);
    event.references('additional_source_ids', sources, { optional: true });
    event.choice('status', [
      'published',
      'unconfirmed',
      'cancelled',
      'postponed',
    ]);
    event.choice('source_type', ['club', 'host', 'secondary']);
    event.text('title');
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
    checkRunDetails(event);
    checkLocation(event);
    for (const option of event.children('meeting_options', {
      optional: true,
    })) {
      option.clock('local_time');
      option.text('location');
      option.text('details');
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
        (AREAS.includes(info.area as string) && info.area !== areas.get(name))
      )
        record.error(
          `location_info.area must be ${repr(areas.get(name))} to match neighborhood ${repr(name)}, got ${repr(info.area ?? null)}`,
        );
    }
  unique(rows.races);
  for (const race of rows.races) {
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
    checkMarin(race, race.row.city, race.choice('area', AREAS), 'city');
    race.choice('format', [null, 'small_group'], null);
    race.flag('needs_review');
    race.choice('status', ['scheduled', 'cancelled', 'postponed']);
    race.date('checked_on');
    for (const distance of race.children('distances', { nonempty: true })) {
      distance.text('name');
      distance.choice('category', [
        '5k',
        '10k',
        'half',
        'marathon',
        'ultra',
        'other',
      ]);
      distance.clock('start_time', { nullable: true });
      distance.text('location', { nullable: true });
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
  checkMerchandise(rows.merchandise, clubs);
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
  console.log(
    `Valid: ${data.merchandise.length} club merchandise research records.`,
  );
  return 0;
}

export { DATASETS, loadData, main, validate };

if (import.meta.main) cli(() => main());
