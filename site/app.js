const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  );
const shorten = (value, max = 100) =>
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
const PAGE_SIZE = 25;
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
  run_area: 'all',
  neighborhood: 'all',
  run_distance: 'all',
  beginner: 'all',
};
const PARAM_NAMES = { search: 'q' };
const VIEWS = {
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
    note: 'Races and organized runs. Register and confirm details with the organizer.',
    context: 'BY DATE · SAN FRANCISCO TIME',
    controls: ['period', 'month', 'day', 'time', 'area', 'distance', 'format'],
  },
};
const SELECTS = Object.keys(DEFAULTS).filter((id) => id !== 'search');

let clubs = [],
  events = [],
  schedules = [],
  sources = [],
  audits = [],
  races = [];
let clubById = new Map(),
  sourceById = new Map(),
  auditByClub = new Map(),
  patternsByClub = new Map(),
  placesByClub = new Map(),
  upcomingByClub = new Map();
let view = 'events',
  limit = PAGE_SIZE,
  openRecord = null,
  clubFilter = '';

const showDays = (values) =>
  values.map((day) => day.slice(0, 3).toUpperCase()).join(' / ');
const clubName = (id) => clubById.get(id)?.name || id;
function timeLabel(time) {
  if (!time) return 'Time unknown';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function dateInfo(localDate, options = {}) {
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
function monthLabel(month) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
const external = (url, label = url) =>
  `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}</a>`;
/* A check date as "Nov 8", with the year when it is not this year. */
function shortDate(isoDate) {
  if (!isoDate) return 'date unknown';
  const thisYear = RunData.localMinute(new Date()).slice(0, 4);
  return dateInfo(isoDate, {
    weekday: undefined,
    year: isoDate.startsWith(thisYear) ? undefined : 'numeric',
  });
}
/* "strava.com" for https://www.strava.com/clubs/…, for link text. */
function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
const SOURCE_KINDS = {
  club: 'club page',
  host: 'host page',
  secondary: 'directory',
};
const SOURCE_ACCESS = {
  restricted: 'limited access',
  login_for_events: 'sign-in needed',
};
function linkSource(id) {
  const source = sourceById.get(id);
  if (!source) return '';
  const facts = [
    SOURCE_KINDS[source.authority],
    SOURCE_ACCESS[source.access],
    source.last_checked
      ? `checked ${shortDate(source.last_checked)}`
      : 'not checked yet',
  ].filter(Boolean);
  return `${external(source.url, `${siteName(source.url)} ↗`)} <span class="pattern-warning">${escapeHTML(facts.join(' · '))}</span>`;
}
function detailRow(label, contents) {
  return `<div class="detail-row"><strong>${escapeHTML(label)}</strong>${contents}</div>`;
}
const permalink = (kind, id) =>
  `<a class="permalink" href="?${kind}=${encodeURIComponent(id)}">DIRECT LINK ↗</a>`;
const rowButton = (kind, id, className, contents) =>
  `<button type="button" class="${className}" data-kind="${kind}" data-id="${escapeHTML(id)}" aria-haspopup="dialog">${contents}<span class="row-action" aria-hidden="true">DETAILS ↗</span></button>`;
function practicalSummary(item) {
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
function practicalDetails(item) {
  const details = item.run_details || {};
  const yesNo = (value, yes, no) =>
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
  ].filter(([, value]) => value);
  if (!lines.length) return '';
  const references = details.sources?.length
    ? `<br><span class="pattern-warning">Checked ${escapeHTML(shortDate(details.checked_on))} on ${details.sources.map((url) => external(url, siteName(url))).join(', ')}</span>`
    : '';
  return detailRow(
    'RUN DETAILS',
    `<ul>${lines.map(([label, value]) => `<li><b>${escapeHTML(label)}:</b> ${escapeHTML(value)}</li>`).join('')}</ul>${references}`,
  );
}
function meetingPlace(item) {
  const query = item.location_info?.directions_query;
  const link = query
    ? `<br>${external(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, 'Directions ↗')}`
    : '';
  return `${escapeHTML(item.location)}${link}`;
}

/* ---------- Filters and URL state ---------- */

function controlValue(id) {
  return id === 'search' ? $('#search').value.trim() : $(`#${id}`).value;
}
function activeControls() {
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
function syncURL() {
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
  if (next !== `${location.pathname}${location.search}${location.hash}`)
    history.replaceState(null, '', next);
}
/* The URL is the only source of filter state; ignore browser form restoration. */
function applyParams(params) {
  $('#search').value = params.get(PARAM_NAMES.search) || DEFAULTS.search;
  for (const id of SELECTS) {
    const value = params.get(id);
    const select = $(`#${id}`);
    const valid = [...select.options].some(
      (option) => option.value === value && !option.disabled,
    );
    select.value = valid ? value : DEFAULTS[id];
  }
  $('#advanced-filters').open = advancedFiltersChanged() > 0;
}
function resetFilters() {
  clubFilter = '';
  $('#search').value = DEFAULTS.search;
  for (const id of SELECTS) $(`#${id}`).value = DEFAULTS[id];
  $('#advanced-filters').open = false;
  limit = PAGE_SIZE;
  render();
}
const clubNeighborhoods = (club) =>
  placesByClub.get(club.id)?.neighborhoods || [];
const runNeighborhoods = (run) =>
  run.location_info?.neighborhood ? [run.location_info.neighborhood] : [];
/* Neighborhood options, grouped by area. With ``counts`` (from
   neighborhoodCounts) each option shows how many rows it would match and
   options with none are left out, except the current choice. Without
   counts every neighborhood used by the view is listed, so a URL value can
   be applied before the first render. */
function populateNeighborhoods(counts = null) {
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
  const label = (name, text = name) =>
    counts ? `${text} (${counts.get(name) || 0})` : text;
  const listed = (name) => !counts || counts.get(name) > 0 || name === current;
  const group = (area, heading) => {
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
    ...group('sf', 'San Francisco'),
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
  const counts = new Map();
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
function configureView(next) {
  view = next;
  limit = PAGE_SIZE;
  const meta = VIEWS[view];
  for (const button of document.querySelectorAll('[data-view]')) {
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
function setView(next) {
  if (!['events', 'patterns'].includes(next)) clubFilter = '';
  configureView(next);
  render();
}

/* ---------- Rows ---------- */

function eventRow(event) {
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
  const uncertain =
    event.status === 'unconfirmed'
      ? '<span class="tag uncertain">UNCONFIRMED</span> '
      : '';
  return rowButton(
    'event',
    event.id,
    'row',
    `<span class="row-date">${escapeHTML(dateInfo(event.starts_at_local))}<span>${escapeHTML(timeLabel(start.local_time))}${otherStarts.length ? ' + more' : ''}</span></span><span class="row-title">${escapeHTML(event.title)}<small>${escapeHTML(clubName(event.club_id))}</small></span><span class="row-place">${escapeHTML(start.location)}<small>${neighborhood ? `${escapeHTML(neighborhood)} · ` : ''}Checked ${escapeHTML(shortDate(event.checked_on))}</small></span><span class="row-note">${uncertain}${escapeHTML(shorten(practicalSummary(event), 150))}</span>`,
  );
}
function patternDates(pattern) {
  if (pattern.valid_from && pattern.valid_until)
    return `${dateInfo(pattern.valid_from)} – ${dateInfo(pattern.valid_until)}`;
  if (pattern.valid_from) return `From ${dateInfo(pattern.valid_from)}`;
  if (pattern.valid_until) return `Through ${dateInfo(pattern.valid_until)}`;
  return '';
}
/* A short tag for a regular run, or '' for an ordinary current schedule. */
function patternStatus(pattern, now = new Date()) {
  const state = RunData.patternState(pattern, now);
  const review = pattern.status === 'needs_review';
  if (state === 'future')
    return review ? 'SEASONAL · CHECK SCHEDULE' : 'SEASONAL';
  if (state === 'expired') return 'ENDED';
  if (state === 'superseded') return 'REPLACED';
  return review ? 'CHECK SCHEDULE' : '';
}
function visiblePatterns(items, now = new Date()) {
  return items.filter((item) =>
    RunData.patternMatches(item, { day: 'all', time: 'all' }, now),
  );
}
function patternRow(pattern) {
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
    `<span class="row-date">${escapeHTML(showDays(pattern.days))}<span>${escapeHTML(timeLabel(pattern.local_time))}</span></span><span class="row-title">${escapeHTML(pattern.label)}<small>${escapeHTML(clubName(pattern.club_id))} · ${escapeHTML(pattern.frequency)}</small></span><span class="row-place">${escapeHTML(pattern.location)}<small>${escapeHTML(evidence)} · checked ${escapeHTML(shortDate(pattern.checked_on))}</small></span><span class="row-note">${label ? `<span class="tag${review ? ' uncertain' : ''}">${label}</span> ` : ''}${patternDates(pattern) ? `<span>${escapeHTML(patternDates(pattern))}</span> ` : ''}${escapeHTML(shorten(practicalSummary(pattern), 150))}</span>`,
  );
}
/* What a visitor can expect from a club right now. */
function clubStatus(audit, patterns, upcomingCount) {
  if (audit?.result === 'identity_unresolved') return 'UNVERIFIED';
  if (upcomingCount) return 'UPCOMING RUNS';
  if (patterns.length) return 'REGULAR RUNS';
  return 'NO SCHEDULE FOUND';
}
/* The first two neighborhoods, then a count of the rest. */
function placeSummary(names = []) {
  return names.length > 2
    ? `${names.slice(0, 2).join(' · ')} +${names.length - 2}`
    : names.join(' · ');
}
function clubRow(club) {
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
function raceDate(race) {
  return race.end_date
    ? `${dateInfo(race.date)} – ${dateInfo(race.end_date)}`
    : dateInfo(race.date);
}
function raceRow(race) {
  const distance = $('#distance').value;
  const time = $('#time').value;
  const matching = race.distances.filter(
    (item) =>
      (distance === 'all' || item.category === distance) &&
      RunData.timeMatches(item.start_time, time),
  );
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
  const format =
    race.format === 'small_group'
      ? '<span class="tag">SMALL GROUP</span> '
      : '';
  return rowButton(
    'race',
    race.id,
    'row',
    `<span class="row-date">${escapeHTML(raceDate(race))}<span>${escapeHTML(startLabel)}</span></span><span class="row-title">${escapeHTML(race.title)}<small>${escapeHTML(race.city)}</small></span><span class="row-place">${escapeHTML(race.location)}<small>Checked ${escapeHTML(shortDate(race.checked_on))}</small></span><span class="row-note">${review}${format}${escapeHTML(race.distances.map((item) => item.name).join(' · '))}</span>`,
  );
}
const tableHead = (labels, className = 'table-head') =>
  `<div class="${className}" aria-hidden="true">${labels.map((label) => `<span>${label}</span>`).join('')}<span></span></div>`;
const matchesQuery = (query, ...fields) =>
  !query || fields.join(' ').toLowerCase().includes(query);
function matchesRunFilters(item, filter) {
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

function currentRows(overrides = {}) {
  const query = $('#search').value.trim().toLowerCase();
  const filter = {
    ...Object.fromEntries(SELECTS.map((id) => [id, controlValue(id)])),
    ...overrides,
  };
  const now = new Date();
  if (view === 'events')
    return events
      .filter(
        (event) =>
          RunData.eventMatches(event, filter, now) &&
          (!clubFilter || event.club_id === clubFilter) &&
          matchesRunFilters(event, filter) &&
          matchesQuery(
            query,
            event.title,
            event.location,
            event.notes || '',
            clubName(event.club_id),
            ...(event.meeting_options || []).map((option) => option.location),
          ),
      )
      .sort((a, b) => {
        const start = (item) =>
          `${item.starts_at_local.slice(0, 10)}T${RunData.matchingEventStarts(item, filter, now)[0].local_time}`;
        return start(a).localeCompare(start(b));
      });
  if (view === 'races')
    return races
      .filter(
        (race) =>
          RunData.raceMatches(race, filter, now) &&
          matchesQuery(
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
          matchesQuery(
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
      matchesQuery(
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
    head: ['DATE / TIME', 'RACE / CITY', 'START AREA', 'DISTANCES'],
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
  $('#reset-filters').hidden = !filtersChanged();
  const advancedCount = advancedFiltersChanged();
  $('#filter-summary').textContent = advancedCount
    ? ` · ${advancedCount} active`
    : '';
  if (VIEWS[view].controls.includes('neighborhood'))
    populateNeighborhoods(neighborhoodCounts());
  const rows = currentRows();
  const layout = LAYOUT[view];
  const shown = Math.min(rows.length, limit);
  let html =
    tableHead(layout.head, layout.headClass) +
    rows.slice(0, limit).map(layout.row).join('');
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
  $('#result-count').textContent =
    `${rows.length} ${layout.kind[rows.length === 1 ? 0 : 1]}`;
  $('#page-label').textContent = rows.length
    ? `SHOWING ${shown} OF ${rows.length}`
    : '';
  $('#more').hidden = rows.length <= limit;
  $('#club-filter').hidden = !clubFilter;
  $('#club-filter').innerHTML = clubFilter
    ? `Showing runs for <strong>${escapeHTML(clubName(clubFilter))}</strong> · <button type="button" class="clear-club" data-clear-club>Show all clubs</button>`
    : '';
  showFreshness(rows, new Date());
  syncURL();
}

/* ---------- Detail dialog ---------- */

function statusWarning(status) {
  if (!['cancelled', 'postponed'].includes(status)) return '';
  return `<p class="status-warning" role="status"><strong>${status.toUpperCase()}</strong> · Previously listed details are shown for reference. Check the organizer for updates before making plans.</p>`;
}

function showRace(race) {
  const distances = race.distances
    .map(
      (item) =>
        `<li><b>${escapeHTML(item.name)}</b> · ${escapeHTML(timeLabel(item.start_time))}${item.location ? ` · ${escapeHTML(item.location)}` : ''}</li>`,
    )
    .join('');
  const urls = [race.source_url, ...race.additional_sources];
  const repeated = (url) =>
    urls.filter((other) => siteName(other) === siteName(url)).length > 1;
  /* Show the page path when one site has several links. */
  const linkText = (url) => {
    if (!repeated(url)) return siteName(url);
    const path = new URL(url).pathname.replace(/\/$/, '');
    return `${siteName(url)}${path.length > 30 ? `${path.slice(0, 30)}…` : path}`;
  };
  const links = urls
    .map((url) => `<li>${external(url, `${linkText(url)} ↗`)}</li>`)
    .join('');
  return {
    title: race.title,
    html: `<div class="detail-label">${race.needs_review ? 'CHECK DETAILS · ' : ''}${race.status === 'scheduled' ? 'RACE' : race.status.toUpperCase()} · CHECKED ${escapeHTML(shortDate(race.checked_on).toUpperCase())}</div>${statusWarning(race.status)}<h2 class="detail-title" id="detail-title">${escapeHTML(race.title)}</h2><div class="detail-sub">${escapeHTML(race.area === 'sf' && race.city === 'San Francisco' ? race.city : `${race.city} · ${race.area === 'sf' ? 'San Francisco' : 'Bay Area'}`)}</div>${detailRow('DATE', escapeHTML(raceDate(race)))}${detailRow('START AREA', escapeHTML(race.location))}${detailRow('DISTANCES & START TIMES · PACIFIC TIME', `<ul>${distances}</ul>`)}${detailRow('NOTES', escapeHTML(race.notes || 'Check the organizer for registration, course and current details.'))}${detailRow('ORGANIZER LINKS', `<ul>${links}</ul><span class="pattern-warning">Details can change. Confirm with the organizer before you register.</span>`)}<div class="detail-actions"><a class="detail-link" href="${escapeHTML(race.source_url)}" target="_blank" rel="noopener noreferrer">OPEN RACE PAGE ↗</a>${permalink('race', race.id)}</div>`,
  };
}
function showEvent(event) {
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
    ? `<a class="detail-link" href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">OPEN EVENT PAGE ↗</a>`
    : '';
  return {
    title: event.title,
    html: `<div class="detail-label">${{ published: 'GROUP RUN', unconfirmed: 'UNCONFIRMED RUN', cancelled: 'CANCELLED', postponed: 'POSTPONED' }[event.status]} · CHECKED ${escapeHTML(shortDate(event.checked_on).toUpperCase())}</div>${statusWarning(event.status)}<h2 class="detail-title" id="detail-title">${escapeHTML(event.title)}</h2><div class="detail-sub"><a href="?club=${encodeURIComponent(event.club_id)}">${escapeHTML(clubName(event.club_id))} ↗</a></div>${detailRow('DATE & TIME', `${escapeHTML(dateInfo(event.starts_at_local))} · ${escapeHTML(timeLabel(event.starts_at_local.slice(11, 16)))} · San Francisco time`)}${detailRow('MEETING PLACE', meetingPlace(event))}${options}${practicalDetails(event)}${detailRow('NOTES', escapeHTML(event.notes || 'Check the event page for route, pace and other details.'))}${detailRow('WHERE WE FOUND IT', `${linkSource(event.source_id)}<br><span class="pattern-warning">Plans can change. Check the event page before you go.</span>`)}${extras}<div class="detail-actions">${sourceLink}${permalink('event', event.id)}</div>`,
  };
}
function showPattern(pattern) {
  const dateBounds = patternDates(pattern)
    ? ` · ${escapeHTML(patternDates(pattern))}`
    : '';
  const status = patternStatus(pattern);
  return {
    title: pattern.label,
    html: `<div class="detail-label">REGULAR RUN${status ? ` · ${status}` : ''} · CHECKED ${escapeHTML(shortDate(pattern.checked_on).toUpperCase())}</div><h2 class="detail-title" id="detail-title">${escapeHTML(pattern.label)}</h2><div class="detail-sub"><a href="?club=${encodeURIComponent(pattern.club_id)}">${escapeHTML(clubName(pattern.club_id))} ↗</a></div>${detailRow('SCHEDULE', `${escapeHTML(showDays(pattern.days))} · ${escapeHTML(timeLabel(pattern.local_time))} · ${escapeHTML(pattern.frequency)}${dateBounds}`)}${detailRow('MEETING PLACE', meetingPlace(pattern))}${practicalDetails(pattern)}${detailRow('NOTES', escapeHTML(pattern.notes || 'Check the club’s page for details.'))}${detailRow('WHERE WE FOUND IT', `${linkSource(pattern.source_id)}<br><span class="pattern-warning">A regular run can be skipped or moved. Check with the club before you go.</span>`)}<div class="detail-actions">${permalink('pattern', pattern.id)}</div>`,
  };
}
function clubPlacesHTML(club) {
  const names = clubNeighborhoods(club);
  return names.length
    ? `${escapeHTML(names.join(' · '))}<br><span class="pattern-warning">Where its listed runs start, most frequent first.</span>`
    : 'Not known. The club may change locations or not post them.';
}
function showClub(club) {
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
        )}</ul><a href="?view=events&amp;for_club=${encodeURIComponent(club.id)}">View all ${upcoming.length} upcoming runs ↗</a>`
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
  const research = audit?.notes
    ? `<details class="detail-more"><summary>Research notes</summary><p>${escapeHTML(audit.notes)}</p></details>`
    : '';
  return {
    title: club.name,
    html: `<div class="detail-label">RUNNING CLUB · ${escapeHTML((club.geography || 'Area unknown').toUpperCase())}</div><h2 class="detail-title" id="detail-title">${escapeHTML(club.name)}</h2><div class="detail-sub">${upcoming.length ? `${upcoming.length} upcoming ${upcoming.length === 1 ? 'run' : 'runs'}` : 'No upcoming runs listed'}</div>${detailRow('UPCOMING RUNS', upcomingHTML)}${detailRow('ABOUT', escapeHTML(club.description || 'No description yet.'))}${detailRow('WHERE THEY MEET', clubPlacesHTML(club))}${detailRow('REGULAR RUNS', patternHTML)}${detailRow('CLUB LINKS', references)}${detailRow('LAST CHECKED', `${escapeHTML(shortDate(audit?.checked_on || club.checked_on))}${research}`)}<div class="detail-actions">${permalink('club', club.id)}</div>`,
  };
}
const RECORDS = {
  event: {
    view: 'events',
    find: (id) => events.find((item) => item.id === id),
    show: showEvent,
  },
  pattern: {
    view: 'patterns',
    find: (id) => schedules.find((item) => item.id === id),
    show: showPattern,
  },
  club: { view: 'clubs', find: (id) => clubById.get(id), show: showClub },
  race: {
    view: 'races',
    find: (id) => races.find((item) => item.id === id),
    show: showRace,
  },
};
function openDetail(kind, id) {
  const record = RECORDS[kind]?.find(id);
  if (!record) return;
  const { title, html } = RECORDS[kind].show(record);
  const dialog = $('#detail');
  $('#detail-content').innerHTML = html;
  $('.dialog-body').scrollTop = 0;
  openRecord = { kind, id };
  document.title = `${title} · ${SITE_TITLE}`;
  if (!dialog.open) dialog.showModal();
  syncURL();
}

/* ---------- Events ---------- */

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-view]');
  const row = event.target.closest('[data-kind]');
  if (tab) setView(tab.dataset.view);
  else if (row) openDetail(row.dataset.kind, row.dataset.id);
  else if (event.target.closest('[data-reset]')) resetFilters();
  else if (event.target.closest('[data-clear-club]')) {
    clubFilter = '';
    render();
  }
});
for (const id of Object.keys(DEFAULTS))
  $(`#${id}`).addEventListener(id === 'search' ? 'input' : 'change', () => {
    limit = PAGE_SIZE;
    render();
  });
$('#more').addEventListener('click', () => {
  const first = limit;
  limit += PAGE_SIZE;
  render();
  // Keep keyboard users at the start of the newly loaded rows.
  $('#results').querySelectorAll('[data-kind]')[first]?.focus({
    preventScroll: true,
  });
});
$('.close').addEventListener('click', () => $('#detail').close());
$('#detail').addEventListener('click', (event) => {
  // The dialog element itself is only hit outside .dialog-body (the backdrop).
  if (event.target === event.currentTarget) event.currentTarget.close();
});
$('#detail').addEventListener('close', () => {
  openRecord = null;
  document.title = SITE_TITLE;
  syncURL();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)
    return;
  const active = document.activeElement;
  if (
    $('#detail').open ||
    ['INPUT', 'TEXTAREA'].includes(active?.tagName) ||
    active?.isContentEditable
  )
    return;
  event.preventDefault();
  $('#search').focus();
});

/* ---------- Startup ---------- */

function showFreshness(rows, now) {
  const checked = rows.map((item) =>
    view === 'clubs'
      ? auditByClub.get(item.id)?.checked_on || item.checked_on
      : item.checked_on,
  );
  const { total, stale, unknown } = RunData.freshnessSummary(
    checked,
    RunData.localMinute(now).slice(0, 10),
    STALE_AFTER_DAYS,
  );
  $('#notice').classList.toggle('stale', stale > 0 || unknown > 0);
  $('#snapshot-label').textContent =
    stale || unknown ? 'CHECK DATES' : 'BEFORE YOU GO';
  const confirm = 'Plans change, so confirm with the club or organizer.';
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
  $('#snapshot-text').textContent = parts.length
    ? `${parts.join('; ')}. ${confirm}`
    : `Everything here was checked in the last ${STALE_AFTER_DAYS} days. ${confirm}`;
}
function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row[key])) map.set(row[key], []);
    map.get(row[key]).push(row);
  }
  return map;
}
Promise.all(
  ['clubs', 'events', 'schedules', 'sources', 'audits', 'races'].map((name) =>
    fetch(`data/${name}.json`, { cache: 'no-cache' }).then((response) => {
      if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
      return response.json();
    }),
  ),
)
  .then((data) => {
    [clubs, events, schedules, sources, audits, races] = data;
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
    upcomingByClub = groupBy(
      events.filter((event) => RunData.eventMatches(event, DEFAULTS, now)),
      'club_id',
    );
    upcomingByClub = new Map(
      [...upcomingByClub].map(([id, items]) => [id, items.length]),
    );
    const upcomingEvents = events.filter((event) =>
      RunData.eventMatches(event, DEFAULTS, now),
    ).length;
    const upcomingRaces = races.filter((race) =>
      RunData.raceMatches(race, DEFAULTS, now),
    ).length;
    $('#count-clubs').textContent = clubs.length;
    $('#count-events').textContent = upcomingEvents;
    $('#count-races').textContent = upcomingRaces;
    $('#event-total').textContent = upcomingEvents;
    $('#pattern-total').textContent = visiblePatterns(schedules, now).length;
    $('#club-total').textContent = clubs.length;
    $('#race-total').textContent = upcomingRaces;

    // A linked record selects its own view; otherwise honour ?view=.
    const params = new URLSearchParams(location.search);
    clubFilter = clubById.has(params.get('for_club'))
      ? params.get('for_club')
      : '';
    const linked = Object.keys(RECORDS)
      .map((kind) => ({ kind, id: params.get(kind) }))
      .find(({ kind, id }) => id && RECORDS[kind].find(id));
    const requested = params.get('view');
    configureView(
      linked
        ? RECORDS[linked.kind].view
        : Object.hasOwn(VIEWS, requested)
          ? requested
          : 'events',
    );
    if (!['events', 'patterns'].includes(view)) clubFilter = '';
    applyParams(params);
    render();
    if (linked) openDetail(linked.kind, linked.id);
  })
  .catch((error) => {
    console.error(error);
    $('#results').innerHTML =
      '<p class="error">Could not load the research data. Please try reloading this page.</p>';
    $('#result-count').textContent = 'DATA UNAVAILABLE';
  });
