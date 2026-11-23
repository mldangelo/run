/* Table rows for each view. Each row is a button that opens its dialog. */
import type {
  Club,
  DatedEvent,
  Filter,
  Race,
  Run,
  Schedule,
  SiteAudit,
} from '../scripts/types.mts';
import {
  dateInfo,
  escapeHTML,
  shortDate,
  shorten,
  showDays,
  timeLabel,
} from './format.js';
import {
  patternDates,
  patternStatus,
  raceDate,
  registrationCurrent,
  registrationTag,
  visiblePatterns,
} from './listing.js';
import * as RunData from './model.js';
import { clubName, clubNeighborhoods, store } from './store.js';

/* What a row shows can depend on the filters: the start that matches the
   chosen period and time, or the distances and registration that match. */
export interface RowOptions {
  filter: Required<Filter>;
  /* A specific calendar day is chosen in the period menu. */
  exactDate: boolean;
}

const rowButton = (
  kind: string,
  id: string,
  className: string,
  contents: string,
) =>
  `<button type="button" class="${className}" data-kind="${kind}" data-id="${escapeHTML(id)}" aria-haspopup="dialog">${contents}<span class="row-action" aria-hidden="true">DETAILS</span></button>`;
function practicalSummary(item: Run) {
  const details = item.run_details || {};
  return [
    details.distances?.map((option) => option.label).join(' / '),
    details.pace,
    details.beginner_friendly === true ? 'Beginners welcome' : '',
    details.no_drop === true ? 'No-drop' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
/* Only access limits a runner will meet; how we researched a source stays
   in the dialog. */
function accessSummary(item: Run) {
  const access = store.sourceById.get(item.source_id)?.access;
  return access === 'restricted'
    ? 'Members see full details'
    : access === 'login_for_events'
      ? 'Some details need sign-in'
      : '';
}
function attendanceSummary(item: Run) {
  const d = item.run_details || {};
  const joining = d.participation
    ? {
        open: 'Visitors welcome',
        registration_required: 'Register first',
        approval_required: 'Approval required',
        members_only: 'Members only',
        waiver_required: 'Visitor waiver required',
      }[d.participation]
    : '';
  const meeting = d.meeting_point
    ? {
        listed: '',
        pending: 'Meeting point pending',
        after_registration: 'Address after registration',
        members_only: 'Address for members',
      }[d.meeting_point]
    : '';
  return [joining, meeting, d.cost]
    .filter(Boolean)
    .map((text) => `<span class="attendance-fact">${escapeHTML(text)}</span>`)
    .join('');
}
export function eventRow(event: DatedEvent, { filter }: RowOptions) {
  const [start = RunData.eventStarts(event)[0], ...otherStarts] =
    RunData.matchingEventStarts(
      event,
      {
        period: filter.period,
        time: filter.time,
      },
      new Date(),
    );
  const neighborhood =
    start.location === event.location ? event.location_info?.neighborhood : '';
  const uncertain = `${
    event.status === 'unconfirmed'
      ? '<span class="tag uncertain">UNCONFIRMED</span> '
      : ''
  }${event.needs_review ? '<span class="tag uncertain">CHECK DETAILS</span> ' : ''}`;
  return rowButton(
    'event',
    event.id,
    'row',
    `<span class="row-date"><span class="row-day">${escapeHTML(dateInfo(event.starts_at_local))}</span><span>${escapeHTML(timeLabel(start.local_time))}${otherStarts.length ? ' <span class="more-starts">+ more</span>' : ''}</span></span><span class="row-title">${escapeHTML(event.title)}<small>${escapeHTML(clubName(event.club_id))}</small></span><span class="row-place">${escapeHTML(start.location)}<small>${escapeHTML([neighborhood, accessSummary(event), `Checked ${shortDate(event.checked_on)}`].filter(Boolean).join(' · '))}</small></span><span class="row-note">${uncertain}${escapeHTML(shorten(practicalSummary(event), 150))}${attendanceSummary(event)}</span>`,
  );
}
export function patternRow(pattern: Schedule) {
  const label = patternStatus(pattern);
  const review = pattern.status === 'needs_review';
  const evidence =
    pattern.evidence === 'organizer_pattern'
      ? 'From the club'
      : 'From a directory';
  return rowButton(
    'pattern',
    pattern.id,
    'row',
    `<span class="row-date">${escapeHTML(showDays(pattern.days))}<span>${escapeHTML(timeLabel(pattern.local_time))}</span></span><span class="row-title">${escapeHTML(pattern.label)}<small>${escapeHTML(clubName(pattern.club_id))} · ${escapeHTML(pattern.frequency)}</small></span><span class="row-place">${escapeHTML(pattern.location)}<small>${escapeHTML(evidence)} · checked ${escapeHTML(shortDate(pattern.checked_on))}</small></span><span class="row-note">${label ? `<span class="tag${review ? ' uncertain' : ''}">${label}</span> ` : ''}${patternDates(pattern) ? `<span>${escapeHTML(patternDates(pattern))}</span> ` : ''}${escapeHTML(shorten(practicalSummary(pattern), 150))}${attendanceSummary(pattern)}</span>`,
  );
}
/* What a visitor can expect from a club right now. */
function clubStatus(
  audit: SiteAudit | undefined,
  patterns: Schedule[],
  upcomingCount: number,
) {
  if (audit?.result === 'identity_unresolved') return 'UNVERIFIED';
  if (upcomingCount) return 'UPCOMING RUNS';
  if (patterns.length) return 'REGULAR RUNS';
  return 'NO SCHEDULE FOUND';
}
/* The first two neighborhoods, then a count of the rest. */
function placeSummary(names: string[] = []) {
  return names.length > 2
    ? `${names.slice(0, 2).join(' · ')} +${names.length - 2}`
    : names.join(' · ');
}
export function clubRow(club: Club) {
  const audit = store.auditByClub.get(club.id);
  const patterns = visiblePatterns(store.patternsByClub.get(club.id) || []);
  const pattern = patterns.length
    ? patterns
        .slice(0, 2)
        .map(
          (item) =>
            `${showDays(item.days)}${item.local_time ? ` ${timeLabel(item.local_time)}` : ''}${RunData.patternState(item, new Date()) === 'future' ? ` (from ${shortDate(item.valid_from)})` : item.valid_until ? ` (through ${shortDate(item.valid_until)})` : ''}${item.status === 'needs_review' ? ' (check schedule)' : ''}`,
        )
        .join(' · ')
    : 'No regular schedule found';
  const upcomingCount = store.upcomingByClub.get(club.id) || 0;
  const status = clubStatus(audit, patterns, upcomingCount);
  const uncertain = status === 'UNVERIFIED' ? ' uncertain' : '';
  return rowButton(
    'club',
    club.id,
    'row club-row',
    `<span class="row-title">${escapeHTML(club.name)}<small>${escapeHTML(placeSummary(clubNeighborhoods(club)) || club.geography || 'Unknown area')} · ${upcomingCount ? `${upcomingCount} upcoming ${upcomingCount === 1 ? 'run' : 'runs'}` : 'No upcoming runs listed'}</small></span><span class="row-place">${escapeHTML(pattern)}</span><span class="row-note">${escapeHTML(shorten(club.description || 'No description yet.', 115))}</span><span class="row-status"><span class="tag${uncertain}">${status}</span></span>`,
  );
}
export function raceRow(race: Race, { filter, exactDate }: RowOptions) {
  const { distance, time, registration: statusFilter } = filter;
  const matching = RunData.raceOptions(race, { distance, time }).filter(
    (item) =>
      ['all', 'mixed'].includes(statusFilter) ||
      RunData.raceRegistration({ ...race, distances: [item] }) === statusFilter,
  );
  const registration = RunData.raceRegistration({
    ...race,
    distances: matching,
  });
  const starts = [
    ...new Set(matching.map((item) => item.start_time).filter(Boolean)),
  ].sort();
  const more =
    starts.length > 1 ||
    (starts.length && matching.some((item) => !item.start_time));
  const startLabel =
    race.end_date && race.end_date !== race.date && exactDate
      ? escapeHTML(raceDate(race))
      : starts.length
        ? `${escapeHTML(timeLabel(starts[0]))}${more ? ' <span class="more-starts">+ more</span>' : ''}`
        : 'Time not listed';
  const review = race.needs_review
    ? '<span class="tag uncertain">CHECK DETAILS</span> '
    : '';
  const format = race.format
    ? `<span class="tag">${{ small_group: 'SMALL GROUP', kids: 'KIDS ONLY', relay: 'RELAY' }[race.format]}</span> `
    : '';
  const timing =
    race.format === 'small_group'
      ? '<span class="attendance-fact">Optional self-timing · no timing chips</span>'
      : '';
  return rowButton(
    'race',
    race.id,
    'row',
    `<span class="row-date"><span class="row-day">${escapeHTML(raceDate(race))}</span><span>${startLabel}</span></span><span class="row-title">${escapeHTML(race.title)}<small>${escapeHTML(race.city)}</small></span><span class="row-place">${escapeHTML(race.location)}<small>Checked ${escapeHTML(shortDate(race.checked_on))}</small></span><span class="row-note">${registrationCurrent(race) ? `${registrationTag(registration)} ` : ''}${review}${format}${escapeHTML(matching.map((item) => item.name).join(' · '))}${timing}</span>`,
  );
}
