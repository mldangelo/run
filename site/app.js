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
const days = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
let clubs = [],
  events = [],
  schedules = [],
  sources = [],
  audits = [],
  races = [];
let view = 'events',
  limit = 25;
const clubById = (id) => clubs.find((club) => club.id === id);
const sourceById = (id) => sources.find((source) => source.id === id);
const showDays = (values) =>
  values.map((day) => day.slice(0, 3).toUpperCase()).join(' / ');
function timeLabel(time) {
  if (!time) return 'Time unknown';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function dateInfo(localDate) {
  const date = new Date(`${localDate.slice(0, 10)}T12:00:00Z`);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function linkSource(id) {
  const source = sourceById(id);
  if (!source) return '';
  const check = source.last_checked
    ? ` · checked ${escapeHTML(source.last_checked)}`
    : ' · not checked';
  return `<a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.url)}</a> <span class="pattern-warning">(${escapeHTML(source.authority)} source · ${escapeHTML(source.access.replaceAll('_', ' '))}${check})</span>`;
}
function detailRow(label, contents) {
  return `<div class="detail-row"><strong>${escapeHTML(label)}</strong>${contents}</div>`;
}
function setView(next) {
  view = next;
  limit = 25;
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const meta = {
    events: [
      '01',
      'Dated runs',
      'Upcoming individual listings found in our research. Times are San Francisco time.',
      'DATED LISTINGS · VERIFY WITH THE SOURCE',
    ],
    patterns: [
      '02',
      'Regular runs',
      'Recurring schedules are leads, not confirmation of a particular date. Check the source for changes.',
      'RECURRING PATTERNS · VERIFY BEFORE GOING',
    ],
    races: [
      '04',
      'Races on the calendar',
      'A researched starting point for San Francisco and nearby races. Dates and start times can change; check the organizer before registering.',
      'RACE LISTINGS · VERIFY WITH THE ORGANIZER',
    ],
    clubs: [
      '03',
      'Meet the clubs',
      'Explore the clubs and the sources we use to track them.',
      'PATTERNS ARE LEADS · CHECK WITH THE CLUB',
    ],
  }[view];
  $('#section-number').textContent = meta[0];
  $('#section-title').innerHTML = `${meta[1]}<span class="dot">.</span>`;
  $('#view-note').textContent = meta[2];
  $('#context-note').textContent = meta[3];
  for (const id of ['period-wrap', 'month-wrap'])
    $(`#${id}`).hidden = !['events', 'races'].includes(view);
  $('#status-wrap').hidden = view !== 'events';
  $('#distance-wrap').hidden = view !== 'races';
  for (const id of ['day-wrap', 'time-wrap'])
    $(`#${id}`).hidden = view === 'clubs';
  $('#area-wrap').hidden = !['clubs', 'races'].includes(view);
  render();
}
function eventRow(event) {
  const club = clubById(event.club_id);
  const uncertain =
    event.status === 'unconfirmed'
      ? '<span class="tag uncertain">UNCONFIRMED</span> '
      : '';
  return `<button class="row" data-event="${escapeHTML(event.id)}"><span class="row-date">${escapeHTML(dateInfo(event.starts_at_local))}<span>${escapeHTML(timeLabel(event.starts_at_local.slice(11, 16)))}</span></span><span class="row-title">${escapeHTML(event.title)}<small>${escapeHTML(club?.name || event.club_id)}</small></span><span class="row-place">${escapeHTML(event.location)}<small>Checked ${escapeHTML(event.checked_on)}</small></span><span class="row-note">${uncertain}${escapeHTML(shorten(event.notes || 'See source for details.'))}</span><span class="row-action">DETAILS ↗</span></button>`;
}
function patternRow(pattern) {
  const club = clubById(pattern.club_id);
  const status =
    pattern.status === 'needs_review' ? 'NEEDS REVIEW' : 'RECURRING LEAD';
  const badge = pattern.status === 'needs_review' ? 'uncertain' : '';
  const evidence =
    pattern.evidence === 'organizer_pattern'
      ? 'Club source'
      : 'Directory source';
  return `<button class="row" data-pattern="${escapeHTML(pattern.id)}"><span class="row-date">${escapeHTML(showDays(pattern.days))}<span>${escapeHTML(timeLabel(pattern.local_time))}</span></span><span class="row-title">${escapeHTML(pattern.label)}<small>${escapeHTML(club?.name || pattern.club_id)} · ${escapeHTML(pattern.frequency)}</small></span><span class="row-place">${escapeHTML(pattern.location)}<small>${escapeHTML(evidence)} · checked ${escapeHTML(pattern.checked_on)}</small></span><span class="row-note"><span class="tag ${badge}">${status}</span> ${escapeHTML(shorten(pattern.notes || '', 75))}</span><span class="row-action">DETAILS ↗</span></button>`;
}
function clubRow(club) {
  const audit = audits.find((item) => item.club_id === club.id);
  const patterns = schedules.filter((item) => item.club_id === club.id);
  const pattern = patterns.length
    ? patterns
        .slice(0, 2)
        .map(
          (item) =>
            `${showDays(item.days)}${item.local_time ? ` ${timeLabel(item.local_time)}` : ''}${item.status === 'needs_review' ? ' (review)' : ''}`,
        )
        .join(' · ')
    : 'Schedule not found';
  const status =
    {
      identity_unresolved: 'IDENTITY UNRESOLVED',
      dated_event_found: 'DATED EVENT FOUND',
      pattern_found: 'PATTERN FOUND',
    }[audit?.result] || 'NEEDS RESEARCH';
  return `<button class="row club-row" data-club="${escapeHTML(club.id)}"><span class="row-title">${escapeHTML(club.name)}<small>${escapeHTML(club.geography || 'Unknown area')}</small></span><span class="row-place">${escapeHTML(pattern)}<small>${patterns.length ? 'Recurring pattern · verify' : ''}</small></span><span class="row-note">${escapeHTML(shorten(club.description || audit?.notes || 'Details need further research.', 115))}</span><span><span class="tag ${audit?.result === 'identity_unresolved' ? 'uncertain' : ''}">${status}</span></span><span class="row-action">DETAILS ↗</span></button>`;
}
function raceDate(race) {
  return race.end_date
    ? `${dateInfo(race.date)} – ${dateInfo(race.end_date)}`
    : dateInfo(race.date);
}
function raceRow(race) {
  const matching = race.distances.filter(
    (item) =>
      ($('#distance').value === 'all' ||
        item.category === $('#distance').value) &&
      RunData.timeMatches(item.start_time, $('#time').value),
  );
  const starts = [
    ...new Set(matching.map((item) => item.start_time).filter(Boolean)),
  ].sort();
  const more =
    starts.length > 1 ||
    (starts.length && matching.some((item) => !item.start_time));
  const time = starts.length
    ? `${timeLabel(starts[0])}${more ? ' + more' : ''}`
    : 'Time not listed';
  const review = race.needs_review
    ? '<span class="tag uncertain">VERIFY DETAILS</span> '
    : '';
  return `<button class="row" data-race="${escapeHTML(race.id)}"><span class="row-date">${escapeHTML(raceDate(race))}<span>${escapeHTML(time)}</span></span><span class="row-title">${escapeHTML(race.title)}<small>${escapeHTML(race.city)}</small></span><span class="row-place">${escapeHTML(race.location)}<small>Checked ${escapeHTML(race.checked_on)}</small></span><span class="row-note">${review}${escapeHTML(race.distances.map((item) => item.name).join(' · '))}</span><span class="row-action">DETAILS ↗</span></button>`;
}

function render() {
  const query = $('#search').value.trim().toLowerCase();
  const day = $('#day').value,
    time = $('#time').value;
  let rows, heading, rowHTML, kind;
  if (view === 'events') {
    const filter = {
      period: $('#period').value,
      status: $('#status').value,
      month: $('#month').value,
      day,
      time,
    };
    const now = new Date();
    rows = events
      .filter(
        (event) =>
          RunData.eventMatches(event, filter, now) &&
          `${event.title} ${event.location} ${event.notes || ''} ${clubById(event.club_id)?.name || ''}`
            .toLowerCase()
            .includes(query),
      )
      .sort((a, b) => a.starts_at_local.localeCompare(b.starts_at_local));
    heading =
      '<div class="table-head"><span>DATE / TIME</span><span>RUN / CLUB</span><span>MEETING PLACE</span><span>DETAILS / STATUS</span><span></span></div>';
    rowHTML = eventRow;
    kind = 'DATED LISTINGS';
  } else if (view === 'races') {
    const filter = {
      period: $('#period').value,
      month: $('#month').value,
      day,
      time,
      area: $('#area').value,
      distance: $('#distance').value,
    };
    rows = races
      .filter(
        (race) =>
          RunData.raceMatches(race, filter, new Date()) &&
          `${race.title} ${race.city} ${race.location} ${race.notes} ${race.distances.map((item) => item.name).join(' ')}`
            .toLowerCase()
            .includes(query),
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
      );
    heading =
      '<div class="table-head"><span>DATE / TIME</span><span>RACE / CITY</span><span>START AREA</span><span>DISTANCES</span><span></span></div>';
    rowHTML = raceRow;
    kind = 'RACES';
  } else if (view === 'patterns') {
    rows = schedules
      .filter(
        (pattern) =>
          RunData.patternMatches(pattern, { day, time }) &&
          `${pattern.label} ${pattern.location} ${pattern.notes || ''} ${clubById(pattern.club_id)?.name || ''}`
            .toLowerCase()
            .includes(query),
      )
      .sort(
        (a, b) =>
          days.indexOf(a.days[0]) - days.indexOf(b.days[0]) ||
          (a.local_time || '99:99').localeCompare(b.local_time || '99:99'),
      );
    heading =
      '<div class="table-head"><span>DAY / TIME</span><span>RUN / CLUB</span><span>MEETING PLACE</span><span>EVIDENCE / STATUS</span><span></span></div>';
    rowHTML = patternRow;
    kind = 'RECURRING PATTERNS';
  } else {
    const area = $('#area').value;
    rows = clubs.filter((club) => {
      const geo = (club.geography || '').toLowerCase();
      const match =
        area === 'all' ||
        (area === 'sf' && geo.includes('san francisco')) ||
        (area === 'bay' &&
          !geo.includes('san francisco') &&
          geo !== 'unknown') ||
        (area === 'unknown' && (!geo || geo === 'unknown'));
      return (
        match &&
        `${club.name} ${club.geography} ${club.description}`
          .toLowerCase()
          .includes(query)
      );
    });
    heading =
      '<div class="table-head club-row"><span>CLUB / AREA</span><span>RECURRING PATTERN</span><span>ABOUT</span><span>RESEARCH STATUS</span><span></span></div>';
    rowHTML = clubRow;
    kind = 'CLUBS';
  }
  $('#results').innerHTML =
    heading + rows.slice(0, limit).map(rowHTML).join('');
  if (!rows.length) {
    const explanation =
      view === 'events' && $('#period').value === 'upcoming'
        ? 'No upcoming dated listings match. The research may be out of date; try Regular runs or All dates.'
        : 'No matches in this snapshot. Try another filter or search.';
    $('#results').insertAdjacentHTML(
      'beforeend',
      `<p class="empty">${explanation}</p>`,
    );
  }
  $('#result-count').textContent =
    `${rows.length} ${kind} · ${Math.min(rows.length, limit)} SHOWN`;
  $('#page-label').textContent = rows.length
    ? `SHOWING ${Math.min(rows.length, limit)} OF ${rows.length}`
    : '';
  $('#more').hidden = rows.length <= limit;
}
function showRace(race) {
  const distances = race.distances
    .map(
      (item) =>
        `<li><b>${escapeHTML(item.name)}</b> · ${escapeHTML(timeLabel(item.start_time))}${item.location ? ` · ${escapeHTML(item.location)}` : ''}</li>`,
    )
    .join('');
  const sources = [race.source_url, ...race.additional_sources]
    .map(
      (url) =>
        `<li><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(url)}</a></li>`,
    )
    .join('');
  $('#detail-content').innerHTML =
    `<div class="detail-label">${race.needs_review ? 'VERIFY DETAILS · ' : ''}RACE RESEARCH · CHECKED ${escapeHTML(race.checked_on)}</div><h2 class="detail-title" id="detail-title">${escapeHTML(race.title)}</h2><div class="detail-sub">${escapeHTML(race.city)} · ${race.area === 'sf' ? 'SAN FRANCISCO' : 'BAY AREA'}</div>${detailRow('DATE', escapeHTML(raceDate(race)))}${detailRow('START AREA', escapeHTML(race.location))}${detailRow('DISTANCES & START TIMES · PACIFIC TIME', `<ul>${distances}</ul>`)}${detailRow('DETAILS', escapeHTML(race.notes || 'Check the organizer for registration, course and current details.'))}${detailRow('SOURCES & FRESHNESS', `<ul>${sources}</ul><span class="pattern-warning">Details are a snapshot and can change. Confirm with the organizer.</span>`)}<a class="detail-link" href="${escapeHTML(race.source_url)}" target="_blank" rel="noopener noreferrer">OPEN RACE SOURCE ↗</a><a class="permalink" href="?race=${encodeURIComponent(race.id)}">PERMALINK ↗</a>`;
  $('#detail').showModal();
}
function showEvent(event) {
  const club = clubById(event.club_id),
    source = sourceById(event.source_id);
  const options = event.meeting_options?.length
    ? detailRow(
        'ALTERNATIVE MEETING OPTIONS',
        '<ul>' +
          event.meeting_options
            .map(
              (option) =>
                `<li>${escapeHTML(timeLabel(option.local_time))} · ${escapeHTML(option.location)}${option.details ? ` · ${escapeHTML(option.details)}` : ''}</li>`,
            )
            .join('') +
          '</ul>',
      )
    : '';
  const extras = (event.additional_source_ids || [])
    .map((id) => detailRow('ADDITIONAL SOURCE', linkSource(id)))
    .join('');
  $('#detail-content').innerHTML =
    `<div class="detail-label">${event.status === 'unconfirmed' ? 'UNCONFIRMED LEAD' : 'PUBLISHED DATED LISTING'} · CHECKED ${escapeHTML(event.checked_on)}</div><h2 class="detail-title" id="detail-title">${escapeHTML(event.title)}</h2><div class="detail-sub">${escapeHTML(club?.name || event.club_id)}</div>${detailRow('DATE & TIME', `${escapeHTML(dateInfo(event.starts_at_local))} · ${escapeHTML(timeLabel(event.starts_at_local.slice(11, 16)))} · San Francisco time`)}${detailRow('MEETING PLACE', escapeHTML(event.location))}${options}${detailRow('DETAILS', escapeHTML(event.notes || 'See source for route, pace and other details.'))}${detailRow('SOURCE & FRESHNESS', `${linkSource(event.source_id)}<br><span class="pattern-warning">Confirm the current event and any changes before attending.</span>`)}${extras}${source ? `<a class="detail-link" href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">OPEN EVENT SOURCE ↗</a>` : ''}`;
  $('#detail-content').insertAdjacentHTML(
    'beforeend',
    `<a class="permalink" href="?event=${encodeURIComponent(event.id)}">PERMALINK ↗</a>`,
  );
  $('#detail').showModal();
}
function showPattern(pattern) {
  const club = clubById(pattern.club_id);
  const dateBounds =
    pattern.valid_from || pattern.valid_until
      ? ` · effective ${escapeHTML(pattern.valid_from || 'unknown start')} to ${escapeHTML(pattern.valid_until || 'unknown end')}`
      : '';
  $('#detail-content').innerHTML =
    `<div class="detail-label">${pattern.status === 'needs_review' ? 'NEEDS REVIEW' : 'RECURRING PATTERN'} · CHECKED ${escapeHTML(pattern.checked_on)}</div><h2 class="detail-title" id="detail-title">${escapeHTML(pattern.label)}</h2><div class="detail-sub">${escapeHTML(club?.name || pattern.club_id)}</div>${detailRow('REPORTED SCHEDULE', `${escapeHTML(showDays(pattern.days))} · ${escapeHTML(timeLabel(pattern.local_time))} · ${escapeHTML(pattern.frequency)}${dateBounds}`)}${detailRow('MEETING PLACE', escapeHTML(pattern.location))}${detailRow('DETAILS', escapeHTML(pattern.notes || 'See source for details.'))}${detailRow('SOURCE & FRESHNESS', `${linkSource(pattern.source_id)}<br><span class="pattern-warning">A recurring pattern is not confirmation that any particular run is happening.</span>`)}`;
  $('#detail-content').insertAdjacentHTML(
    'beforeend',
    `<a class="permalink" href="?pattern=${encodeURIComponent(pattern.id)}">PERMALINK ↗</a>`,
  );
  $('#detail').showModal();
}
function showClub(club) {
  const audit = audits.find((item) => item.club_id === club.id);
  const patterns = schedules.filter((item) => item.club_id === club.id);
  const eventCount = events.filter(
    (item) => item.club_id === club.id && item.status === 'published',
  ).length;
  const patternHTML = patterns.length
    ? '<ul>' +
      patterns
        .map(
          (item) =>
            `<li><b>${escapeHTML(showDays(item.days))} · ${escapeHTML(timeLabel(item.local_time))}</b> · ${escapeHTML(item.frequency)}<br>${escapeHTML(item.location)}${item.status === 'needs_review' ? '<br><span class="pattern-warning">Needs review.</span>' : ''}${item.notes ? `<br><span class="pattern-warning">${escapeHTML(item.notes)}</span>` : ''}<br>${linkSource(item.source_id)}</li>`,
        )
        .join('') +
      '</ul>'
    : 'No recurring schedule recorded.';
  const references = audit?.reference_source_ids?.length
    ? '<ul>' +
      audit.reference_source_ids
        .map((id) => `<li>${linkSource(id)}</li>`)
        .join('') +
      '</ul>'
    : 'No source identified yet.';
  $('#detail-content').innerHTML =
    `<div class="detail-label">CLUB DIRECTORY · ${escapeHTML(club.geography || 'AREA UNKNOWN')}</div><h2 class="detail-title" id="detail-title">${escapeHTML(club.name)}</h2><div class="detail-sub">${eventCount} published dated ${eventCount === 1 ? 'record' : 'records'} in this snapshot</div>${detailRow('ABOUT', escapeHTML(club.description || 'Details need further research.'))}${detailRow('RESEARCH NOTES', escapeHTML(audit?.notes || 'Details need further research.'))}${detailRow('RECURRING PATTERNS · CONFIRM BEFORE GOING', patternHTML)}${detailRow('UPDATE SOURCES', references)}${detailRow('LAST CHECKED', escapeHTML(audit?.checked_on || club.checked_on))}`;
  $('#detail-content').insertAdjacentHTML(
    'beforeend',
    `<a class="permalink" href="?club=${encodeURIComponent(club.id)}">PERMALINK ↗</a>`,
  );
  $('#detail').showModal();
}
document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-view]');
  const dated = event.target.closest('[data-event]');
  const recurring = event.target.closest('[data-pattern]');
  const club = event.target.closest('[data-club]');
  const race = event.target.closest('[data-race]');
  if (tab) setView(tab.dataset.view);
  if (dated) showEvent(events.find((item) => item.id === dated.dataset.event));
  if (recurring)
    showPattern(
      schedules.find((item) => item.id === recurring.dataset.pattern),
    );
  if (club) showClub(clubs.find((item) => item.id === club.dataset.club));
  if (race) showRace(races.find((item) => item.id === race.dataset.race));
});
for (const id of [
  'search',
  'period',
  'month',
  'day',
  'time',
  'status',
  'area',
  'distance',
])
  $(`#${id}`).addEventListener(id === 'search' ? 'input' : 'change', () => {
    limit = 25;
    render();
  });
