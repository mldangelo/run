import type {
  Area,
  Audit,
  Club,
  ClubPlaces,
  DatedEvent,
  Filter,
  Race,
  Registration,
  RegistrationStatus,
  Run,
  Schedule,
  Source,
} from '../scripts/types.mts';
import * as RunData from './model.js';

type View = 'events' | 'patterns' | 'clubs' | 'races';
type Listing = Club | DatedEvent | Schedule | Race;
type Control = keyof typeof DEFAULTS;
type SelectedElement<S extends string> = S extends '#detail'
  ? HTMLDialogElement
  : S extends '#advanced-filters'
    ? HTMLDetailsElement
    : S extends '#search'
      ? HTMLInputElement
      : S extends `#${Exclude<Control, 'search'>}`
        ? HTMLSelectElement
        : S extends `${string} option${string}`
          ? HTMLOptionElement
          : HTMLElement;
const $ = <S extends string>(selector: S) =>
  document.querySelector(selector) as SelectedElement<S>;
const escapeHTML = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      (
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }) as Record<string, string>
      )[char],
  );
const shorten = (value: string, max = 100) =>
  value && value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
const weekdays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
const STALE_AFTER_DAYS = 14;
const SITE_TITLE = document.title;
/* Default value of every filter control. Non-default values go in the URL. */
const DEFAULTS = {
  search: '',
  period: 'upcoming',
  month: 'all',
  day: 'all',
  time: 'all',
  status: 'published',
  area: 'all',
  distance: 'all',
  format: 'all',
  registration: 'all',
  run_area: 'all',
  neighborhood: 'all',
  run_distance: 'all',
  beginner: 'all',
};
/* San Francisco is primary; Marin County is featured; 'bay' is elsewhere. */
// Typed against the shared vocabulary so a new area cannot go unlabeled.
const AREA_NAMES: Record<Area, string> = {
  sf: 'San Francisco',
  marin: 'Marin County',
  bay: 'Bay Area',
};
const PARAM_NAMES: Partial<Record<Control, string>> & { search: string } = {
  search: 'q',
};
const VIEWS: Record<
  View,
  {
    number: string;
    title: string;
    note: string;
    context: string;
    controls: Control[];
  }
> = {
  events: {
    number: '01',
    title: 'Upcoming runs',
    note: 'Group runs we found on club calendars and event pages. Filters only match details a club lists. Times are San Francisco time.',
    context: 'BY DATE · SAN FRANCISCO TIME',
    controls: [
      'period',
      'month',
      'day',
      'time',
      'status',
      'run_area',
      'neighborhood',
      'run_distance',
      'beginner',
    ],
  },
  patterns: {
    number: '02',
    title: 'Regular runs',
    note: 'Each club’s usual schedule. A regular run can be skipped or moved, so check with the club before you go. Filters only match details a club lists.',
    context: 'BY DAY · SAN FRANCISCO TIME',
    controls: [
      'day',
      'time',
      'run_area',
      'neighborhood',
      'run_distance',
      'beginner',
    ],
  },
  clubs: {
    number: '03',
    title: 'Meet the clubs',
    note: 'Running clubs in San Francisco and around the Bay. If a club has no runs listed, we haven’t found them yet; the club may still be active.',
    context: 'A TO Z',
    controls: ['area', 'neighborhood'],
  },
  races: {
    number: '04',
    title: 'Races on the calendar',
    note: 'Registration status can differ by distance. Opening and closing times are Pacific time.',
    context: 'BY DATE · SAN FRANCISCO TIME',
    controls: [
      'period',
      'month',
      'day',
      'time',
      'area',
      'distance',
      'format',
      'registration',
    ],
  },
};
const SELECTS = (Object.keys(DEFAULTS) as Control[]).filter(
  (id) => id !== 'search',
);

let clubs: Club[] = [],
  events: DatedEvent[] = [],
  schedules: Schedule[] = [],
  sources: Source[] = [],
  audits: Audit[] = [],
  races: Race[] = [];
let clubById = new Map<string, Club>(),
  sourceById = new Map<string, Source>(),
  auditByClub = new Map<string, Audit>(),
  patternsByClub = new Map<string, Schedule[]>(),
  placesByClub = new Map<string, ClubPlaces>(),
  upcomingByClub = new Map<string, number>();
let dataReady = false;
let loading = false;
let view: View = 'events';
let openRecord: { kind: string; id: string } | null = null,
  clubFilter = '';

const showDays = (values: string[]) =>
  values.map((day) => day.slice(0, 3).toUpperCase()).join(' / ');
const clubName = (id: string) => clubById.get(id)?.name || id;
function timeLabel(time: string | null) {
  if (!time) return 'Time unknown';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function dateInfo(localDate: string, options: Intl.DateTimeFormatOptions = {}) {
  const date = new Date(`${localDate.slice(0, 10)}T12:00:00Z`);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
    ...options,
  });
}
function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
/* The arrow is decoration; screen readers hear whether a link opens a new
   tab instead. Every new-tab link must include NEW_TAB. */
const ARROW = '<span aria-hidden="true"> ↗</span>';
const NEW_TAB = '<span class="sr-only"> (opens in a new tab)</span>';
const external = (url: string, label = url, className = '') =>
  `<a${className ? ` class="${className}"` : ''} href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}${ARROW}${NEW_TAB}</a>`;
/* A check date as "Nov 8", with the year when it is not this year. */
function shortDate(isoDate: string | null | undefined) {
  if (!isoDate) return 'date unknown';
  const thisYear = RunData.localMinute(new Date()).slice(0, 4);
  return dateInfo(isoDate, {
    weekday: undefined,
    year: isoDate.startsWith(thisYear) ? undefined : 'numeric',
  });
}
/* "strava.com" for https://www.strava.com/clubs/…, for link text. */
function siteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
const SOURCE_KINDS: Record<string, string> = {
  club: 'club page',
  host: 'host page',
  secondary: 'directory',
};
const SOURCE_ACCESS: Record<string, string> = {
  restricted: 'limited access',
  login_for_events: 'sign-in needed',
};
function linkSource(id: string) {
  const source = sourceById.get(id);
  if (!source) return '';
  const facts = [
    SOURCE_KINDS[source.authority],
    SOURCE_ACCESS[source.access],
    source.last_checked
      ? `checked ${shortDate(source.last_checked)}`
      : 'not checked yet',
  ].filter(Boolean);
  return `${external(source.url, siteName(source.url))} <span class="pattern-warning">${escapeHTML(facts.join(' · '))}</span>`;
}
function detailRow(label: string, contents: string) {
  return `<div class="detail-row"><h3 class="detail-key">${escapeHTML(label)}</h3>${contents}</div>`;
}
/* Evidence detail stays available without crowding what a runner needs. */
const researchNotes = (notes: string | undefined) =>
  notes
    ? `<details class="detail-more"><summary>Research notes</summary><p>${escapeHTML(notes)}</p></details>`
    : '';
