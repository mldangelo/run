import {
  localMinute,
  offsetMinutes,
  offsetText,
  validClock,
  validDate,
  validZone,
} from '../lib.mts';

/* Focused host adapters. Luma, Heylo and Strava render event dates in the
   browser, so a no-JS fetch's visible text lacks the date, year or offset. Their
   public HTML embeds the event as JSON (Next.js __NEXT_DATA__); read a few
   listed fields from it, never execute it or copy the rest (guest lists, host
   IDs, build state), and state them as one EVENT-DATA line per event. Fields
   the data lacks are listed in `omitted`, never filled in. */
type Json = Record<string, unknown>;
interface Adapter {
  name: string;
  host: RegExp;
  path: RegExp;
  // [] when the page is not an event (a Luma calendar); throws when it should be.
  read: (data: unknown, url: URL) => Json[];
}

const object = (value: unknown): Json | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : undefined;
const at = (value: unknown, ...keys: string[]) =>
  keys.reduce<unknown>((item, key) => object(item)?.[key], value);
const text = (value: unknown) =>
  typeof value === 'string' && value.trim()
    ? value.replace(/\s+/g, ' ').trim()
    : undefined;
const segment = (url: URL, index: number) =>
  decodeURIComponent(url.pathname.split('/')[index] || '');
const names = (...items: (string | false)[]) =>
  items.filter((item): item is string => Boolean(item));

// Epoch milliseconds within 2000-2100 (rejects epoch seconds), or ISO with Z/offset.
function instant(value: unknown): Date | undefined {
  if (typeof value === 'number')
    return value >= 946684800000 && value < 4102444800000
      ? new Date(value)
      : undefined;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !validDate(value.slice(0, 10)) ||
    !validClock(value.slice(11, 16))
  )
    return;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
// Wall-clock time in the event's IANA zone, with year, seconds and UTC offset.
const zoned = (date: Date, zone: string) =>
  `${localMinute(date, zone)}:${String(date.getUTCSeconds()).padStart(2, '0')}${offsetText(offsetMinutes(date, zone))}`;

function times(start: unknown, end: unknown, zone: unknown) {
  const from = instant(start);
  const to = instant(end);
  const timezone = validZone(zone) ? zone : undefined;
  const fields: Json = {};
  if (from && timezone) fields.start = zoned(from, timezone);
  if (to && timezone) fields.end = zoned(to, timezone);
  if (timezone) fields.timezone = timezone;
  if (from) fields.start_utc = from.toISOString();
  if (to) fields.end_utc = to.toISOString();
  const omitted = names(
    !from && 'start',
    !to && 'end',
    !timezone && 'timezone',
  );
  return { fields, omitted };
}

const ADAPTERS: Adapter[] = [
  {
    name: 'luma',
    host: /^(www\.)?(lu\.ma|luma\.com)$/,
    path: /^\/[^/]+$/,
    read(data, url) {
      const initial = object(at(data, 'props', 'pageProps', 'initialData'));
      if (!initial) throw new Error('no Luma page data');
      if (initial.kind !== 'event') return [];
      const event = object(at(initial, 'data', 'event'));
      if (!event) throw new Error('no event in embedded page data');
      if (String(event.url).toLowerCase() !== segment(url, 1).toLowerCase())
        throw new Error('embedded event does not match this page');
      const { fields, omitted } = times(
        event.start_at,
        event.end_at,
        event.timezone,
      );
      const geo = object(event.geo_address_info);
      const location =
        text(geo?.full_address) || text(geo?.address) || text(geo?.city_state);
      const visibility = text(event.geo_address_visibility);
      if (!location && event.location_type !== 'online')
        omitted.push('location');
      return [
        {
          title: text(event.name),
          ...fields,
          location_type: text(event.location_type),
          location,
          address_visibility: visibility === 'public' ? undefined : visibility,
          omitted: omitted.length ? omitted : undefined,
        },
      ];
    },
  },
  {
    name: 'heylo',
    host: /^(www\.)?heylo\.com$/,
    path: /^\/event\/[^/]+$/,
    read(data, url) {
      const queries = at(
        data,
        'props',
        'pageProps',
        'dehydratedState',
        'queries',
      );
      if (!Array.isArray(queries)) throw new Error('no Heylo page data');
      const id = segment(url, 2);
      const event = queries
        .map((query) => object(at(query, 'state', 'data', 'event')))
        .find((item) => item?.eventId === id);
      if (!event)
        throw new Error('no event for this page in embedded page data');
      const { fields, omitted } = times(
        event.timestamp,
        event.timestampEnd,
        event.timezone,
      );
      // Respect an organizer's hidden location even though the data carries it.
      const hidden = event.locationHidden === true;
      const location = hidden
        ? undefined
        : text(at(event, 'locationData', 'label')) || text(event.location);
      if (!location && !hidden) omitted.push('location');
      const interval = event.recurrenceInterval;
      const unit = text(event.recurrenceUnits);
      return [
        {
          title: text(event.name),
          ...fields,
          repeats:
            Number.isInteger(interval) && unit
              ? { every: interval, unit }
              : undefined,
          location,
          location_hidden: hidden || undefined,
          omitted: omitted.length ? omitted : undefined,
        },
      ];
    },
  },
  {
    name: 'strava',
    host: /^(www\.)?strava\.com$/,
    path: /^\/clubs\/[^/]+\/group_events\/\d+$/,
    read(data, url) {
      const event = object(at(data, 'props', 'pageProps', 'event'));
      if (!event || String(event.id) !== segment(url, 4))
        throw new Error('no event for this page in embedded page data');
      const occurrences = event.occurrences;
      if (!Array.isArray(occurrences) || !occurrences.length)
        throw new Error('no occurrence in embedded page data');
      return occurrences.map((item) => {
        const occurrence = object(item) || {};
        const value = occurrence.occurrenceDateTime;
        // Local wall-clock time; Strava's public data has no zone or offset.
        const local =
          typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) &&
          validDate(value.slice(0, 10)) &&
          validClock(value.slice(11, 16))
            ? value
            : undefined;
        const location = text(occurrence.address);
        return {
          scope:
            'next occurrence shown by Strava; a recurring series advances to its next date, so this is not a confirmed date for a specific run',
          title: text(occurrence.title),
          start_local: local,
          location,
          omitted: names(
            !local && 'start_local',
            'timezone',
            !location && 'location',
          ),
        };
      });
    },
  },
];

/** EVENT-DATA lines for a supported event page, from its embedded JSON. */
export function eventData(page: string, pageData?: string): string[] {
  const url = new URL(page);
  const adapter = ADAPTERS.find(
    (item) => item.host.test(url.hostname) && item.path.test(url.pathname),
  );
  if (!adapter) return [];
  const line = (fields: Json) =>
    `EVENT-DATA ${JSON.stringify({ adapter: adapter.name, from: 'embedded page data', ...fields })}`;
  // A missing or malformed island is reported, not a reason to drop the page.
  if (pageData === undefined)
    return [line({ unavailable: 'no embedded page data' })];
  let data: unknown;
  try {
    data = JSON.parse(pageData);
  } catch {
    return [line({ unavailable: 'embedded page data is not valid JSON' })];
  }
  try {
    return adapter.read(data, url).map(line);
  } catch (error) {
    return [line({ unavailable: (error as Error).message })];
  }
}
