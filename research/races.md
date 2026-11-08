# Race research and maintenance

`data/races.json` is a manually researched starting index of San Francisco races and selected nearby Bay Area events. It is not exhaustive, live, or an assertion that registration is open. Races are separate from club events and are not included in the club-run RSS feed.

Each record represents one race edition or an explicitly labeled multi-day weekend. It has a stable ID, date and optional end date, city, broad area (`sf` or `bay`), general location, distances with categories, optional individual start times and locations, an HTTPS primary source, optional additional sources, checked date, status, review flag, and notes. A `needs_review` flag makes discrepancies or incomplete edition details visible in the index. Dates and times are local to the Bay Area. Null times mean unknown; do not invent midnight or use a prior year’s schedule. List only distances and start times supported by a source and describe weekend or event-specific dates in notes.

## Updating

1. Start with organizer or organizer-hosted registration pages. Use directories such as [SF Runs](https://www.sfruns.com/) and [Races Near](https://racesnear.com/bay-area/) to discover leads, then check the organizer; label any secondary evidence or discrepancies in notes and include the relevant links.
2. Recheck the date, location, distance and starts for the correct edition. Explicitly distinguish an event start from packet pickup or an entire weekend. Retain nulls for unknown starts; do not assume a race has happened just because it is annual.
3. Update status when cancelled or postponed, preserve stable IDs, update the check date, and record uncertainty or access limitations. Check registration and costs on the organizer’s page rather than assuming they stay current.
4. Run `npm run verify` and regenerate the feed with `npm run feed` when data changes; races are intentionally excluded from that feed. Review the race view at desktop and mobile sizes before merging.

The initial research was checked November 8, 2026. DSE’s organizer schedule lists Rainbow Falls Festivus for December 13 while SF Runs lists December 20. The San Francisco Half Marathon race-information page lists the half and 5K while an older registration page mentions a 10K. Both are documented in the respective records and should be rechecked.
