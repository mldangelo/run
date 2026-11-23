/* Detail dialogs for each kind of listing, and the actions inside them. */
import type {
  Club,
  DatedEvent,
  Race,
  Run,
  Schedule,
} from '../scripts/types.mts';
import { $, DEFAULTS } from './dom.js';
import {
  AREA_NAMES,
  ARROW,
  dateInfo,
  detailRow,
  escapeHTML,
  external,
  researchNotes,
  shortDate,
  showDays,
  timeLabel,
} from './format.js';
import {
  patternDates,
  patternStatus,
  raceDate,
  registrationCurrent,
  registrationDetails,
  registrationSource,
  registrationTag,
  visiblePatterns,
} from './listing.js';
import * as RunData from './model.js';
import { clubName, clubNeighborhoods, store } from './store.js';

const { siteName } = RunData;

/* ---------- Building a dialog ---------- */

/* One section of a dialog: its heading and contents, or false to leave it
   out. Each dialog lists its sections in display order, so a section is
   added, moved or removed in one place; detailRow keeps each heading an h3. */
type Section = readonly [heading: string, contents: string] | false;
/* A section shown only when it has something to say. */
const optional = (heading: string, contents: string): Section =>
  contents ? [heading, contents] : false;
/* The label, title and subtitle are followed by the sections and actions.
   `label` and `title` are text; `sub`, `warning`, sections and actions are
   markup. */
function dialog({
  label,
  warning = '',
  title,
  sub,
  sections,
  actions,
}: {
  label: string;
  warning?: string;
  title: string;
  sub: string;
  sections: Section[];
  actions: string[];
}) {
  const rows = sections
    .map((section) => (section ? detailRow(...section) : ''))
    .join('');
  return {
    title,
    html: `<div class="detail-label">${escapeHTML(label)}</div>${warning}<h2 class="detail-title" id="detail-title">${escapeHTML(title)}</h2><div class="detail-sub">${sub}</div>${rows}<div class="detail-actions">${actions.join('')}</div>`,
  };
}

/* ---------- Shared parts ---------- */

const SOURCE_KINDS: Record<string, string> = {
  club: 'club page',
  host: 'host page',
  secondary: 'directory',
};
const SOURCE_ACCESS: Record<string, string> = {
  restricted: 'limited access',
  login_for_events: 'sign-in needed',
};
/* A source link with what kind of page it is. Pass the other links shown
   beside it so that links to the same site read differently. */
function linkSource(id: string, shownWith: string[] = []) {
  const source = store.sourceById.get(id);
  if (!source) return '';
  const urls = shownWith
    .map((other) => store.sourceById.get(other)?.url)
    .filter((url): url is string => Boolean(url));
  const label =
    RunData.linkLabels(
      urls.includes(source.url) ? urls : [source.url, ...urls],
    ).get(source.url) || siteName(source.url);
  const facts = [
    SOURCE_KINDS[source.authority],
    SOURCE_ACCESS[source.access],
    source.last_checked
      ? `checked ${shortDate(source.last_checked)}`
      : 'not checked yet',
  ].filter(Boolean);
  return `${external(source.url, label)} <span class="pattern-warning">${escapeHTML(facts.join(' · '))}</span>`;
}
/* Several source links shown together, each told apart from the rest. */
const sourceList = (ids: string[], shownWith: string[]) =>
  `<ul>${ids.map((id) => `<li>${linkSource(id, shownWith)}</li>`).join('')}</ul>`;
const clubLink = (id: string) =>
  `<a href="?club=${encodeURIComponent(id)}">${escapeHTML(clubName(id))}${ARROW}</a>`;
