import fs from 'node:fs';
import path from 'node:path';
import { type ParseArgsOptionsConfig, parseArgs } from 'node:util';
import type { Snapshot } from './types.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SF = 'America/Los_Angeles';
const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

import { addDays, dayOf, daysBetween, localMinute } from '../site/model.ts';

function load<N extends keyof Snapshot>(name: N, root = ROOT): Snapshot[N] {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'),
    );
  } catch (error) {
    throw new Error(
      `${name}.json: could not be read as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) &&
    value.slice(0, 4) !== '0000' &&
    Number.isFinite(Date.parse(`${value}T00:00Z`)) &&
    new Date(`${value}T00:00Z`).toISOString().slice(0, 10) === value
  );
}
function validClock(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 5 &&
    /^[0-9]{2}:[0-9]{2}$/.test(value) &&
    Number(value.slice(0, 2)) < 24 &&
    Number(value.slice(3)) < 60
  );
}
function validLocal(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 16 &&
    value[10] === 'T' &&
    validDate(value.slice(0, 10)) &&
    validClock(value.slice(11))
  );
}
function validZone(value: unknown): value is string {
  if (typeof value !== 'string' || /^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
function offsetMinutes(instant: Date, zone: string) {
  const local = localMinute(instant, zone);
  return (
    (Date.parse(`${local}Z`) - Math.floor(instant.getTime() / 60000) * 60000) /
    60000
  );
}
function offsetText(minutes: number, colon = true) {
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}${colon ? ':' : ''}${String(absolute % 60).padStart(2, '0')}`;
}
// Resolve a wall-clock minute using the zone's offsets on either side of it.
// Fall-back repeats use the first occurrence; spring gaps use the earlier offset,
// matching the previous ZoneInfo fold=0 convention. No host time zone is used.
function zonedDate(local: string, zone = SF): Date {
  if (!validLocal(local) || !validZone(zone))
    throw new Error(`Invalid local date/time or time zone: ${local} (${zone})`);
  const wall = Date.parse(`${local}Z`);
  const offsets = [
    ...new Set(
      [-86400000, 86400000].map((delta) =>
        offsetMinutes(new Date(wall + delta), zone),
      ),
    ),
  ];
  const options = offsets
    .map((offset) => new Date(wall - offset * 60000))
    .sort((a, b) => a.getTime() - b.getTime());
  return (
    options.find((instant) => localMinute(instant, zone) === local) ||
    options[options.length - 1]
  );
}
function parseReference(value: string | undefined, now = new Date()) {
  if (!value) return { instant: now, zone: SF };
  // Local dates and times are SF time; explicit offsets retain their own zone.
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2})(\.\d{1,6})?)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    );
  if (
    !match ||
    !validDate(match[1]) ||
    !validClock(match[2] || '00:00') ||
    Number(match[3] || 0) > 59
  )
    throw new Error('--as-of must be a valid ISO date/time');
  const local = `${match[1]}T${match[2] || '00:00'}`;
  const zone = ['Z', '+00:00', '-00:00'].includes(match[5])
    ? 'UTC'
    : match[5] || SF;
  const instant = match[5]
    ? new Date(`${local}:${match[3] || '00'}${match[4] || ''}${match[5]}`)
    : new Date(
        zonedDate(local).getTime() +
          Number(match[3] || 0) * 1000 +
          Number(match[4] || 0) * 1000,
      );
  if (!Number.isFinite(instant.getTime()))
    throw new Error('--as-of must be a valid ISO date/time');
  return { instant, zone };
}
function reportWindow(
  asOf: string | undefined,
  days: number,
  clock = new Date(),
) {
  const { instant: now, zone } = parseReference(asOf, clock);
  const local = localMinute(now, zone);
  const endLocal = `${addDays(local.slice(0, 10), days)}T${local.slice(11)}`;
  // Numeric offsets accepted by Intl are fixed-offset zones.
  const end = /^[+-]/.test(zone)
    ? new Date(`${endLocal}${zone}`)
    : zonedDate(endLocal, zone);
  return { now, end: new Date(end.getTime() + (now.getTime() % 60000)), zone };
}
function isoMinute(instant: Date, zone = SF) {
  return localMinute(instant, zone) + offsetText(offsetMinutes(instant, zone));
}
function dateParts(local: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(`${local}Z`));
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    weekday: p.weekday,
    month: p.month,
    day: p.day,
    year: p.year,
    minute: p.minute,
    hour: Number(p.hour),
    period: p.dayPeriod,
  };
}
function displayMinute(local: string, { pad = true, comma = false } = {}) {
  const p = dateParts(local);
  return `${p.weekday} ${p.month} ${p.day}${comma ? ',' : ''} ${pad ? String(p.hour).padStart(2, '0') : p.hour}:${p.minute} ${p.period}`;
}
function compareKeys(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}
function cell(value: unknown) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}
function args<const O extends ParseArgsOptionsConfig>(
  options: O,
  argv = process.argv.slice(2),
) {
  const { values } = parseArgs({
    args: argv,
    options: { ...options, help: { type: 'boolean' as const, short: 'h' } },
  });
  return values;
}
function nonnegative(value: string, flag: string) {
  if (!/^[+]?[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`${flag} must be a non-negative integer`);
  return Number(value);
}
function cli(main: () => number | undefined) {
  try {
    process.exitCode = main() ?? 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export {
  addDays,
  args,
  cell,
  cli,
  compareKeys,
  dateParts,
  dayOf,
  daysBetween,
  displayMinute,
  isoMinute,
  load,
  localMinute,
  nonnegative,
  offsetMinutes,
  offsetText,
  ROOT,
  reportWindow,
  SF,
  validClock,
  validDate,
  validLocal,
  validZone,
  WEEKDAYS,
  zonedDate,
};

export function lookup<T>(items: ReadonlyMap<string, T>, id: string): T {
  const value = items.get(id);
  if (value === undefined) throw new Error(`Missing record: ${id}`);
  return value;
}
