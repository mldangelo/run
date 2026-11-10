# Research notes

## Scope and method

Research pass: November 8, 2026. The initial list was transcribed from the project request, then checked against club websites and event pages, the San Francisco Marathon hub, SF Runs, Running Crews, Running Wylder's historical roundup, local reporting and Meetup. We added groups discovered during this pass if sources indicated an SF connection. The result is a discovery inventory, not a claim that every club has been found or that every club is currently active.

Useful discovery sources:

- [San Francisco Marathon club hub](https://www.thesfmarathon.com/community/runclubs/) — names, areas and meetup days; includes clubs outside the city. The Bay Area Run Club and Bay Area Run Crew have separate entries.
- [SF Runs](https://www.sfruns.com/) — local and Bay Area clubs, Meetup groups and store runs. Some links or schedule details may be stale.
- [Running Crews SF directory](https://runningcrews.com/run-clubs/san-francisco) — additional names; an SF listing is not proof of current meetings.
- [Running Wylder's September 1–7, 2025 roundup](https://runningwylder.co/blogs/run-club-roundup/run-club-round-up-09-01-09-07) — valuable local historical evidence, not a current schedule.
- [SoleMiles SF directory](https://www.solemiles.com/clubs/cities/san-francisco) and [RunVibe SF](https://runvibe.co/san-francisco) — cross-checks and leads.
- [Muni Run Club's event](https://luma.com/pfx7yq5p) and [Mission Local reporting](https://missionlocal.org/2026/10/muni-run-club/) — independently establish the transit-inspired SF group.

## Identity decisions and unresolved leads

Each club's identity decisions live in its audit notes in [`data/audits.json`](../data/audits.json): plausible matches to the requested name (kept in `user_supplied_name`), names that must not be merged, leads with no reliable match, and clubs that need an SF event check before being presented as city-based. Similar names alone never establish identity; keep user leads even when no match is found.

## Next pass

1. Verify each group's own profile, recent event and SF location; record evidence date separately from research date, including any access restrictions or conflicting schedules.
2. Add organizer-controlled join links, recurring runs as separate records, neighborhoods, accessibility and pace information, costs and registration requirements only when supported by a source.
3. Resolve uncertain names and duplicate candidates with direct evidence. Keep user leads even when no match is found.
4. Expand discovery using local store calendars, race-club partners, neighborhood groups, USATF and RRCA directories, and club event calendars. Search beyond social-media rankings and treat off-platform groups equally.
5. Decide the eventual publication boundary for regional clubs, fitness groups, one-off events and inactive/historical organizations. Refresh details before adding or changing live listings.

Avoid storing private contact details or scraping restricted pages. No outreach was performed in this research pass.
