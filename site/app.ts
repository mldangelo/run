/* The directory page: filters and URL state, rendering results, opening and
   closing the detail dialog, and loading the listings. Rows (rows.ts),
   dialog contents (details.ts) and text helpers (format.ts, listing.ts)
   live in their own modules. */
import type {
  Club,
  DatedEvent,
  Filter,
  Race,
  Run,
  Schedule,
  SiteAudit,
  SiteSource,
} from '../scripts/types.mts';
import {
  copyListingLink,
  downloadCalendar,
  showClub,
  showEvent,
  showPattern,
  showRace,
} from './details.js';
import { $, type Control, DEFAULTS } from './dom.js';
import {
  AREA_NAMES,
  dateInfo,
  escapeHTML,
  monthLabel,
  shortDate,
  tableHead,
} from './format.js';
import { visiblePatterns } from './listing.js';
import * as RunData from './model.js';
import {
  clubRow,
  eventRow,
  patternRow,
  type RowOptions,
  raceRow,
} from './rows.js';
import { clubName, clubNeighborhoods, store } from './store.js';

type View = 'events' | 'patterns' | 'clubs' | 'races';
type Listing = Club | DatedEvent | Schedule | Race;

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
      'area',
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
      'area',
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

let dataReady = false;
let loading = false;
let view: View = 'events';
let openRecord: { kind: string; id: string } | null = null,
  clubFilter = '';

/* ---------- Filters and URL state ---------- */