function clubScheduleChanges(clubId: string): Section {
  const today = RunData.localMinute(new Date()).slice(0, 10);
  const changes = store.events
    .filter(
      (event) =>
        event.club_id === clubId &&
        (event.status === 'cancelled' || event.status === 'postponed') &&
        (event.ends_at_local ?? event.starts_at_local).slice(0, 10) >= today,
    )
    .sort((a, b) => a.starts_at_local.localeCompare(b.starts_at_local))
    .map(
      (event) =>
        `<li><strong>${escapeHTML(event.status.toUpperCase())}</strong> · ${escapeHTML(dateInfo(event.starts_at_local))} · ${escapeHTML(timeLabel(event.starts_at_local.slice(11, 16)))} · <a href="?event=${encodeURIComponent(event.id)}">${escapeHTML(event.title)}</a></li>`,
    );
  return optional(
    'CLUB SCHEDULE CHANGES',
    changes.length ? `<ul>${changes.join('')}</ul>` : '',
  );
}
function statusWarning(status: string) {
  if (!['cancelled', 'postponed'].includes(status)) return '';
  return `<p class="status-warning" role="status"><strong>${status.toUpperCase()}</strong> · Previously listed details are shown for reference. Check the organizer for updates before making plans.</p>`;
}
/* Only the details a source lists; unknown details are left out. */
function practicalDetails(item: Run) {
  const details = item.run_details || {};
  const lines = RunData.practicalLines(details);
  if (!lines.length) return '';
  // Details normally share the run's own source and check date, shown under
  // WHERE WE FOUND IT; name them here only when they differ.
  const sources = (
    details.sources ?? [store.sourceById.get(item.source_id)?.url ?? '']
  ).filter(Boolean);
  const labels = RunData.linkLabels(sources);
  const references =
    details.sources || details.checked_on
      ? `<br><span class="pattern-warning">Checked ${escapeHTML(shortDate(details.checked_on ?? item.checked_on))} on ${sources
          .map((url) => external(url, labels.get(url) || siteName(url)))
          .join(', ')}</span>`
      : '';
  return `<ul>${lines.map(([label, value]) => `<li><b>${escapeHTML(label)}:</b> ${escapeHTML(value)}</li>`).join('')}</ul>${references}`;
}
function meetingPlace(item: Run) {
  const query = item.location_info?.directions_query;
  const link = query
    ? `<br>${external(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, 'Directions')}`
    : '';
  return `${escapeHTML(item.location)}${link}`;
}
const permalink = (kind: string, id: string, calendar = false) => {
  const query = `?${kind}=${encodeURIComponent(id)}`;
  const url = RunData.listingURL(kind, id, location.href);
  const body = `Listing: ${url}\n\nCorrection and supporting source:\n`;
  const email = `mailto:hi@mldangelo.com?subject=${encodeURIComponent('SF Run Club Index correction')}&body=${encodeURIComponent(body)}`;
  const addToCalendar = calendar
    ? `<button type="button" class="permalink add-to-calendar" data-calendar="${kind}" data-calendar-id="${escapeHTML(id)}">Add to calendar</button>`
    : '';
  return `<a class="permalink" href="${query}">DIRECT LINK${ARROW}</a><button type="button" class="permalink copy-link" data-copy-link="${escapeHTML(url)}">Copy link</button>${addToCalendar}<a class="permalink" href="${escapeHTML(email)}">Suggest a correction</a><span class="copy-feedback" role="status"></span><label class="copy-fallback" hidden><span class="sr-only">Listing link</span><input type="text" readonly value="${escapeHTML(url)}"></label>`;
};

/* ---------- Dialogs ---------- */

