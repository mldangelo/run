/* Pure date and filtering helpers shared by the website and its tests. */
((root) => {
  const SF = 'America/Los_Angeles';
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  /* Current wall-clock minute in a time zone, as YYYY-MM-DDTHH:MM. */
  function localMinute(now, timezone = SF) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const value = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
  }
  /* Calendar arithmetic on YYYY-MM-DD strings, independent of the viewer. */
  function addDays(isoDate, count) {
    const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }
  function daysBetween(fromDate, toDate) {
    const from = Date.parse(`${fromDate.slice(0, 10)}T12:00:00Z`);
    const to = Date.parse(`${toDate.slice(0, 10)}T12:00:00Z`);
    return Math.round((to - from) / 86400000);
  }
  function dayOf(localDate) {
    const [year, month, day] = localDate.slice(0, 10).split('-').map(Number);
    return days[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  }
  function timeMatches(time, wanted) {
    if (wanted === 'all') return true;
    if (!time) return wanted === 'unknown';
    if (wanted === 'unknown') return false;
    const hour = Number(time.slice(0, 2));
    return wanted === 'am' ? hour < 12 : hour >= 12;
  }
  function eventMatches(event, filter, now) {
    const current = localMinute(now, event.timezone);
    if (filter.status !== 'all' && event.status !== filter.status) return false;
    if (!['published', 'unconfirmed'].includes(event.status)) return false;
    if (
      filter.month !== 'all' &&
      !event.starts_at_local.startsWith(filter.month)
    )
      return false;
    if (filter.day !== 'all' && dayOf(event.starts_at_local) !== filter.day)
      return false;
    const date = event.starts_at_local.slice(0, 10);
    const today = current.slice(0, 10);
    if (filter.period === 'today' && date !== today) return false;
    if (filter.period === 'tomorrow' && date !== addDays(today, 1))
      return false;
    const times = [
      event.starts_at_local.slice(11, 16),
      ...(event.meeting_options || []).map((option) => option.local_time),
    ].filter(Boolean);
    return times.some((time) => {
      const occurrence = `${date}T${time}`;
      if (filter.period === 'upcoming' && occurrence < current) return false;
      if (filter.period === 'past' && occurrence >= current) return false;
      return timeMatches(time, filter.time);
    });
  }
  /* Effective dates are inclusive; recurrence remains a lead, never an event. */
  function patternState(pattern, now) {
    if (pattern.status === 'superseded') return 'superseded';
    const today = localMinute(now, pattern.timezone || SF).slice(0, 10);
    if (pattern.valid_from && today < pattern.valid_from) return 'future';
    if (pattern.valid_until && today > pattern.valid_until) return 'expired';
    return 'current';
  }
  function patternMatches(pattern, filter, now = new Date()) {
    if (['superseded', 'expired'].includes(patternState(pattern, now)))
      return false;
    if (filter.day !== 'all' && !pattern.days.includes(filter.day))
      return false;
    return timeMatches(pattern.local_time, filter.time);
  }
  function raceMatches(race, filter, now) {
    const today = localMinute(now).slice(0, 10);
    const tomorrow = addDays(today, 1);
    const end = race.end_date || race.date;
    if (race.status !== 'scheduled') return false;
    if (filter.period === 'upcoming' && end < today) return false;
    if (filter.period === 'past' && end >= today) return false;
    if (filter.period === 'today' && (race.date > today || end < today))
      return false;
    if (
      filter.period === 'tomorrow' &&
      (race.date > tomorrow || end < tomorrow)
    )
      return false;
    if (
      filter.month !== 'all' &&
      !race.date.startsWith(filter.month) &&
      !end.startsWith(filter.month)
    )
      return false;
    if (filter.day !== 'all') {
      // A weekend listing may span days. Check each calendar day in the range.
      let match = false;
      for (let day = race.date; day <= end; day = addDays(day, 1)) {
        if (dayOf(day) === filter.day) match = true;
      }
      if (!match) return false;
    }
    if (filter.area !== 'all' && race.area !== filter.area) return false;
    if (filter.format === 'small_group' && race.format !== 'small_group')
      return false;
    if (filter.format === 'other' && race.format === 'small_group')
      return false;
    return race.distances.some(
      (distance) =>
        (filter.distance === 'all' || distance.category === filter.distance) &&
        timeMatches(distance.start_time, filter.time),
    );
  }
  /* Broad club area. "San Francisco / Bay Area" belongs to both areas. */
  function clubMatches(club, filter) {
    const geo = (club.geography || '').trim().toLowerCase();
    const known = geo !== '' && geo !== 'unknown';
    if (filter.area === 'sf') return geo.includes('san francisco');
    if (filter.area === 'bay')
      return known && (!geo.includes('san francisco') || geo.includes('bay'));
    if (filter.area === 'unknown') return !known;
    return true;
  }
  /* Count research ages without allowing one fresh record to hide older ones. */
  function freshnessSummary(values, today, staleAfterDays) {
    const checked = values.filter(Boolean);
    return {
      total: values.length,
      unknown: values.length - checked.length,
      stale: checked.filter((date) => daysBetween(date, today) > staleAfterDays)
        .length,
    };
  }
  /* Most recent YYYY-MM-DD among the given values, or null. */
  function latestDate(values) {
    return values.filter(Boolean).sort().at(-1) ?? null;
  }
  const api = {
    localMinute,
    addDays,
    daysBetween,
    dayOf,
    timeMatches,
    eventMatches,
    patternMatches,
    patternState,
    freshnessSummary,
    raceMatches,
    clubMatches,
    latestDate,
  };
  root.RunData = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
