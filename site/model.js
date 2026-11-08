/* Pure date and filtering helpers shared by the website and its tests. */
((root) => {
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  function localMinute(now, timezone = 'America/Los_Angeles') {
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
    const next = new Date(`${today}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const tomorrow = next.toISOString().slice(0, 10);
    if (filter.period === 'today' && date !== today) return false;
    if (filter.period === 'tomorrow' && date !== tomorrow) return false;
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
  function patternMatches(pattern, filter) {
    if (filter.day !== 'all' && !pattern.days.includes(filter.day))
      return false;
    return timeMatches(pattern.local_time, filter.time);
  }
  function raceMatches(race, filter, now) {
    const today = localMinute(now).slice(0, 10);
    const next = new Date(`${today}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const tomorrow = next.toISOString().slice(0, 10);
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
      const day = new Date(`${race.date}T12:00:00Z`);
      const last = new Date(`${end}T12:00:00Z`);
      let match = false;
      while (day <= last) {
        if (dayOf(day.toISOString()) === filter.day) match = true;
        day.setUTCDate(day.getUTCDate() + 1);
      }
      if (!match) return false;
    }
    if (filter.area !== 'all' && race.area !== filter.area) return false;
    return race.distances.some(
      (distance) =>
        (filter.distance === 'all' || distance.category === filter.distance) &&
        timeMatches(distance.start_time, filter.time),
    );
  }
  const api = {
    localMinute,
    dayOf,
    timeMatches,
    eventMatches,
    patternMatches,
    raceMatches,
  };
  root.RunData = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