export function showRace(race: Race) {
  const perDistance =
    race.distances.some((item) => item.registration) &&
    registrationCurrent(race);
  const snapshots = race.distances.map(
    (item) => item.registration || race.registration,
  );
  const first = snapshots[0];
  const shared =
    perDistance &&
    first !== undefined &&
    snapshots.every(
      (item) =>
        item &&
        (['notes', 'source_url', 'url', 'checked_on'] as const).every(
          (key) => item[key] === first[key],
        ),
    )
      ? first
      : null;
  const distances = race.distances
    .map(
      (item) =>
        `<li><b>${escapeHTML(item.name)}</b> · ${escapeHTML(timeLabel(item.start_time))}${item.location ? ` · ${escapeHTML(item.location)}` : ''}${perDistance ? `<div class="distance-registration">${registrationDetails(item.registration || race.registration, race, { shared: Boolean(shared) })}</div>` : ''}</li>`,
    )
    .join('');
  const urls = [race.source_url, ...race.additional_sources];
  const labels = RunData.linkLabels(urls);
  const links = urls
    .map((url) => `<li>${external(url, labels.get(url) || siteName(url))}</li>`)
    .join('');
  const registration = perDistance
    ? `${registrationTag(RunData.raceRegistration(race))}<p>Availability and deadlines for each distance are listed below.</p>${shared ? registrationSource(shared) : ''}`
    : registrationDetails(race.registration, race);
  const calendar = RunData.calendarOffered(
    'race',
    race.status,
    race.end_date || race.date,
    RunData.localMinute(new Date()).slice(0, 10),
  );
  return dialog({
    label: `${race.needs_review ? 'CHECK DETAILS · ' : ''}${race.status === 'scheduled' ? 'RACE' : race.status.toUpperCase()} · CHECKED ${shortDate(race.checked_on).toUpperCase()}`,
    warning: statusWarning(race.status),
    title: race.title,
    sub: escapeHTML(
      race.area === 'sf' && race.city === 'San Francisco'
        ? race.city
        : `${race.city} · ${AREA_NAMES[race.area] || 'Bay Area'}`,
    ),
    sections: [
      ['DATE', escapeHTML(raceDate(race))],
      ['START AREA', escapeHTML(race.location)],
      ['REGISTRATION', registration],
      ['DISTANCES & START TIMES · PACIFIC TIME', `<ul>${distances}</ul>`],
      [
        'NOTES',
        `${escapeHTML(race.notes || 'Check the organizer for registration, course and current details.')}${researchNotes(race.research_notes)}`,
      ],
      [
        'RACE LINKS',
        `<ul>${links}</ul><span class="pattern-warning">Details can change. Confirm with the organizer before you register.</span>`,
      ],
    ],
    actions: [
      external(race.source_url, 'OPEN RACE PAGE', 'detail-link'),
      permalink('race', race.id, calendar),
    ],
  });
}
export function showEvent(event: DatedEvent) {
  const source = store.sourceById.get(event.source_id);
  const status = {
    published: 'GROUP RUN',
    unconfirmed: 'UNCONFIRMED RUN',
    cancelled: 'CANCELLED',
    postponed: 'POSTPONED',
  }[event.status];
  const options = event.meeting_options?.length
    ? `<ul>${event.meeting_options
        .map(
          (option) =>
            `<li>${escapeHTML(timeLabel(option.local_time))} · ${escapeHTML(option.location)}${option.details ? ` · ${escapeHTML(option.details)}` : ''}</li>`,
        )
        .join('')}</ul>`
    : '';
  const sourceIds = [event.source_id, ...(event.additional_source_ids || [])];
  const extras = event.additional_source_ids?.length
    ? sourceList(event.additional_source_ids, sourceIds)
    : '';
  const calendar = RunData.calendarOffered(
    'event',
    event.status,
    (event.ends_at_local || event.starts_at_local).slice(0, 10),
    RunData.localMinute(new Date()).slice(0, 10),
  );
  return dialog({
    label: `${event.needs_review ? 'CHECK DETAILS · ' : ''}${status} · CHECKED ${shortDate(event.checked_on).toUpperCase()}`,
    warning: statusWarning(event.status),
    title: event.title,
    sub: clubLink(event.club_id),
    sections: [
      [
        'DATE & TIME',
        `${escapeHTML(dateInfo(event.starts_at_local))} · ${escapeHTML(timeLabel(event.starts_at_local.slice(11, 16)))} · San Francisco time`,
      ],
      ['MEETING PLACE', meetingPlace(event)],
      optional('OTHER MEETING OPTIONS', options),
      optional('RUN DETAILS', practicalDetails(event)),
      optional('NOTES', escapeHTML(event.notes)),
      [
        'WHERE WE FOUND IT',
        `${linkSource(event.source_id, sourceIds)}<br><span class="pattern-warning">Plans can change. Check the event page before you go.</span>${researchNotes(event.research_notes)}`,
      ],
      optional('ALSO LISTED ON', extras),
    ],
    actions: [
      source ? external(source.url, 'OPEN EVENT PAGE', 'detail-link') : '',
      permalink('event', event.id, calendar),
    ],
  });
}
export function showPattern(pattern: Schedule) {
  const dateBounds = patternDates(pattern)
    ? ` · ${escapeHTML(patternDates(pattern))}`
    : '';
  const status = patternStatus(pattern);
  return dialog({
    label: `REGULAR RUN${status ? ` · ${status}` : ''} · CHECKED ${shortDate(pattern.checked_on).toUpperCase()}`,
    title: pattern.label,
    sub: clubLink(pattern.club_id),
    sections: [
      [
        'SCHEDULE',
        `${escapeHTML(showDays(pattern.days))} · ${escapeHTML(timeLabel(pattern.local_time))} · ${escapeHTML(pattern.frequency)}${dateBounds}`,
      ],
      clubScheduleChanges(pattern.club_id),
      ['MEETING PLACE', meetingPlace(pattern)],
      optional('RUN DETAILS', practicalDetails(pattern)),
      optional('NOTES', escapeHTML(pattern.notes)),
      [
        'WHERE WE FOUND IT',
        `${linkSource(pattern.source_id)}<br><span class="pattern-warning">A regular run can be skipped or moved. Check with the club before you go.</span>${researchNotes(pattern.research_notes)}`,
      ],
    ],
    actions: [permalink('pattern', pattern.id)],
  });
}
function clubPlaces(club: Club) {
  const names = clubNeighborhoods(club);
  return names.length
    ? `${escapeHTML(names.join(' · '))}<br><span class="pattern-warning">Where its listed runs start, most frequent first.</span>`
    : 'Not known. The club may change locations or not post them.';
}
function clubRaces(club: Club) {
  const now = new Date();
  const hosted = store.races
    .filter(
      (race) =>
        race.club_ids?.includes(club.id) &&
        RunData.raceMatches(race, { ...DEFAULTS, period: 'upcoming' }, now),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return hosted.length
    ? `<ul>${hosted.map((race) => `<li><a href="?race=${encodeURIComponent(race.id)}">${escapeHTML(race.title)}</a> · ${escapeHTML(raceDate(race))}</li>`).join('')}</ul>`
    : '';
}
export function showClub(club: Club) {
  const audit = store.auditByClub.get(club.id);
  const patterns = visiblePatterns(store.patternsByClub.get(club.id) || []);
  const upcoming = store.events
    .filter(
      (item) =>
        item.club_id === club.id &&
        RunData.eventMatches(item, DEFAULTS, new Date()),
    )
    .sort((a, b) => a.starts_at_local.localeCompare(b.starts_at_local));
  const upcomingHTML = upcoming.length
    ? `<ul>${upcoming
        .slice(0, 5)
        .map(
          (item) =>
            `<li><a href="?event=${encodeURIComponent(item.id)}">${escapeHTML(item.title)}</a> · ${escapeHTML(dateInfo(item.starts_at_local))} · ${escapeHTML(timeLabel(item.starts_at_local.slice(11, 16)))}</li>`,
        )
        .join(
          '',
        )}</ul><a href="?view=events&amp;for_club=${encodeURIComponent(club.id)}">${upcoming.length === 1 ? 'View this upcoming run in the list' : `View all ${upcoming.length} upcoming runs`}${ARROW}</a>`
    : 'None listed right now. The club links below may have more.';
  const patternHTML = patterns.length
    ? `<ul>${patterns
        .map(
          (item) =>
            `<li><a href="?pattern=${encodeURIComponent(item.id)}"><b>${escapeHTML(showDays(item.days))} · ${escapeHTML(timeLabel(item.local_time))}</b></a> · ${escapeHTML(item.frequency)}${patternDates(item) ? `<br><span class="pattern-warning">${escapeHTML([patternStatus(item), patternDates(item)].filter(Boolean).join(' · '))}</span>` : ''}<br>${escapeHTML(item.location)}${item.status === 'needs_review' ? '<br><span class="pattern-warning">Schedule uncertain.</span>' : ''}${item.notes ? `<br><span class="pattern-warning">${escapeHTML(item.notes)}</span>` : ''}<br>${linkSource(item.source_id)}</li>`,
        )
        .join('')}</ul>`
    : 'No regular schedule found.';
  const references = audit?.reference_source_ids?.length
    ? sourceList(audit.reference_source_ids, audit.reference_source_ids)
    : 'No links found yet.';
  return dialog({
    label: `RUNNING CLUB · ${(club.geography || 'Area unknown').toUpperCase()}`,
    title: club.name,
    sub: escapeHTML(
      upcoming.length
        ? `${upcoming.length} upcoming ${upcoming.length === 1 ? 'run' : 'runs'}`
        : 'No upcoming runs listed',
    ),
    sections: [
      clubScheduleChanges(club.id),
      ['UPCOMING RUNS', upcomingHTML],
      optional('CLUB RACES', clubRaces(club)),
      ['ABOUT', escapeHTML(club.description || 'No description yet.')],
      ['WHERE THEY MEET', clubPlaces(club)],
      ['REGULAR RUNS', patternHTML],
      ['CLUB LINKS', references],
      [
        'LAST CHECKED',
        `${escapeHTML(shortDate(audit?.checked_on))}${audit?.result === 'identity_unresolved' ? ' · We haven’t confirmed which club this is.' : ''}${researchNotes(audit?.notes)}`,
      ],
    ],
    actions: [permalink('club', club.id)],
  });
}

/* ---------- Actions ---------- */

/* Save a dated run or race as an .ics file for the visitor's calendar. */
export function downloadCalendar(button: HTMLButtonElement) {
  const { calendar: kind = '', calendarId: id = '' } = button.dataset;
  const url = RunData.listingURL(kind, id, location.href);
  const event =
    kind === 'event' ? store.events.find((item) => item.id === id) : undefined;
  const race =
    kind === 'race' ? store.races.find((item) => item.id === id) : undefined;
  const file = event
    ? RunData.eventCalendar(event, {
        url,
        source: store.sourceById.get(event.source_id)?.url,
        club: clubName(event.club_id),
      })
    : race && RunData.raceCalendar(race, { url });
  if (!file) return;
  const href = URL.createObjectURL(
    new Blob([file.ics], { type: 'text/calendar;charset=utf-8' }),
  );
  const link = Object.assign(document.createElement('a'), {
    href,
    download: file.filename,
    hidden: true,
  });
  // Stay inside the modal dialog, outside which the page is inert.
  button.after(link);
  link.click();
  link.remove();
  // Some browsers read the file after click() returns.
  setTimeout(() => URL.revokeObjectURL(href), 40_000);
}
export async function copyListingLink(button: HTMLButtonElement) {
  if (button.getAttribute('aria-busy') === 'true') return;
  const actions = button.closest('.detail-actions');
  const feedback = actions?.querySelector<HTMLElement>('.copy-feedback');
  const fallback = actions?.querySelector<HTMLElement>('.copy-fallback');
  if (!feedback || !fallback || !button.dataset.copyLink) return;
  button.setAttribute('aria-busy', 'true');
  feedback.textContent = '';
  fallback.hidden = true;
  try {
    await navigator.clipboard.writeText(button.dataset.copyLink);
    if (button.isConnected && $('#detail').open)
      feedback.textContent = 'Link copied.';
  } catch {
    // Keep sharing usable when clipboard access is unavailable or denied.
    // A late permission response must not move focus after navigation.
    if (button.isConnected && $('#detail').open) {
      feedback.textContent = 'Copy this address:';
      fallback.hidden = false;
      const input = fallback.querySelector('input');
      input?.focus();
      input?.select();
    }
  } finally {
    button.removeAttribute('aria-busy');
  }
}
