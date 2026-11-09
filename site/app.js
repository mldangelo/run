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
    title: 'Dated runs',
    note: 'Published dated listings are a research snapshot. Filters use sourced details; unknown details are excluded from specific matches. Times are San Francisco time.',
    context: 'DATED LISTINGS · VERIFY WITH THE SOURCE',
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
    note: 'Recurring schedules are leads, not confirmation of a particular date. Filters use sourced details; unknown details are excluded from specific matches.',
    context: 'RECURRING PATTERNS · VERIFY BEFORE GOING',
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
    note: 'Explore clubs and their recorded runs. A missing run is a research gap, not evidence the club is inactive.',
    context: 'PATTERNS ARE LEADS · CHECK WITH THE CLUB',
    controls: ['area'],
  },
  races: {
    number: '04',
    title: 'Races on the calendar',
    note: 'Today & future includes all races on today’s date, even after a listed start; later waves and finish times may not be recorded. Some small-group registrations may share a gathering. Check the organizer.',
    context: 'RACE LISTINGS · VERIFY WITH THE ORGANIZER',
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
function linkSource(id) {
  const source = sourceById.get(id);
  if (!source) return '';
  const check = source.last_checked
    ? ` · checked ${escapeHTML(source.last_checked)}`
    : ' · not checked';
  return `${external(source.url)} <span class="pattern-warning">(${escapeHTML(source.authority)} source · ${escapeHTML(source.access.replaceAll('_', ' '))}${check})</span>`;
}
function detailRow(label, contents) {
  return `<div class="detail-row"><strong>${escapeHTML(label)}</strong>${contents}</div>`;
}
const permalink = (kind, id) =>
  `<a class="permalink" href="?${kind}=${encodeURIComponent(id)}">PERMALINK ↗</a>`;
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
function practicalDetails(item) {
  const details = item.run_details || {};
  const yesNo = (value, yes, no) =>
    value === true ? yes : value === false ? no : 'Not listed';
  const lines = [
    [
      'Distance',
      details.distances?.map((option) => option.label).join(' / ') ||
        'Not listed',
    ],
    ['Pace', details.pace || 'Not listed'],
    [
      'Beginners',
      yesNo(details.beginner_friendly, 'Welcome', 'Not beginner-friendly'),
    ],
    ['No-drop', yesNo(details.no_drop, 'Yes', 'No')],
    ['Cost', details.cost || 'Not listed'],
    ['RSVP', details.rsvp || 'Not listed'],
    ['Access', details.access || 'Not listed'],
  ];
  const references = details.sources?.length
    ? `<br><span class="pattern-warning">Run details checked ${escapeHTML(details.checked_on || 'date unknown')} · ${details.sources.map((url, i) => external(url, `Source ${i + 1}`)).join(' · ')}</span>`
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
}
function resetFilters() {
  clubFilter = '';
  $('#search').value = DEFAULTS.search;
  for (const id of SELECTS) $(`#${id}`).value = DEFAULTS[id];
  limit = PAGE_SIZE;
  render();
}
function populateNeighborhoods() {
  const select = $('#neighborhood');
  const current = select.value;
  const items = view === 'events' ? events : schedules;
  const names = [
    ...new Set(
      items.map((item) => item.location_info?.neighborhood).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  select.replaceChildren(
    new Option('All', 'all'),
    new Option('Unknown', 'unknown'),
    ...names.map((name) => new Option(name, name)),
  );
  select.value =
    names.includes(current) || current === 'unknown' ? current : 'all';
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
    new Option('All dates', 'all'),
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
  $('#period option[value="upcoming"]').textContent =
    view === 'races' ? 'Today & future' : 'Upcoming';
  $('#period option[value="past"]').textContent =
    view === 'races' ? 'Past dates' : 'Past';
  if (meta.controls.includes('month')) populateMonths();
  if (meta.controls.includes('neighborhood')) populateNeighborhoods();
}
function setView(next) {
  if (!['events', 'patterns'].includes(next)) clubFilter = '';
  configureView(next);
  render();
}

/* ---------- Rows ---------- */

function eventRow(event) {
  const uncertain =
    event.status === 'unconfirmed'
      ? '<span class="tag uncertain">UNCONFIRMED</span> '
      : '';
  return rowButton(
    'event',
    event.id,
    'row',
    `<span class="row-date">${escapeHTML(dateInfo(event.starts_at_local))}<span>${escapeHTML(timeLabel(event.starts_at_local.slice(11, 16)))}</span></span><span class="row-title">${escapeHTML(event.title)}<small>${escapeHTML(clubName(event.club_id))}</small></span><span class="row-place">${escapeHTML(event.location)}<small>${event.location_info?.neighborhood ? `${escapeHTML(event.location_info.neighborhood)} · ` : ''}Checked ${escapeHTML(event.checked_on)}</small></span><span class="row-note">${uncertain}${escapeHTML(shorten([practicalSummary(event), event.notes].filter(Boolean).join(' · ') || 'Run details not listed.', 150))}</span>`,
  );
}
function patternDates(pattern) {
  if (pattern.valid_from && pattern.valid_until)
    return `${dateInfo(pattern.valid_from)} – ${dateInfo(pattern.valid_until)}`;
  if (pattern.valid_from) return `From ${dateInfo(pattern.valid_from)}`;
  if (pattern.valid_until) return `Through ${dateInfo(pattern.valid_until)}`;
  return '';
}
function patternStatus(pattern, now = new Date()) {
  const state = RunData.patternState(pattern, now);
  if (state === 'future')
    return pattern.status === 'needs_review'
      ? 'FUTURE SEASON · NEEDS REVIEW'
      : 'FUTURE SEASON';
  if (state === 'expired') return 'EXPIRED';
  if (state === 'superseded') return 'SUPERSEDED';
  return pattern.status === 'needs_review' ? 'NEEDS REVIEW' : 'RECURRING LEAD';
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
      ? 'Club source'
      : 'Directory source';
  return rowButton(
    'pattern',
    pattern.id,
    'row',
    `<span class="row-date">${escapeHTML(showDays(pattern.days))}<span>${escapeHTML(timeLabel(pattern.local_time))}</span></span><span class="row-title">${escapeHTML(pattern.label)}<small>${escapeHTML(clubName(pattern.club_id))} · ${escapeHTML(pattern.frequency)}</small></span><span class="row-place">${escapeHTML(pattern.location)}<small>${escapeHTML(evidence)} · checked ${escapeHTML(pattern.checked_on)}</small></span><span class="row-note"><span class="tag${review ? ' uncertain' : ''}">${label}</span> ${patternDates(pattern) ? `<span>${escapeHTML(patternDates(pattern))}</span> ` : ''}${escapeHTML(shorten([practicalSummary(pattern), pattern.notes].filter(Boolean).join(' · '), 150))}</span>`,
  );
}
const AUDIT_LABELS = {
  identity_unresolved: 'IDENTITY UNRESOLVED',
  dated_event_found: 'DATED EVENT FOUND',
  pattern_found: 'PATTERN FOUND',
  no_current_details: 'NO CURRENT DETAILS',
};
function clubRow(club) {
  const audit = auditByClub.get(club.id);
  const patterns = visiblePatterns(patternsByClub.get(club.id) || []);
  const pattern = patterns.length
    ? patterns
        .slice(0, 2)
        .map(
          (item) =>
            `${showDays(item.days)}${item.local_time ? ` ${timeLabel(item.local_time)}` : ''}${RunData.patternState(item, new Date()) === 'future' ? ` (from ${item.valid_from})` : item.valid_until ? ` (through ${item.valid_until})` : ''}${item.status === 'needs_review' ? ' (review)' : ''}`,
        )
        .join(' · ')
    : 'No current schedule recorded';
  const status = AUDIT_LABELS[audit?.result] || 'NEEDS RESEARCH';
  const uncertain = audit?.result === 'identity_unresolved' ? ' uncertain' : '';
  const upcomingCount = upcomingByClub.get(club.id) || 0;
  return rowButton(
    'club',
    club.id,
    'row club-row',
    `<span class="row-title">${escapeHTML(club.name)}<small>${escapeHTML(club.geography || 'Unknown area')} · ${upcomingCount ? `${upcomingCount} upcoming ${upcomingCount === 1 ? 'run' : 'runs'}` : 'No upcoming run recorded'}</small></span><span class="row-place">${escapeHTML(pattern)}${patterns.length ? '<small>Recurring pattern · verify</small>' : ''}</span><span class="row-note">${escapeHTML(shorten(club.description || audit?.notes || 'Details need further research.', 115))}</span><span class="row-status"><span class="tag${uncertain}">${status}</span></span>`,
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
    ? '<span class="tag uncertain">VERIFY DETAILS</span> '
    : '';
  const format =
    race.format === 'small_group'
      ? '<span class="tag">SMALL GROUP</span> '
      : '';
  return rowButton(
    'race',
    race.id,
    'row',
    `<span class="row-date">${escapeHTML(raceDate(race))}<span>${escapeHTML(startLabel)}</span></span><span class="row-title">${escapeHTML(race.title)}<small>${escapeHTML(race.city)}</small></span><span class="row-place">${escapeHTML(race.location)}<small>Checked ${escapeHTML(race.checked_on)}</small></span><span class="row-note">${review}${format}${escapeHTML(race.distances.map((item) => item.name).join(' · '))}</span>`,
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

function currentRows() {
  const query = $('#search').value.trim().toLowerCase();
  const filter = Object.fromEntries(
    SELECTS.map((id) => [id, controlValue(id)]),
  );
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
      .sort((a, b) => a.starts_at_local.localeCompare(b.starts_at_local));
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
      RunData.clubMatches(club, filter) &&
      matchesQuery(query, club.name, club.geography, club.description),
  );
}
const LAYOUT = {
  events: {
    head: ['DATE / TIME', 'RUN / CLUB', 'MEETING PLACE', 'DETAILS / STATUS'],
    row: eventRow,
    kind: 'DATED LISTINGS',
  },
  races: {
    head: ['DATE / TIME', 'RACE / CITY', 'START AREA', 'DISTANCES'],
    row: raceRow,
    kind: 'RACE LISTINGS',
  },
  patterns: {
    head: ['DAY / TIME', 'RUN / CLUB', 'MEETING PLACE', 'EVIDENCE / STATUS'],
    row: patternRow,
    kind: 'RECURRING PATTERNS',
  },
  clubs: {
    head: ['CLUB / AREA', 'RECURRING PATTERN', 'ABOUT', 'RESEARCH STATUS'],
    row: clubRow,
    kind: 'CLUBS',
    headClass: 'table-head club-row',
  },
};
function render() {
  const rows = currentRows();
  const layout = LAYOUT[view];
  const shown = Math.min(rows.length, limit);
  let html =
    tableHead(layout.head, layout.headClass) +
    rows.slice(0, limit).map(layout.row).join('');
  if (!rows.length) {
    const explanation =
      view === 'events' && $('#period').value === 'upcoming'
        ? 'No upcoming dated listings match. The research may be out of date; try Regular runs or All dates.'
        : 'No matches in this snapshot. Try another filter or search.';
    const reset = filtersChanged()
      ? '<button type="button" class="reset" data-reset>RESET FILTERS</button>'
      : '';
    html += `<div class="empty"><p>${explanation}</p>${reset}</div>`;
  }
  $('#results').innerHTML = html;
  $('#result-count').textContent =
    `${rows.length} ${layout.kind} · ${shown} SHOWN`;
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

function showRace(race) {
  const distances = race.distances
    .map(
      (item) =>
        `<li><b>${escapeHTML(item.name)}</b> · ${escapeHTML(timeLabel(item.start_time))}${item.location ? ` · ${escapeHTML(item.location)}` : ''}</li>`,
    )
    .join('');
  const links = [race.source_url, ...race.additional_sources]
    .map((url) => `<li>${external(url)}</li>`)
    .join('');
  return {
    title: race.title,
    html: `<div class="detail-label">${race.needs_review ? 'VERIFY DETAILS · ' : ''}RACE RESEARCH · CHECKED ${escapeHTML(race.checked_on)}</div><h2 class="detail-title" id="detail-title">${escapeHTML(race.title)}</h2><div class="detail-sub">${escapeHTML(race.city)} · ${race.area === 'sf' ? 'San Francisco' : 'Bay Area'}</div>${detailRow('DATE', escapeHTML(raceDate(race)))}${detailRow('START AREA', escapeHTML(race.location))}${detailRow('DISTANCES & START TIMES · PACIFIC TIME', `<ul>${distances}</ul>`)}${detailRow('DETAILS', escapeHTML(race.notes || 'Check the organizer for registration, course and current details.'))}${detailRow('SOURCES & FRESHNESS', `<ul>${links}</ul><span class="pattern-warning">Details are a snapshot and can change. Confirm with the organizer.</span>`)}<div class="detail-actions"><a class="detail-link" href="${escapeHTML(race.source_url)}" target="_blank" rel="noopener noreferrer">OPEN RACE SOURCE ↗</a>${permalink('race', race.id)}</div>`,
  };
}
function showEvent(event) {
  const source = sourceById.get(event.source_id);
  const options = event.meeting_options?.length
    ? detailRow(
        'ALTERNATIVE MEETING OPTIONS',
        `<ul>${event.meeting_options
          .map(
            (option) =>
              `<li>${escapeHTML(timeLabel(option.local_time))} · ${escapeHTML(option.location)}${option.details ? ` · ${escapeHTML(option.details)}` : ''}</li>`,
          )
          .join('')}</ul>`,
      )
    : '';
  const extras = (event.additional_source_ids || [])
    .map((id) => detailRow('ADDITIONAL SOURCE', linkSource(id)))
    .join('');
  const sourceLink = source
    ? `<a class="detail-link" href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">OPEN EVENT SOURCE ↗</a>`
    : '';
  return {
    title: event.title,
    html: `<div class="detail-label">${event.status === 'unconfirmed' ? 'UNCONFIRMED LEAD' : 'PUBLISHED DATED LISTING'} · CHECKED ${escapeHTML(event.checked_on)}</div><h2 class="detail-title" id="detail-title">${escapeHTML(event.title)}</h2><div class="detail-sub"><a href="?club=${encodeURIComponent(event.club_id)}">${escapeHTML(clubName(event.club_id))} ↗</a></div>${detailRow('DATE & TIME', `${escapeHTML(dateInfo(event.starts_at_local))} · ${escapeHTML(timeLabel(event.starts_at_local.slice(11, 16)))} · San Francisco time`)}${detailRow('MEETING PLACE', meetingPlace(event))}${options}${practicalDetails(event)}${detailRow('DETAILS', escapeHTML(event.notes || 'See source for route, pace and other details.'))}${detailRow('SOURCE & FRESHNESS', `${linkSource(event.source_id)}<br><span class="pattern-warning">Confirm the current event and any changes before attending.</span>`)}${extras}<div class="detail-actions">${sourceLink}${permalink('event', event.id)}</div>`,
  };
}
function showPattern(pattern) {
  const dateBounds =
    pattern.valid_from || pattern.valid_until
      ? ` · effective ${escapeHTML(pattern.valid_from || 'unknown start')} to ${escapeHTML(pattern.valid_until || 'unknown end')}`
      : '';
  return {
    title: pattern.label,
    html: `<div class="detail-label">${patternStatus(pattern)} · CHECKED ${escapeHTML(pattern.checked_on)}</div><h2 class="detail-title" id="detail-title">${escapeHTML(pattern.label)}</h2><div class="detail-sub"><a href="?club=${encodeURIComponent(pattern.club_id)}">${escapeHTML(clubName(pattern.club_id))} ↗</a></div>${detailRow('REPORTED SCHEDULE', `${escapeHTML(showDays(pattern.days))} · ${escapeHTML(timeLabel(pattern.local_time))} · ${escapeHTML(pattern.frequency)}${dateBounds}`)}${detailRow('MEETING PLACE', meetingPlace(pattern))}${practicalDetails(pattern)}${detailRow('DETAILS', escapeHTML(pattern.notes || 'See source for details.'))}${detailRow('SOURCE & FRESHNESS', `${linkSource(pattern.source_id)}<br><span class="pattern-warning">A recurring pattern is not confirmation that any particular run is happening.</span>`)}<div class="detail-actions">${permalink('pattern', pattern.id)}</div>`,
  };
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
    : 'No upcoming published runs recorded. Check the club’s update sources; coverage may be incomplete.';
  const patternHTML = patterns.length
    ? `<ul>${patterns
        .map(
          (item) =>
            `<li><a href="?pattern=${encodeURIComponent(item.id)}"><b>${escapeHTML(showDays(item.days))} · ${escapeHTML(timeLabel(item.local_time))}</b></a> · ${escapeHTML(item.frequency)}${patternDates(item) ? `<br><span class="pattern-warning">${escapeHTML(patternStatus(item))} · ${escapeHTML(patternDates(item))}</span>` : ''}<br>${escapeHTML(item.location)}${item.status === 'needs_review' ? '<br><span class="pattern-warning">Needs review.</span>' : ''}${item.notes ? `<br><span class="pattern-warning">${escapeHTML(item.notes)}</span>` : ''}<br>${linkSource(item.source_id)}</li>`,
        )
        .join('')}</ul>`
    : 'No current or upcoming recurring schedule recorded.';
  const references = audit?.reference_source_ids?.length
    ? `<ul>${audit.reference_source_ids.map((id) => `<li>${linkSource(id)}</li>`).join('')}</ul>`
    : 'No source identified yet.';
  const review = audit?.review_due
    ? ` · next review due ${escapeHTML(audit.review_due)}`
    : '';
  return {
    title: club.name,
    html: `<div class="detail-label">CLUB DIRECTORY · ${escapeHTML(club.geography || 'AREA UNKNOWN')}</div><h2 class="detail-title" id="detail-title">${escapeHTML(club.name)}</h2><div class="detail-sub">${upcoming.length} upcoming published ${upcoming.length === 1 ? 'run' : 'runs'} in this snapshot</div>${detailRow('UPCOMING DATED RUNS', upcomingHTML)}${detailRow('ABOUT', escapeHTML(club.description || 'Details need further research.'))}${detailRow('RESEARCH NOTES', escapeHTML(audit?.notes || 'Details need further research.'))}${detailRow('RECURRING PATTERNS · CONFIRM BEFORE GOING', patternHTML)}${detailRow('UPDATE SOURCES', references)}${detailRow('LAST CHECKED', `${escapeHTML(audit?.checked_on || club.checked_on)}${review}`)}<div class="detail-actions">${permalink('club', club.id)}</div>`,
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
    stale || unknown ? 'CHECK RESEARCH DATES' : 'RESEARCH SNAPSHOT';
  if (!total) {
    $('#snapshot-text').textContent =
      'No matching records to assess. Listings are not live; check each source before heading out.';
    return;
  }
  const parts = [];
  if (stale)
    parts.push(`${stale} checked more than ${STALE_AFTER_DAYS} days ago`);
  if (unknown) parts.push(`${unknown} with no check date`);
  const summary = parts.length
    ? `${parts.join('; ')} among ${total} matching records.`
    : `All ${total} matching records were checked within ${STALE_AFTER_DAYS} days.`;
  $('#snapshot-text').textContent =
    `${summary} Listings are not live; confirm details with the source.`;
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
    fetch(`data/${name}.json`).then((response) => {
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
    $('#count-sources').textContent = sources.length;
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