$('#more').addEventListener('click', () => {
  limit += 25;
  render();
});
$('.close').addEventListener('click', () => $('#detail').close());
$('#detail').addEventListener('click', (event) => {
  if (event.target === $('#detail')) $('#detail').close();
});
document.addEventListener('keydown', (event) => {
  if (
    event.key === '/' &&
    !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
    !$('#detail').open
  ) {
    event.preventDefault();
    $('#search').focus();
  }
});
Promise.all(
  ['clubs', 'events', 'schedules', 'sources', 'audits', 'races'].map((name) =>
    fetch(`data/${name}.json`).then((response) => {
      if (!response.ok) throw Error(name);
      return response.json();
    }),
  ),
)
  .then((data) => {
    [clubs, events, schedules, sources, audits, races] = data;
    for (const month of [
      ...new Set([
        ...events.map((event) => event.starts_at_local.slice(0, 7)),
        ...races.flatMap((race) => [
          race.date.slice(0, 7),
          ...(race.end_date ? [race.end_date.slice(0, 7)] : []),
        ]),
      ]),
    ].sort()) {
      const option = document.createElement('option');
      option.value = month;
      option.textContent = new Date(`${month}-01T12:00:00Z`).toLocaleDateString(
        'en-US',
        { month: 'long', year: 'numeric', timeZone: 'UTC' },
      );
      $('#month').append(option);
    }
    const count = events.filter((event) => event.status === 'published').length;
    $('#count-clubs').textContent = clubs.length;
    $('#count-events').textContent = count;
    $('#count-sources').textContent = sources.length;
    $('#event-total').textContent = count;
    $('#pattern-total').textContent = schedules.length;
    $('#club-total').textContent = clubs.length;
    $('#race-total').textContent = races.filter(
      (race) => race.status === 'scheduled',
    ).length;
    setView('events');
    const query = new URLSearchParams(window.location.search);
    const linkedEvent = events.find((event) => event.id === query.get('event'));
    const linkedPattern = schedules.find(
      (pattern) => pattern.id === query.get('pattern'),
    );
    const linkedClub = clubs.find((club) => club.id === query.get('club'));
    const linkedRace = races.find((race) => race.id === query.get('race'));
    if (linkedRace) setView('races');
    if (linkedEvent) showEvent(linkedEvent);
    else if (linkedPattern) showPattern(linkedPattern);
    else if (linkedClub) showClub(linkedClub);
    else if (linkedRace) showRace(linkedRace);
  })
  .catch(() => {
    $('#results').innerHTML =
      '<p class="error">Could not load the research data. Please try reloading this page.</p>';
    $('#result-count').textContent = 'DATA UNAVAILABLE';
  });