const permalink = (kind: string, id: string) => {
  const query = `?${kind}=${encodeURIComponent(id)}`;
  const body = `Listing: ${new URL(query, location.href).href}\n\nCorrection and supporting source:\n`;
  const email = `mailto:hi@mldangelo.com?subject=${encodeURIComponent('SF Run Club Index correction')}&body=${encodeURIComponent(body)}`;
  return `<a class="permalink" href="${query}">DIRECT LINK${ARROW}</a><a class="permalink" href="${escapeHTML(email)}">Suggest a correction</a>`;
};
const rowButton = (
  kind: string,
  id: string,
  className: string,
  contents: string,
) =>
  `<button type="button" class="${className}" data-kind="${kind}" data-id="${escapeHTML(id)}" aria-haspopup="dialog">${contents}<span class="row-action" aria-hidden="true">DETAILS ↗</span></button>`;
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
/* Only the details a source lists; unknown details are left out. */
function practicalDetails(item: Run) {
  const details = item.run_details || {};
  const yesNo = (value: boolean | undefined, yes: string, no: string) =>
    value === true ? yes : value === false ? no : '';
  const lines = [
    ['Distance', details.distances?.map((option) => option.label).join(' / ')],
    ['Pace', details.pace],
    [
      'Beginners',
      yesNo(details.beginner_friendly, 'Welcome', 'Not beginner-friendly'),
    ],
    ['No-drop', yesNo(details.no_drop, 'Yes', 'No')],
    ['Cost', details.cost],
    ['RSVP', details.rsvp],
    ['Access', details.access],
    [
      'Meeting point',
      details.meeting_point === 'members_only'
        ? 'Exact location visible to members'
        : details.meeting_point === 'pending'
          ? 'Still to be announced'
          : details.meeting_point === 'after_registration'
            ? 'Shared after registration or approval'
            : '',
    ],
    [
      'Joining',
      {
        open: 'Open to visitors',
        registration_required: 'Registration required',
        approval_required: 'Approval required',
        members_only: 'Members only',
        waiver_required: 'Waiver required for visitors',
      }[details.participation as NonNullable<typeof details.participation>] ||
        '',
    ],
  ].filter(([, value]) => value);
  if (!lines.length) return '';
  // Details normally share the run's own source and check date, shown under
  // WHERE WE FOUND IT; name them here only when they differ.
  const sources = details.sources ?? [
    sourceById.get(item.source_id)?.url ?? '',
  ];
  const references =
    details.sources || details.checked_on
      ? `<br><span class="pattern-warning">Checked ${escapeHTML(shortDate(details.checked_on ?? item.checked_on))} on ${sources
          .filter(Boolean)
          .map((url) => external(url, siteName(url)))
          .join(', ')}</span>`
      : '';
  return detailRow(
    'RUN DETAILS',
    `<ul>${lines.map(([label, value]) => `<li><b>${escapeHTML(label)}:</b> ${escapeHTML(value)}</li>`).join('')}</ul>${references}`,
  );
}
function meetingPlace(item: Run) {
  const query = item.location_info?.directions_query;
  const link = query
    ? `<br>${external(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, 'Directions')}`
    : '';
  return `${escapeHTML(item.location)}${link}`;
}

/* ---------- Filters and URL state ---------- */

function controlValue(id: Control) {
  return id === 'search' ? $('#search').value.trim() : $(`#${id}`).value;
}
function activeControls(): Control[] {
  return ['search', ...VIEWS[view].controls];
}
function filtersChanged() {
  return (
    Boolean(clubFilter) ||
    activeControls().some((id) => controlValue(id) !== DEFAULTS[id])
  );
}
function advancedFiltersChanged() {
  return VIEWS[view].controls.filter(
    (id) =>
      $('#advanced-filters').contains($(`#${id}`)) &&
      controlValue(id) !== DEFAULTS[id],
  ).length;
}
function renderActiveFilters() {
  const selected = activeControls().filter(
    (id) => controlValue(id) !== DEFAULTS[id],
  );
  $('#active-filters').hidden = !selected.length;
  $('#active-filters').innerHTML = selected
    .map((id) => {
      // Reuse the controls' labels and option text so the summary agrees
      // with the menus, including unknown values and distance choices.
      const text =
        id === 'search'
          ? 'Search'
          : $(`#${id}-wrap`).querySelector('span')?.textContent || 'Filter';
      const label = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
      const option =
        id === 'search'
          ? controlValue(id)
          : $(`#${id}`).selectedOptions[0]?.textContent || controlValue(id);
      const value =
        id === 'neighborhood' ? option.replace(/ \(\d+\)$/, '') : option;
      return `<button type="button" class="reset filter-chip" data-clear-filter="${id}" aria-label="${escapeHTML(`Remove ${label}: ${value}`)}">${escapeHTML(`${label}: ${value}`)} <span aria-hidden="true">×</span></button>`;
    })
    .join('');
}
function clearFilter(button: HTMLButtonElement) {
  const id = button.dataset.clearFilter as Control;
  if (!activeControls().includes(id)) return;
  const position = [...$('#active-filters').querySelectorAll('button')].indexOf(
    button,
  );
  $(`#${id}`).value = DEFAULTS[id];
  render();
  const remaining =
    $('#active-filters').querySelectorAll<HTMLButtonElement>('button');
  (remaining[position] || remaining[position - 1] || $('#search')).focus();
}
function syncURL(pushDetail = false) {
  const params = new URLSearchParams();
  if (view !== 'events') params.set('view', view);
  if (clubFilter && ['events', 'patterns'].includes(view))
    params.set('for_club', clubFilter);
  for (const id of activeControls()) {
    const value = controlValue(id);
    if (value !== DEFAULTS[id]) params.set(PARAM_NAMES[id] || id, value);
  }
  if (openRecord) params.set(openRecord.kind, openRecord.id);
  const query = params.toString();
  const next = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
  if (next !== `${location.pathname}${location.search}${location.hash}`) {
    if (pushDetail) history.pushState({ runIndexDetail: true }, '', next);
    else history.replaceState(history.state, '', next);
  }
}
/* The URL is the only source of filter state; ignore browser form restoration. */
function applyParams(params: URLSearchParams) {
  $('#search').value = params.get(PARAM_NAMES.search) || DEFAULTS.search;
  for (const id of SELECTS) {
    const value = params.get(id);
    const select = $(`#${id}`);
    const valid = [...select.options].some(
      (option) => option.value === value && !option.disabled,
    );
    select.value = valid ? value || DEFAULTS[id] : DEFAULTS[id];
  }
  $('#advanced-filters').open = advancedFiltersChanged() > 0;
}
function resetFilters() {
  clubFilter = '';
  $('#search').value = DEFAULTS.search;
  for (const id of SELECTS) $(`#${id}`).value = DEFAULTS[id];
  $('#advanced-filters').open = false;
  render();
}
const clubNeighborhoods = (club: { id: string }) =>
  placesByClub.get(club.id)?.neighborhoods || [];
