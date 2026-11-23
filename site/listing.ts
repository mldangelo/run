/* Listing text shared by table rows and detail dialogs, so neither imports
   the other. */
import type {
  Race,
  Registration,
  RegistrationStatus,
  Schedule,
} from '../scripts/types.mts';
import {
  dateInfo,
  dateRange,
  escapeHTML,
  external,
  shortDate,
  timeLabel,
} from './format.js';
import * as RunData from './model.js';

export function raceDate(race: Race) {
  return race.end_date
    ? dateRange(race.date, race.end_date)
    : dateInfo(race.date);
}
export function patternDates(pattern: Schedule) {
  if (pattern.valid_from && pattern.valid_until)
    return dateRange(pattern.valid_from, pattern.valid_until);
  if (pattern.valid_from) return `From ${dateInfo(pattern.valid_from)}`;
  if (pattern.valid_until) return `Through ${dateInfo(pattern.valid_until)}`;
  return '';
}
/* A short tag for a regular run, or '' for an ordinary current schedule. */
export function patternStatus(pattern: Schedule, now = new Date()) {
  const state = RunData.patternState(pattern, now);
  const review = pattern.status === 'needs_review';
  if (state === 'future')
    return review ? 'SEASONAL · CHECK SCHEDULE' : 'SEASONAL';
  if (state === 'expired') return 'ENDED';
  if (state === 'superseded') return 'REPLACED';
  return review ? 'CHECK SCHEDULE' : '';
}
export function visiblePatterns(items: Schedule[], now = new Date()) {
  return items.filter((item) =>
    RunData.patternMatches(item, { day: 'all', time: 'all' }, now),
  );
}

/* ---------- Registration ---------- */

const REGISTRATION_LABELS: Record<RegistrationStatus | 'mixed', string> = {
  open: 'Registration open',
  not_yet_open: 'Not yet open',
  sold_out: 'Sold out',
  waitlist: 'Waitlist',
  closed: 'Registration closed',
  mixed: 'Varies by distance',
  unknown: 'Check registration',
};
/* Open is good news; sold out, closed, waitlist and not yet open are known
   facts; only an unsettled or mixed status asks the runner to check. */
export function registrationTag(status: keyof typeof REGISTRATION_LABELS) {
  const style =
    status === 'open'
      ? ''
      : status === 'unknown' || status === 'mixed'
        ? ' uncertain'
        : ' plain';
  return `<span class="tag${style}">${REGISTRATION_LABELS[status].toUpperCase()}</span>`;
}
function registrationDate(value: string | undefined) {
  if (!value) return '';
  return `${dateInfo(value)}${value.length > 10 ? ` at ${timeLabel(value.slice(11, 16))} Pacific` : ' (time not listed)'}`;
}
/* Registration applies only to scheduled races that have not ended. */
export const registrationCurrent = (race: Race) =>
  race.status === 'scheduled' &&
  (race.end_date || race.date) >= RunData.localMinute(new Date()).slice(0, 10);
/* The badge, any earlier report and the published dates for one snapshot. */
function registrationStatus(
  registration: Registration | undefined,
  race: Race,
) {
  if (!registration)
    return 'Availability and registration dates have not been checked. Confirm with the organizer.';
  const status = RunData.registrationState(registration, new Date(), race.date);
  const lastReported =
    status === 'unknown' && registration.status !== 'unknown'
      ? `<p>When we checked on ${escapeHTML(shortDate(registration.checked_on))}: ${escapeHTML(REGISTRATION_LABELS[registration.status].toLowerCase())}. Check with the organizer for the latest.</p>`
      : '';
  const dates = [
    ['Opens', registration.opens_at],
    ['Closes', registration.closes_at],
  ]
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<li><b>${label}:</b> ${escapeHTML(registrationDate(value))}</li>`,
    )
    .join('');
  // Missing dates only matter while entries might still be possible.
  const datesMatter = ['open', 'not_yet_open', 'waitlist'].includes(status);
  return `${registrationTag(status)}${lastReported}${dates ? `<ul>${dates}</ul>` : datesMatter ? '<p>Opening and closing dates not listed.</p>' : ''}`;
}
/* The organizer's notes, when we checked, and where to register. */
export function registrationSource(registration: Registration) {
  const status = RunData.registrationState(registration);
  // `url` is stored only when registration happens somewhere other than the
  // page we checked; otherwise both links would lead to the same page.
  const checkedElsewhere = registration.url
    ? ` · ${external(registration.source_url, 'Registration source')}`
    : '';
  return `<p>${escapeHTML(registration.notes)}</p><span class="pattern-warning">Registration checked ${escapeHTML(shortDate(registration.checked_on))}${checkedElsewhere}</span><p>${external(registration.url ?? registration.source_url, status === 'open' ? 'Register with organizer' : 'Organizer’s registration page')}</p>`;
}
export function registrationDetails(
  registration: Registration | undefined,
  race: Race,
  { shared = false } = {},
) {
  if (!registrationCurrent(race))
    return 'Registration is not shown for past, cancelled or postponed races.';
  return `${registrationStatus(registration, race)}${registration && !shared ? registrationSource(registration) : ''}`;
}