function controlValue(id: Control) {
  if (id === 'period' && $('#period').value === 'date')
    return $('#calendar-date').value;
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
        id === 'period' && $('#period').value === 'date'
          ? dateInfo(controlValue(id))
          : id === 'search'
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
    // Runs once had their own run_area control; old links still choose the area.
    const value =
      params.get(id) ?? (id === 'area' ? params.get('run_area') : null);
    const select = $(`#${id}`);
    if (id === 'period' && value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      $('#calendar-date').value = value;
      if ($('#calendar-date').value) {
        select.value = 'date';
        continue;
      }
    }
    const valid =
      value !== 'date' &&
      [...select.options].some(
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
  for (const item of [...store.events, ...store.schedules]) {
    const info = item.location_info;
    if (info?.neighborhood) areaOf.set(info.neighborhood, info.area);
  }
  const names = new Set(
    view === 'clubs'
      ? store.clubs.flatMap(clubNeighborhoods)
      : (view === 'events' ? store.events : store.schedules).flatMap(
          runNeighborhoods,
        ),
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
  for (const row of currentRows(currentFilter({ neighborhood: 'all' }))) {
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
        ? store.events.map((event) => event.starts_at_local.slice(0, 7))
        : store.races.flatMap((race) => [
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
function matchesRunFilters(item: Run, filter: Filter) {
  return (
    RunData.runLocationMatches(item, {
      area: filter.area,
      neighborhood: filter.neighborhood,
    }) &&
    RunData.runDetailsMatch(item, {
      distance: filter.run_distance,
      beginner: filter.beginner,
    })
  );
}

/* ---------- Rendering ---------- */

/* Every menu's value, as the model's matchers read them. */
function currentFilter(overrides: Partial<Filter> = {}) {
  return {
    ...Object.fromEntries(SELECTS.map((id) => [id, controlValue(id)])),
    ...overrides,
  } as Required<Filter>;
}
function currentRows(filter = currentFilter()): Listing[] {
  const query = $('#search').value;
  const now = new Date();
  if (view === 'events')
    return store.events
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
    return store.races
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
    return store.schedules
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
  return store.clubs.filter(
    (club) =>
      RunData.clubMatches(club, filter, store.placesByClub.get(club.id)) &&
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
  const exactDate =
    VIEWS[view].controls.includes('period') && $('#period').value === 'date';
  $('#calendar-date-wrap').hidden = !exactDate;
  const title =
    view === 'events' && exactDate ? 'Runs on the calendar' : VIEWS[view].title;
  $('#section-title').innerHTML =
    `${escapeHTML(title)}<span class="dot">.</span>`;
  $('#reset-filters').hidden = !filtersChanged();
  const advancedCount = advancedFiltersChanged();
  $('#filter-summary').textContent = advancedCount
    ? ` · ${advancedCount} active`
    : '';
  if (VIEWS[view].controls.includes('neighborhood'))
    populateNeighborhoods(neighborhoodCounts());
  renderActiveFilters();
  const filter = currentFilter();
  const rows = currentRows(filter);
  const layout = LAYOUT[view] as {
    head: string[];
    headClass?: string;
    kind: string[];
    row(item: Listing, options: RowOptions): string;
  };
  let previousDay = '';
  const rendered = rows
    .map((item) => {
      const day =
        view === 'events'
          ? (item as DatedEvent).starts_at_local.slice(0, 10)
          : view === 'races'
            ? exactDate
              ? filter.period
              : (item as Race).date
            : '';
      const heading =
        day && day !== previousDay
          ? `<h3 class="date-heading">${escapeHTML(dateInfo(day))}</h3>`
          : '';
      previousDay = day;
      return heading + layout.row(item, { filter, exactDate });
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
  /* How many listed clubs have a run we found, rather than repeating the
     view's note that the rest may still be active. */
  const clubCoverage = (clubs: Club[]) => {
    const listed = clubs.filter((club) =>
      store.upcomingByClub.get(club.id),
    ).length;
    return `${listed} of ${plural(clubs.length, 'club', 'clubs')} ${listed === 1 ? 'has' : 'have'} an upcoming run listed.`;
  };
  const beginners = $('#beginner').value === 'welcome';
  $('#coverage-note').textContent = !rows.length
    ? ''
    : ['events', 'patterns'].includes(view)
      ? beginners
        ? 'Only runs whose organizer says beginners are welcome. Other runs may suit you too.'
        : `${plural(rows.length, 'run', 'runs')} from ${plural(covered, 'club', 'clubs')}. ${missing ? `${missing} don’t say whether beginners are welcome.` : ''}`.trim()
      : view === 'clubs'
        ? clubCoverage(rows as Club[])
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
  event: recordType('events', () => store.events, showEvent),
  pattern: recordType('patterns', () => store.schedules, showPattern),
  club: recordType('clubs', () => store.clubs, showClub),
  race: recordType('races', () => store.races, showRace),
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
    store.races.find((race) => race.former_event_ids?.includes(formerEvent));
  if (canonicalRace) {
    params.delete('event');
    params.set('race', canonicalRace.id);
  }
  clubFilter = store.clubById.has(params.get('for_club') || '')
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
  const copy = event.target.closest<HTMLButtonElement>('[data-copy-link]');
  if (copy) {
    void copyListingLink(copy);
    return;
  }
  const calendar = event.target.closest<HTMLButtonElement>('[data-calendar]');
  if (calendar) {
    downloadCalendar(calendar);
    return;
  }
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
$('#period').addEventListener('change', () => {
  if ($('#period').value === 'date') {
    $('#calendar-date').value ||= RunData.localMinute(new Date()).slice(0, 10);
    $('#calendar-date-wrap').hidden = false;
    $('#calendar-date').focus();
  }
});
$('#calendar-date').addEventListener('change', () => {
  if (!$('#calendar-date').value || !$('#calendar-date').validity.valid) {
    $('#calendar-date').value = '';
    $('#period').value = DEFAULTS.period;
    $('#period').focus();
  }
  render();
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
      : store.auditByClub.get(item.id)?.checked_on,
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
      // Sources and audits come from generated site files: sources carry
      // their derived check dates, and audits leave out research logs.
      [
        'clubs',
        'events',
        'schedules',
        'site-sources',
        'site-audits',
        'races',
      ].map((name) =>
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
    const [clubs, events, schedules, sources, audits, races] = data as [
      Club[],
      DatedEvent[],
      Schedule[],
      SiteSource[],
      SiteAudit[],
      Race[],
    ];
    const now = new Date();
    const upcoming = events.filter((event) =>
      RunData.eventMatches(event, DEFAULTS, now),
    );
    Object.assign(store, {
      clubs,
      events,
      schedules,
      sources,
      audits,
      races,
      clubById: new Map(clubs.map((club) => [club.id, club])),
      sourceById: new Map(sources.map((source) => [source.id, source])),
      auditByClub: new Map(audits.map((audit) => [audit.club_id, audit])),
      patternsByClub: groupBy(schedules, 'club_id'),
      placesByClub: new Map(
        clubs.map((club) => [
          club.id,
          RunData.clubPlaces(club.id, schedules, events, now),
        ]),
      ),
      upcomingByClub: new Map(
        [...groupBy(upcoming, 'club_id')].map(([id, items]) => [
          id,
          items.length,
        ]),
      ),
    } satisfies typeof store);
    const upcomingEvents = upcoming.length;
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