const runNeighborhoods = (run: Listing) =>
  'location_info' in run && run.location_info?.neighborhood
    ? [run.location_info.neighborhood]
    : [];
/* Neighborhood options, grouped by area. With ``counts`` (from
   neighborhoodCounts) each option shows how many rows it would match and
   options with none are left out, except the current choice. Without
   counts every neighborhood used by the view is listed, so a URL value can
   be applied before the first render. */
function populateNeighborhoods(counts: Map<string, number> | null = null) {
  const select = $('#neighborhood');
  const current = select.value;
  const areaOf = new Map();
  for (const item of [...events, ...schedules]) {
    const info = item.location_info;
    if (info?.neighborhood) areaOf.set(info.neighborhood, info.area);
  }
  const names = new Set(
    view === 'clubs'
      ? clubs.flatMap(clubNeighborhoods)
      : (view === 'events' ? events : schedules).flatMap(runNeighborhoods),
  );
  const label = (name: string, text = name) =>
    counts ? `${text} (${counts.get(name) || 0})` : text;
  const listed = (name: string) =>
    !counts || (counts.get(name) || 0) > 0 || name === current;
  const group = (area: string, heading: string) => {
    const options = [...names]
      .filter((name) => areaOf.get(name) === area && listed(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => new Option(label(name), name));
    if (!options.length) return [];
    const element = document.createElement('optgroup');
    element.label = heading;
    element.append(...options);
    return [element];
  };
  select.replaceChildren(
    new Option('Anywhere', 'all'),
    ...group('sf', AREA_NAMES.sf),
    ...group('marin', AREA_NAMES.marin),
    ...group('bay', 'Elsewhere in the Bay Area'),
    ...(listed('unknown')
      ? [new Option(label('unknown', 'Not listed'), 'unknown')]
      : []),
  );
  select.value = [...select.options].some((option) => option.value === current)
    ? current
    : 'all';
}
/* How many rows each neighborhood would match with every other filter
   kept, so the menu shows where the current results meet. */
function neighborhoodCounts() {
  const counts = new Map<string, number>();
  const places = view === 'clubs' ? clubNeighborhoods : runNeighborhoods;
  for (const row of currentRows({ neighborhood: 'all' })) {
    const names = places(row);
    for (const name of names.length ? names : ['unknown'])
      counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}
/* Month options come from the records of the current view only. */
function populateMonths() {
  const select = $('#month');
  const current = select.value;
  const months = [
    ...new Set(
      view === 'events'
        ? events.map((event) => event.starts_at_local.slice(0, 7))
        : races.flatMap((race) => [
            race.date.slice(0, 7),
            (race.end_date || race.date).slice(0, 7),
          ]),
    ),
  ].sort();
  select.replaceChildren(
    new Option('Any month', 'all'),
    ...months.map((month) => new Option(monthLabel(month), month)),
  );
  select.value = months.includes(current) ? current : 'all';
}
function configureView(next: View) {
  view = next;
  const meta = VIEWS[view];
  for (const button of document.querySelectorAll<HTMLElement>('[data-view]')) {
    const active = button.dataset.view === view;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  }
  $('#section-number').textContent = meta.number;
  $('#section-title').innerHTML =
    `${escapeHTML(meta.title)}<span class="dot">.</span>`;
  $('#view-note').textContent = meta.note;
  $('#context-note').textContent = meta.context;
  for (const id of SELECTS)
    $(`#${id}-wrap`).hidden = !meta.controls.includes(id);
  // Races always have a known area, so "Unknown" applies to clubs only.
  const unknownArea = $('#area option[value="unknown"]');
  unknownArea.hidden = view === 'races';
  unknownArea.disabled = view === 'races';
  if (view === 'races' && $('#area').value === 'unknown')
    $('#area').value = 'all';
  $('#period option[value="upcoming"]').textContent = 'Upcoming';
  $('#period option[value="past"]').textContent = 'Past';
  if (meta.controls.includes('month')) populateMonths();
  if (meta.controls.includes('neighborhood')) populateNeighborhoods();
  if (advancedFiltersChanged()) $('#advanced-filters').open = true;
}
function setView(next: string | undefined) {
  if (!next || !Object.hasOwn(VIEWS, next)) return;
  if (!['events', 'patterns'].includes(next)) clubFilter = '';
  configureView(next as View);
  render();
}

/* ---------- Rows ---------- */

/* Only access limits a runner will meet; how we researched a source stays
   in the dialog. */
function accessSummary(item: Run) {
  const access = sourceById.get(item.source_id)?.access;
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
function eventRow(event: DatedEvent) {
  const [start = RunData.eventStarts(event)[0], ...otherStarts] =
    RunData.matchingEventStarts(
      event,
      {
        period: $('#period').value,
        time: $('#time').value,
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
    `<span class="row-date"><span class="row-day">${escapeHTML(dateInfo(event.starts_at_local))}</span><span>${escapeHTML(timeLabel(start.local_time))}${otherStarts.length ? ' + more' : ''}</span></span><span class="row-title">${escapeHTML(event.title)}<small>${escapeHTML(clubName(event.club_id))}</small></span><span class="row-place">${escapeHTML(start.location)}<small>${escapeHTML([neighborhood, accessSummary(event), `Checked ${shortDate(event.checked_on)}`].filter(Boolean).join(' · '))}</small></span><span class="row-note">${uncertain}${escapeHTML(shorten(practicalSummary(event), 150))}${attendanceSummary(event)}</span>`,
  );
}
function patternDates(pattern: Schedule) {
  if (pattern.valid_from && pattern.valid_until)
    return `${dateInfo(pattern.valid_from)} – ${dateInfo(pattern.valid_until)}`;
  if (pattern.valid_from) return `From ${dateInfo(pattern.valid_from)}`;
  if (pattern.valid_until) return `Through ${dateInfo(pattern.valid_until)}`;
  return '';
}
/* A short tag for a regular run, or '' for an ordinary current schedule. */
function patternStatus(pattern: Schedule, now = new Date()) {
  const state = RunData.patternState(pattern, now);
  const review = pattern.status === 'needs_review';
  if (state === 'future')
    return review ? 'SEASONAL · CHECK SCHEDULE' : 'SEASONAL';
  if (state === 'expired') return 'ENDED';
  if (state === 'superseded') return 'REPLACED';
  return review ? 'CHECK SCHEDULE' : '';
}
function visiblePatterns(items: Schedule[], now = new Date()) {
  return items.filter((item) =>
    RunData.patternMatches(item, { day: 'all', time: 'all' }, now),
  );
}
function patternRow(pattern: Schedule) {
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
  audit: Audit | undefined,
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
function clubRow(club: Club) {
  const audit = auditByClub.get(club.id);
  const patterns = visiblePatterns(patternsByClub.get(club.id) || []);
  const pattern = patterns.length
    ? patterns
        .slice(0, 2)
        .map(
          (item) =>
            `${showDays(item.days)}${item.local_time ? ` ${timeLabel(item.local_time)}` : ''}${RunData.patternState(item, new Date()) === 'future' ? ` (from ${shortDate(item.valid_from)})` : item.valid_until ? ` (through ${shortDate(item.valid_until)})` : ''}${item.status === 'needs_review' ? ' (check schedule)' : ''}`,
        )
        .join(' · ')
    : 'No regular schedule found';
  const upcomingCount = upcomingByClub.get(club.id) || 0;
  const status = clubStatus(audit, patterns, upcomingCount);
  const uncertain = status === 'UNVERIFIED' ? ' uncertain' : '';
  return rowButton(
    'club',
    club.id,
    'row club-row',
    `<span class="row-title">${escapeHTML(club.name)}<small>${escapeHTML(placeSummary(clubNeighborhoods(club)) || club.geography || 'Unknown area')} · ${upcomingCount ? `${upcomingCount} upcoming ${upcomingCount === 1 ? 'run' : 'runs'}` : 'No upcoming runs listed'}</small></span><span class="row-place">${escapeHTML(pattern)}${patterns.length ? '<small>Regular schedule</small>' : ''}</span><span class="row-note">${escapeHTML(shorten(club.description || 'No description yet.', 115))}</span><span class="row-status"><span class="tag${uncertain}">${status}</span></span>`,
  );
}
function raceDate(race: Race) {
  return race.end_date
    ? `${dateInfo(race.date)} – ${dateInfo(race.end_date)}`
    : dateInfo(race.date);
}
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
function registrationTag(status: keyof typeof REGISTRATION_LABELS) {
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
const registrationCurrent = (race: Race) =>
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
function registrationSource(registration: Registration) {
  const status = RunData.registrationState(registration);
  // `url` is stored only when registration happens somewhere other than the
  // page we checked; otherwise both links would lead to the same page.
  const checkedElsewhere = registration.url
    ? ` · ${external(registration.source_url, 'Registration source')}`
    : '';
  return `<p>${escapeHTML(registration.notes)}</p><span class="pattern-warning">Registration checked ${escapeHTML(shortDate(registration.checked_on))}${checkedElsewhere}</span><p>${external(registration.url ?? registration.source_url, status === 'open' ? 'Register with organizer' : 'Organizer’s registration page')}</p>`;
}
function registrationDetails(
  registration: Registration | undefined,
  race: Race,
  { shared = false } = {},
) {
  if (!registrationCurrent(race))
    return 'Registration is not shown for past, cancelled or postponed races.';
  return `${registrationStatus(registration, race)}${registration && !shared ? registrationSource(registration) : ''}`;
}
function raceRow(race: Race) {
  const distance = $('#distance').value;
  const time = $('#time').value;
  const statusFilter = $('#registration').value;
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
  const startLabel = starts.length
    ? `${timeLabel(starts[0])}${more ? ' + more' : ''}`
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
    `<span class="row-date"><span class="row-day">${escapeHTML(raceDate(race))}</span><span>${escapeHTML(startLabel)}</span></span><span class="row-title">${escapeHTML(race.title)}<small>${escapeHTML(race.city)}</small></span><span class="row-place">${escapeHTML(race.location)}<small>Checked ${escapeHTML(shortDate(race.checked_on))}</small></span><span class="row-note">${registrationCurrent(race) ? `${registrationTag(registration)} ` : ''}${review}${format}${escapeHTML(matching.map((item) => item.name).join(' · '))}${timing}</span>`,
  );
}
const tableHead = (labels: string[], className = 'table-head') =>
  `<div class="${className}" aria-hidden="true">${labels.map((label) => `<span>${label}</span>`).join('')}<span></span></div>`;
function matchesRunFilters(item: Run, filter: Filter) {
  return (
    RunData.runLocationMatches(item, {
      area: filter.run_area,
      neighborhood: filter.neighborhood,
    }) &&
    RunData.runDetailsMatch(item, {
      distance: filter.run_distance,
      beginner: filter.beginner,
    })
  );
}

/* ---------- Rendering ---------- */

function currentRows(overrides: Partial<Filter> = {}): Listing[] {
  const query = $('#search').value;
  const filter = {
    ...Object.fromEntries(SELECTS.map((id) => [id, controlValue(id)])),
    ...overrides,
  } as Filter;
  const now = new Date();
  if (view === 'events')
    return events
      .filter(
        (event) =>
          RunData.eventMatches(event, filter, now) &&
          (!clubFilter || event.club_id === clubFilter) &&
          matchesRunFilters(event, filter) &&
          RunData.matchesQuery(
            query,
            event.title,
            event.location,
            event.notes || '',
            clubName(event.club_id),
            ...(event.meeting_options || []).map((option) => option.location),
          ),
      )
      .sort((a, b) => {
        const start = (item: DatedEvent) =>
          `${item.starts_at_local.slice(0, 10)}T${RunData.matchingEventStarts(item, filter, now)[0].local_time}`;
        return start(a).localeCompare(start(b));
      });
  if (view === 'races')
    return races
      .filter(
        (race) =>
          RunData.raceMatches(race, filter, now) &&
          RunData.matchesQuery(
            query,
            race.title,
            race.city,
            race.location,
            race.notes,
            ...race.distances.map((item) => item.name),
          ),
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
      );
  if (view === 'patterns')
    return schedules
      .filter(
        (pattern) =>
          RunData.patternMatches(pattern, filter, now) &&
          (!clubFilter || pattern.club_id === clubFilter) &&
          matchesRunFilters(pattern, filter) &&
          RunData.matchesQuery(
            query,
            pattern.label,
            pattern.location,
            pattern.notes || '',
            clubName(pattern.club_id),
          ),
      )
      .sort(
        (a, b) =>
          weekdays.indexOf(a.days[0]) - weekdays.indexOf(b.days[0]) ||
          (a.local_time || '99:99').localeCompare(b.local_time || '99:99'),
      );
  return clubs.filter(
    (club) =>
      RunData.clubMatches(club, filter, placesByClub.get(club.id)) &&
      RunData.matchesQuery(
        query,
        club.name,
        club.geography,
        club.description,
        ...clubNeighborhoods(club),
      ),
  );
}
const LAYOUT = {
  events: {
    head: ['DATE / TIME', 'RUN / CLUB', 'MEETING PLACE', 'DETAILS'],
    row: eventRow,
    kind: ['RUN', 'RUNS'],
  },
  races: {
    head: [
      'DATE / TIME',
      'RACE / CITY',
      'START AREA',
      'REGISTRATION / DISTANCES',
    ],
    row: raceRow,
    kind: ['RACE', 'RACES'],
  },
  patterns: {
    head: ['DAY / TIME', 'RUN / CLUB', 'MEETING PLACE', 'DETAILS'],
    row: patternRow,
    kind: ['REGULAR RUN', 'REGULAR RUNS'],
  },
  clubs: {
    head: ['CLUB / AREA', 'REGULAR SCHEDULE', 'ABOUT', 'STATUS'],
    row: clubRow,
    kind: ['CLUB', 'CLUBS'],
    headClass: 'table-head club-row',
  },
};
function render() {
  if (!dataReady) return;
  $('#reset-filters').hidden = !filtersChanged();
  const advancedCount = advancedFiltersChanged();
  $('#filter-summary').textContent = advancedCount
    ? ` · ${advancedCount} active`
    : '';
  if (VIEWS[view].controls.includes('neighborhood'))
    populateNeighborhoods(neighborhoodCounts());
  renderActiveFilters();
  const rows = currentRows();
  const layout = LAYOUT[view] as {
    head: string[];
    headClass?: string;
    kind: string[];
    row(item: Listing): string;
  };
  let previousDay = '';
  const rendered = rows
    .map((item) => {
      const day =
        view === 'events'
          ? (item as DatedEvent).starts_at_local.slice(0, 10)
          : view === 'races'
            ? (item as Race).date
            : '';
      const heading =
        day && day !== previousDay
          ? `<h3 class="date-heading">${escapeHTML(dateInfo(day))}</h3>`
          : '';
      previousDay = day;
      return heading + layout.row(item);
    })
    .join('');
  let html = tableHead(layout.head, layout.headClass) + rendered;
  if (!rows.length) {
    const explanation =
      view === 'events' && $('#period').value === 'upcoming'
        ? 'No upcoming runs match. Try Regular runs, or change the filters.'
        : 'Nothing matches. Try another filter or search.';
    const reset = filtersChanged()
      ? '<button type="button" class="reset" data-reset>RESET FILTERS</button>'
      : '';
    html += `<div class="empty"><p>${explanation}</p>${reset}</div>`;
  }
  $('#results').innerHTML = html;
  $('#results').classList.toggle('grouped', ['events', 'races'].includes(view));
  $('#result-count').textContent =
    `${rows.length} ${layout.kind[rows.length === 1 ? 0 : 1]}`;
  $('#club-filter').hidden = !clubFilter;
  $('#club-filter').innerHTML = clubFilter
    ? `Showing runs for <strong>${escapeHTML(clubName(clubFilter))}</strong> · <button type="button" class="clear-club" data-clear-club>Show all clubs</button>`
    : '';
  const runRows = rows as Run[];
  const missing = runRows.filter(
    (item) => item.run_details?.beginner_friendly == null,
  ).length;
  const covered = new Set(runRows.map((item) => item.club_id)).size;
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  const beginners = $('#beginner').value === 'welcome';
  $('#coverage-note').textContent = !rows.length
    ? ''
    : ['events', 'patterns'].includes(view)
      ? beginners
        ? 'Only runs whose organizer says beginners are welcome. Other runs may suit you too.'
        : `${plural(rows.length, 'run', 'runs')} from ${plural(covered, 'club', 'clubs')}. ${missing ? `${missing} don’t say whether beginners are welcome.` : ''}`.trim()
      : view === 'clubs'
        ? 'A club with no schedule here may still be active.'
        : 'Some same-day listings at the same place may be one event.';
  $('#view-note').textContent = VIEWS[view].note;
  const controls = VIEWS[view].controls as readonly string[];
  for (const button of document.querySelectorAll<HTMLElement>('[data-quick]')) {
    const choice = button.dataset.quick || '';
    const control =
      choice === 'tomorrow' || choice === 'weekend' ? 'period' : choice;
    button.hidden =
      !controls.includes(control) ||
      (control === 'period' &&
        ![...$('#period').options].some((option) => option.value === choice));
    if (choice !== 'neighborhood')
      button.setAttribute(
        'aria-pressed',
        String(
          control === 'period'
            ? $('#period').value === choice
            : $('#beginner').value === 'welcome',
        ),
      );
  }
  showFreshness(rows, new Date());
  syncURL();
}

/* ---------- Detail dialog ---------- */

function statusWarning(status: string) {
  if (!['cancelled', 'postponed'].includes(status)) return '';
  return `<p class="status-warning" role="status"><strong>${status.toUpperCase()}</strong> · Previously listed details are shown for reference. Check the organizer for updates before making plans.</p>`;
}

function showRace(race: Race) {
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
  const repeated = (url: string) =>
    urls.filter((other) => siteName(other) === siteName(url)).length > 1;
  /* Show the page path when one site has several links. */
  const linkText = (url: string) => {
    if (!repeated(url)) return siteName(url);
    const path = new URL(url).pathname.replace(/\/$/, '');
    return `${siteName(url)}${path.length > 30 ? `${path.slice(0, 30)}…` : path}`;
  };
  const links = urls
    .map((url) => `<li>${external(url, linkText(url))}</li>`)
    .join('');
  return {
    title: race.title,
    html: `<div class="detail-label">${race.needs_review ? 'CHECK DETAILS · ' : ''}${race.status === 'scheduled' ? 'RACE' : race.status.toUpperCase()} · CHECKED ${escapeHTML(shortDate(race.checked_on).toUpperCase())}</div>${statusWarning(race.status)}<h2 class="detail-title" id="detail-title">${escapeHTML(race.title)}</h2><div class="detail-sub">${escapeHTML(race.area === 'sf' && race.city === 'San Francisco' ? race.city : `${race.city} · ${AREA_NAMES[race.area] || 'Bay Area'}`)}</div>${detailRow('DATE', escapeHTML(raceDate(race)))}${detailRow('START AREA', escapeHTML(race.location))}${detailRow('REGISTRATION', perDistance ? `${registrationTag(RunData.raceRegistration(race))}<p>Availability and deadlines for each distance are listed below.</p>${shared ? registrationSource(shared) : ''}` : registrationDetails(race.registration, race))}${detailRow('DISTANCES & START TIMES · PACIFIC TIME', `<ul>${distances}</ul>`)}${detailRow('NOTES', `${escapeHTML(race.notes || 'Check the organizer for registration, course and current details.')}${researchNotes(race.research_notes)}`)}${detailRow('ORGANIZER LINKS', `<ul>${links}</ul><span class="pattern-warning">Details can change. Confirm with the organizer before you register.</span>`)}<div class="detail-actions">${external(race.source_url, 'OPEN RACE PAGE', 'detail-link')}${permalink('race', race.id)}</div>`,
  };
}
function showEvent(event: DatedEvent) {
  const source = sourceById.get(event.source_id);
  const options = event.meeting_options?.length
    ? detailRow(
        'OTHER MEETING OPTIONS',
        `<ul>${event.meeting_options
          .map(
            (option) =>
              `<li>${escapeHTML(timeLabel(option.local_time))} · ${escapeHTML(option.location)}${option.details ? ` · ${escapeHTML(option.details)}` : ''}</li>`,
          )
          .join('')}</ul>`,
      )
    : '';
  const extras = (event.additional_source_ids || [])
    .map((id) => detailRow('ALSO LISTED ON', linkSource(id)))
    .join('');
  const sourceLink = source
    ? external(source.url, 'OPEN EVENT PAGE', 'detail-link')
    : '';
  return {
    title: event.title,
    html: `<div class="detail-label">${event.needs_review ? 'CHECK DETAILS · ' : ''}${{ published: 'GROUP RUN', unconfirmed: 'UNCONFIRMED RUN', cancelled: 'CANCELLED', postponed: 'POSTPONED' }[event.status]} · CHECKED ${escapeHTML(shortDate(event.checked_on).toUpperCase())}</div>${statusWarning(event.status)}<h2 class="detail-title" id="detail-title">${escapeHTML(event.title)}</h2><div class="detail-sub"><a href="?club=${encodeURIComponent(event.club_id)}">${escapeHTML(clubName(event.club_id))}${ARROW}</a></div>${detailRow('DATE & TIME', `${escapeHTML(dateInfo(event.starts_at_local))} · ${escapeHTML(timeLabel(event.starts_at_local.slice(11, 16)))} · San Francisco time`)}${detailRow('MEETING PLACE', meetingPlace(event))}${options}${practicalDetails(event)}${detailRow('NOTES', escapeHTML(event.notes || 'Check the event page for route, pace and other details.'))}${detailRow('WHERE WE FOUND IT', `${linkSource(event.source_id)}<br><span class="pattern-warning">Plans can change. Check the event page before you go.</span>${researchNotes(event.research_notes)}`)}${extras}<div class="detail-actions">${sourceLink}${permalink('event', event.id)}</div>`,
  };
}
function showPattern(pattern: Schedule) {
  const dateBounds = patternDates(pattern)
    ? ` · ${escapeHTML(patternDates(pattern))}`
    : '';
  const status = patternStatus(pattern);
  return {
    title: pattern.label,
    html: `<div class="detail-label">REGULAR RUN${status ? ` · ${status}` : ''} · CHECKED ${escapeHTML(shortDate(pattern.checked_on).toUpperCase())}</div><h2 class="detail-title" id="detail-title">${escapeHTML(pattern.label)}</h2><div class="detail-sub"><a href="?club=${encodeURIComponent(pattern.club_id)}">${escapeHTML(clubName(pattern.club_id))}${ARROW}</a></div>${detailRow('SCHEDULE', `${escapeHTML(showDays(pattern.days))} · ${escapeHTML(timeLabel(pattern.local_time))} · ${escapeHTML(pattern.frequency)}${dateBounds}`)}${detailRow('MEETING PLACE', meetingPlace(pattern))}${practicalDetails(pattern)}${detailRow('NOTES', escapeHTML(pattern.notes || 'Check the club’s page for details.'))}${detailRow('WHERE WE FOUND IT', `${linkSource(pattern.source_id)}<br><span class="pattern-warning">A regular run can be skipped or moved. Check with the club before you go.</span>${researchNotes(pattern.research_notes)}`)}<div class="detail-actions">${permalink('pattern', pattern.id)}</div>`,
  };
}
function clubPlacesHTML(club: Club) {
  const names = clubNeighborhoods(club);
  return names.length
    ? `${escapeHTML(names.join(' · '))}<br><span class="pattern-warning">Where its listed runs start, most frequent first.</span>`
    : 'Not known. The club may change locations or not post them.';
}
function clubRacesHTML(club: Club) {
  const now = new Date();
  const hosted = races
    .filter(
      (race) =>
        race.club_ids?.includes(club.id) &&
        RunData.raceMatches(race, { ...DEFAULTS, period: 'upcoming' }, now),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return hosted.length
    ? detailRow(
        'CLUB RACES',
        `<ul>${hosted.map((race) => `<li><a href="?race=${encodeURIComponent(race.id)}">${escapeHTML(race.title)}</a> · ${escapeHTML(raceDate(race))}</li>`).join('')}</ul>`,
      )
    : '';
}
function showClub(club: Club) {
  const audit = auditByClub.get(club.id);
  const patterns = visiblePatterns(patternsByClub.get(club.id) || []);
  const upcoming = events
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
    ? `<ul>${audit.reference_source_ids.map((id) => `<li>${linkSource(id)}</li>`).join('')}</ul>`
    : 'No links found yet.';
  const research = researchNotes(audit?.notes);
  return {
    title: club.name,
    html: `<div class="detail-label">RUNNING CLUB · ${escapeHTML((club.geography || 'Area unknown').toUpperCase())}</div><h2 class="detail-title" id="detail-title">${escapeHTML(club.name)}</h2><div class="detail-sub">${upcoming.length ? `${upcoming.length} upcoming ${upcoming.length === 1 ? 'run' : 'runs'}` : 'No upcoming runs listed'}</div>${detailRow('UPCOMING RUNS', upcomingHTML)}${clubRacesHTML(club)}${detailRow('ABOUT', escapeHTML(club.description || 'No description yet.'))}${detailRow('WHERE THEY MEET', clubPlacesHTML(club))}${detailRow('REGULAR RUNS', patternHTML)}${detailRow('CLUB LINKS', references)}${detailRow('LAST CHECKED', `${escapeHTML(shortDate(audit?.checked_on))}${audit?.result === 'identity_unresolved' ? ' · We haven’t confirmed which club this is.' : ''}${research}`)}<div class="detail-actions">${permalink('club', club.id)}</div>`,
  };
}
function recordType<T extends { id: string }>(
  view: View,
  records: () => T[],
  render: (record: T) => { title: string; html: string },
) {
  const find = (id: string | null) => records().find((item) => item.id === id);
  return {
    view,
    find,
    show(id: string) {
      const record = find(id);
      return record ? render(record) : undefined;
    },
  };
}
const RECORDS = {
  event: recordType('events', () => events, showEvent),
  pattern: recordType('patterns', () => schedules, showPattern),
  club: recordType('clubs', () => clubs, showClub),
  race: recordType('races', () => races, showRace),
};
function openDetail(
  kind: string | undefined,
  id: string | null | undefined,
  pushHistory = false,
) {
  if (!kind || !id || !Object.hasOwn(RECORDS, kind)) return;
  const detail = RECORDS[kind as keyof typeof RECORDS].show(id);
  if (!detail) return;
  const { title, html } = detail;
  const dialog = $('#detail');
  $('#detail-content').innerHTML = html;
  $('.dialog-body').scrollTop = 0;
  openRecord = { kind, id };
  document.title = `${title} · ${SITE_TITLE}`;
  if (!dialog.open) dialog.showModal();
  syncURL(pushHistory);
}

function restoreURL() {
  closingDetail = false;
  const previous = openRecord;
  openRecord = null;
  // A linked record selects its own view; otherwise honour ?view=.
  const params = new URLSearchParams(location.search);
  const formerEvent = params.get('event');
  const canonicalRace =
    formerEvent &&
    races.find((race) => race.former_event_ids?.includes(formerEvent));
  if (canonicalRace) {
    params.delete('event');
    params.set('race', canonicalRace.id);
  }
  clubFilter = clubById.has(params.get('for_club') || '')
    ? params.get('for_club') || ''
    : '';
  const linked = (Object.keys(RECORDS) as (keyof typeof RECORDS)[])
    .map((kind) => ({ kind, id: params.get(kind) }))
    .find(({ kind, id }) => id && RECORDS[kind].find(id));
  const requested = params.get('view');
  configureView(
    linked
      ? RECORDS[linked.kind].view
      : requested && Object.hasOwn(VIEWS, requested)
        ? (requested as View)
        : 'events',
  );
  if (!['events', 'patterns'].includes(view)) clubFilter = '';
  applyParams(params);
  render();
  if (linked) openDetail(linked.kind, linked.id);
  else {
    document.title = SITE_TITLE;
    if ($('#detail').open) $('#detail').close();
    if (previous) restoreListingFocus(previous, { preventScroll: true });
  }
}

/* ---------- Events ---------- */

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('[data-retry]')) {
    void loadData(true);
    return;
  }
  if (!dataReady) return;
  const quick = event.target.closest<HTMLElement>('[data-quick]');
  if (quick) {
    // Each shortcut toggles one filter and keeps every other choice.
    const choice = quick.dataset.quick;
    if (choice === 'neighborhood') {
      $('#advanced-filters').open = true;
      $('#neighborhood').focus();
    } else {
      const [id, value] =
        choice === 'beginner'
          ? ['beginner', 'welcome']
          : ['period', choice || 'upcoming'];
      const control = $(`#${id}`) as HTMLSelectElement;
      control.value =
        control.value === value ? DEFAULTS[id as keyof typeof DEFAULTS] : value;
      render();
    }
    return;
  }
  const filter = event.target.closest<HTMLButtonElement>('[data-clear-filter]');
  const tab = event.target.closest<HTMLElement>('[data-view]');
  const row = event.target.closest<HTMLElement>('[data-kind]');
  if (filter) clearFilter(filter);
  else if (tab) setView(tab.dataset.view);
  else if (row) openDetail(row.dataset.kind, row.dataset.id, true);
  else if (event.target.closest('[data-reset]')) resetFilters();
  else if (event.target.closest('[data-clear-club]')) {
    clubFilter = '';
    render();
  }
});
for (const id of Object.keys(DEFAULTS) as Control[])
  $(`#${id}`).addEventListener(id === 'search' ? 'input' : 'change', render);
let closingDetail = false;
function closeDetail() {
  if (closingDetail) return;
  if (openRecord && history.state?.runIndexDetail) {
    // Keep the modal open until Back finishes, so an input made immediately
    // after dismissal cannot be overwritten by the arriving history entry.
    closingDetail = true;
    history.back();
  } else $('#detail').close();
}
$('.close').addEventListener('click', closeDetail);
$('#detail').addEventListener('cancel', (event) => {
  event.preventDefault();
  closeDetail();
});
$('#detail').addEventListener('click', (event) => {
  // The dialog element itself is only hit outside .dialog-body (the backdrop).
  if (event.target === event.currentTarget) closeDetail();
});
function restoreListingFocus(
  shown: NonNullable<typeof openRecord>,
  options: FocusOptions = {},
) {
  // Rendering results replaces the original button, so native dialog focus
  // restoration cannot find it after a history traversal.
  (
    $('#results').querySelector<HTMLElement>(
      `[data-kind="${shown.kind}"][data-id="${CSS.escape(shown.id)}"]`,
    ) || $('#section-title')
  ).focus(options);
}
$('#detail').addEventListener('close', () => {
  // Ignore close events from restoring history, including a queued event
  // after Forward has already reopened the dialog.
  if (!openRecord || $('#detail').open) return;
  // A directly opened shared link has no list entry to go back to.
  restoreListingFocus(openRecord);
  openRecord = null;
  document.title = SITE_TITLE;
  syncURL();
});
window.addEventListener('popstate', () => {
  if (dataReady) restoreURL();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)
    return;
  const active = document.activeElement;
  if (
    $('#detail').open ||
    ['INPUT', 'TEXTAREA'].includes(active?.tagName || '') ||
    (active instanceof HTMLElement && active.isContentEditable)
  )
    return;
  if (!dataReady) return;
  event.preventDefault();
  $('#search').focus();
});

/* ---------- Startup ---------- */

function showFreshness(rows: Listing[], now: Date) {
  const checked = rows.map((item) =>
    // A club's check date is its audit's; runs and races carry their own.
    'club_id' in item || 'date' in item
      ? item.checked_on
      : auditByClub.get(item.id)?.checked_on,
  );
  const { total, stale, unknown } = RunData.freshnessSummary(
    checked,
    RunData.localMinute(now).slice(0, 10),
    STALE_AFTER_DAYS,
  );
  $('#notice').classList.toggle('stale', stale > 0 || unknown > 0);
  $('#snapshot-label').textContent =
    stale || unknown ? 'CHECK DATES' : 'BEFORE YOU GO';
  const confirm =
    view === 'races'
      ? 'Registration can change quickly. Confirm with the organizer before you register.'
      : 'Plans change, so confirm with the club or organizer.';
  if (!total) {
    $('#snapshot-text').textContent = confirm;
    return;
  }
  const parts = [];
  if (stale)
    parts.push(
      `${stale} of these ${stale === 1 ? 'was' : 'were'} last checked more than ${STALE_AFTER_DAYS} days ago`,
    );
  if (unknown)
    parts.push(`${unknown} ${unknown === 1 ? 'has' : 'have'} no check date`);
  const dates = checked.filter(Boolean).sort();
  const range =
    dates[0] === dates.at(-1)
      ? shortDate(dates[0])
      : `${shortDate(dates[0])}–${shortDate(dates.at(-1))}`;
  $('#snapshot-text').textContent = parts.length
    ? `${parts.join('; ')}. ${confirm}`
    : `Checked ${range}. ${confirm}`;
}
function groupBy<T, K extends keyof T>(rows: T[], key: K) {
  const map = new Map<T[K], T[]>();
  for (const row of rows) {
    if (!map.has(row[key])) map.set(row[key], []);
    const group = map.get(row[key]) || [];
    group.push(row);
    map.set(row[key], group);
  }
  return map;
}
const directoryControls = document.querySelectorAll<
  HTMLButtonElement | HTMLInputElement | HTMLSelectElement
>('#index button, #index input, #index select');

async function loadData(retrying = false) {
  if (loading) return;
  loading = true;
  dataReady = false;
  for (const control of directoryControls) control.disabled = true;
  $('#results').setAttribute('aria-busy', 'true');
  $('#results').innerHTML = '<p class="empty">Loading listings…</p>';
  $('#result-count').textContent = 'LOADING…';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const data = await Promise.all(
      ['clubs', 'events', 'schedules', 'sources', 'audits', 'races'].map(
        (name) =>
          fetch(`data/${name}.json`, {
            cache: 'no-cache',
            signal: controller.signal,
          }).then(async (response) => {
            if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
            const records: unknown = await response.json();
            if (!Array.isArray(records))
              throw Error(`${name}: expected listings`);
            return records;
          }),
      ),
    );
    [clubs, events, schedules, sources, audits, races] = data as [
      Club[],
      DatedEvent[],
      Schedule[],
      Source[],
      Audit[],
      Race[],
    ];
    clubById = new Map(clubs.map((club) => [club.id, club]));
    sourceById = new Map(sources.map((source) => [source.id, source]));
    auditByClub = new Map(audits.map((audit) => [audit.club_id, audit]));
    patternsByClub = groupBy(schedules, 'club_id');
    const now = new Date();
    placesByClub = new Map(
      clubs.map((club) => [
        club.id,
        RunData.clubPlaces(club.id, schedules, events, now),
      ]),
    );
    upcomingByClub = new Map(
      [
        ...groupBy(
          events.filter((event) => RunData.eventMatches(event, DEFAULTS, now)),
          'club_id',
        ),
      ].map(([id, items]) => [id, items.length]),
    );
    const upcomingEvents = events.filter((event) =>
      RunData.eventMatches(event, DEFAULTS, now),
    ).length;
    const upcomingRaces = races.filter((race) =>
      RunData.raceMatches(race, DEFAULTS, now),
    ).length;
    $('#count-clubs').textContent = String(clubs.length);
    $('#count-events').textContent = String(upcomingEvents);
    $('#count-races').textContent = String(upcomingRaces);
    $('#event-total').textContent = String(upcomingEvents);
    $('#pattern-total').textContent = String(
      visiblePatterns(schedules, now).length,
    );
    $('#club-total').textContent = String(clubs.length);
    $('#race-total').textContent = String(upcomingRaces);

    dataReady = true;
    for (const control of directoryControls) control.disabled = false;
    restoreURL();
    if (!openRecord && retrying) $('#section-title').focus();
  } catch (error) {
    dataReady = false;
    for (const control of directoryControls) control.disabled = true;
    controller.abort();
    console.error(error);
    $('#results').innerHTML =
      '<div class="error"><p>Could not load the listings. Check your connection and try again.</p><button type="button" class="reset" data-retry>Try again</button></div>';
    $('#result-count').textContent = 'DATA UNAVAILABLE';
    if (retrying) $('[data-retry]').focus();
  } finally {
    window.clearTimeout(timeout);
    loading = false;
    $('#results').setAttribute('aria-busy', 'false');
  }
}
void loadData();
