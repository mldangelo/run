// Planning candidates only: these are never individual published events.
import { addDays, dayOf, localMinute, WEEKDAYS, zonedDate } from './lib.mts';
import type { Schedule } from './types.mts';
export type Pattern = Pick<
  Schedule,
  | 'days'
  | 'frequency'
  | 'local_time'
  | 'timezone'
  | 'valid_from'
  | 'valid_until'
  | 'status'
>;

const ORDINAL: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
};
function occurrenceAllowed(day: string, pattern: Pattern) {
  const weekday = dayOf(day);
  if (
    !pattern.days.includes(weekday) ||
    (pattern.valid_from && day < pattern.valid_from) ||
    (pattern.valid_until && day > pattern.valid_until)
  )
    return false;
  const frequency = pattern.frequency.trim().toLowerCase();
  if (frequency === 'weekly') return true;
  const ordinal = Math.floor((Number(day.slice(8, 10)) - 1) / 7) + 1;
  if (frequency === 'first and third thursday') return [1, 3].includes(ordinal);
  const words = frequency.split(/\s+/);
  return (
    words.length === 2 &&
    Object.hasOwn(ORDINAL, words[0]) &&
    WEEKDAYS.includes(words[1]) &&
    words[1] === weekday &&
    ordinal === ORDINAL[words[0]]
  );
}
function candidates(pattern: Pattern, start: Date, end: Date) {
  if ((pattern.status || 'active') !== 'active' || !pattern.local_time)
    return [];
  const found = [];
  const last = localMinute(end, pattern.timezone).slice(0, 10);
  for (
    let day = localMinute(start, pattern.timezone).slice(0, 10);
    day <= last;
    day = addDays(day, 1)
  ) {
    if (!occurrenceAllowed(day, pattern)) continue;
    const instant = zonedDate(`${day}T${pattern.local_time}`, pattern.timezone);
    if (start <= instant && instant <= end) found.push(instant);
  }
  return found;
}

export { candidates, occurrenceAllowed };
